import sodium from 'libsodium-wrappers';
import { initSodium, X3DHKeyPair, performX3DHSender, performX3DHReceiver, X3DHKeyBundle } from './x3dh';
import { DeviceIdentity, createPreKeyBundle, getOneTimePreKey, removeOneTimePreKey, rotateSignedPreKey, replenishOneTimePreKeys } from './identity';
import { initializeDoubleRatchet, encryptMessage as doubleRatchetEncrypt, decryptMessage as doubleRatchetDecrypt, DoubleRatchetState, EncryptedMessage } from './double-ratchet';
import { hybridEncrypt, hybridDecrypt } from './hybrid';

export interface StreamChunk {
  chunkId: number;
  data: Uint8Array;
  isLast: boolean;
}

export interface EncryptedChunk {
  chunkId: number;
  encryptedData: string;
  nonce: string;
  isLast: boolean;
}

export interface FileStreamState {
  fileId: string;
  totalChunks: number;
  receivedChunks: Map<number, Uint8Array>;
  encryptionKey: Uint8Array;
}

export class MessageEncryptionSDK {
  private identity: DeviceIdentity;
  private ratchetState: DoubleRatchetState | null = null;
  private fileStreams: Map<string, FileStreamState> = new Map();
  private readonly CHUNK_SIZE = 64 * 1024; // 64KB chunks

  constructor(identity: DeviceIdentity) {
    this.identity = identity;
  }

  /**
   * Initialize the messaging session using X3DH
   */
  async initializeSession(theirKeyBundle: X3DHKeyBundle): Promise<void> {
    await initSodium();

    // Generate ephemeral key pair for X3DH
    const ephemeralKeyPair = sodium.crypto_box_keypair();
    const ephemeralX3DHKeyPair: X3DHKeyPair = {
      publicKey: ephemeralKeyPair.publicKey,
      privateKey: ephemeralKeyPair.privateKey,
    };

    // Perform X3DH key agreement
    const session = await performX3DHSender(
      this.identity.identityKeyPair,
      ephemeralX3DHKeyPair,
      theirKeyBundle
    );

    // Initialize double ratchet with X3DH session
    this.ratchetState = await initializeDoubleRatchet(
      session.rootKey,
      true,
      sodium.from_base64(theirKeyBundle.signedPreKey)
    );
  }

  /**
   * Encrypt text message
   */
  async encryptMessage(plaintext: string): Promise<EncryptedMessage> {
    if (!this.ratchetState) {
      throw new Error('Session not initialized. Call initializeSession first.');
    }

    const result = await doubleRatchetEncrypt(this.ratchetState, plaintext);
    this.ratchetState = result.newState;
    return result.message;
  }

  /**
   * Decrypt text message
   */
  async decryptMessage(encryptedMessage: EncryptedMessage): Promise<string> {
    if (!this.ratchetState) {
      throw new Error('Session not initialized. Call initializeSession first.');
    }

    const result = await doubleRatchetDecrypt(this.ratchetState, encryptedMessage);
    this.ratchetState = result.newState;
    return result.plaintext;
  }

  /**
   * Start streaming encryption for a large file
   */
  async startFileEncryption(fileId: string, fileSize: number): Promise<{ encryptionKey: string; totalChunks: number }> {
    await initSodium();

    const encryptionKey = sodium.randombytes_buf(32);
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);

    this.fileStreams.set(fileId, {
      fileId,
      totalChunks,
      receivedChunks: new Map(),
      encryptionKey,
    });

    return {
      encryptionKey: sodium.to_base64(encryptionKey),
      totalChunks,
    };
  }

  /**
   * Encrypt a file chunk
   */
  async encryptFileChunk(fileId: string, chunk: StreamChunk): Promise<EncryptedChunk> {
    await initSodium();

    const streamState = this.fileStreams.get(fileId);
    if (!streamState) {
      throw new Error(`File stream ${fileId} not found. Call startFileEncryption first.`);
    }

    // Generate unique nonce for this chunk
    const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
    
    // Encrypt chunk data
    const encryptedData = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      chunk.data,
      new Uint8Array([chunk.chunkId]), // Additional data: chunk ID
      null,
      nonce,
      streamState.encryptionKey
    );

    return {
      chunkId: chunk.chunkId,
      encryptedData: sodium.to_base64(encryptedData),
      nonce: sodium.to_base64(nonce),
      isLast: chunk.isLast,
    };
  }

  /**
   * Start streaming decryption for a large file
   */
  async startFileDecryption(fileId: string, encryptionKey: string, totalChunks: number): Promise<void> {
    await initSodium();

    this.fileStreams.set(fileId, {
      fileId,
      totalChunks,
      receivedChunks: new Map(),
      encryptionKey: sodium.from_base64(encryptionKey),
    });
  }

  /**
   * Decrypt a file chunk
   */
  async decryptFileChunk(fileId: string, encryptedChunk: EncryptedChunk): Promise<StreamChunk> {
    await initSodium();

    const streamState = this.fileStreams.get(fileId);
    if (!streamState) {
      throw new Error(`File stream ${fileId} not found. Call startFileDecryption first.`);
    }

    const encryptedData = sodium.from_base64(encryptedChunk.encryptedData);
    const nonce = sodium.from_base64(encryptedChunk.nonce);

    // Decrypt chunk data
    const decryptedData = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      new Uint8Array([encryptedChunk.chunkId]), // Additional data: chunk ID
      encryptedData,
      null,
      nonce,
      streamState.encryptionKey
    );

    // Store the decrypted chunk
    streamState.receivedChunks.set(encryptedChunk.chunkId, decryptedData);

    return {
      chunkId: encryptedChunk.chunkId,
      data: decryptedData,
      isLast: encryptedChunk.isLast,
    };
  }

  /**
   * Assemble decrypted file chunks into complete file data
   */
  async assembleFile(fileId: string): Promise<Uint8Array> {
    const streamState = this.fileStreams.get(fileId);
    if (!streamState) {
      throw new Error(`File stream ${fileId} not found.`);
    }

    if (streamState.receivedChunks.size !== streamState.totalChunks) {
      throw new Error(`Incomplete file. Received ${streamState.receivedChunks.size}/${streamState.totalChunks} chunks.`);
    }

    // Calculate total size
    let totalSize = 0;
    for (let i = 0; i < streamState.totalChunks; i++) {
      const chunk = streamState.receivedChunks.get(i);
      if (chunk) {
        totalSize += chunk.length;
      }
    }

    // Assemble chunks in order
    const assembledData = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < streamState.totalChunks; i++) {
      const chunk = streamState.receivedChunks.get(i);
      if (chunk) {
        assembledData.set(chunk, offset);
        offset += chunk.length;
      }
    }

    // Clean up stream state
    this.fileStreams.delete(fileId);

    return assembledData;
  }

  /**
   * Split file data into chunks for streaming
   */
  splitFileIntoChunks(fileData: Uint8Array): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    const totalChunks = Math.ceil(fileData.length / this.CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, fileData.length);
      const chunkData = fileData.slice(start, end);

      chunks.push({
        chunkId: i,
        data: chunkData,
        isLast: i === totalChunks - 1,
      });
    }

    return chunks;
  }

  /**
   * Get current ratchet state (for persistence)
   */
  getRatchetState(): DoubleRatchetState | null {
    return this.ratchetState;
  }

  /**
   * Set ratchet state (for restoration)
   */
  setRatchetState(state: DoubleRatchetState): void {
    this.ratchetState = state;
  }

  /**
   * Update device identity
   */
  setIdentity(identity: DeviceIdentity): void {
    this.identity = identity;
  }

  /**
   * Get current device identity
   */
  getIdentity(): DeviceIdentity {
    return this.identity;
  }

  /**
   * Create prekey bundle for key exchange
   */
  async createPreKeyBundle(): Promise<X3DHKeyBundle> {
    return await createPreKeyBundle(this.identity);
  }

  /**
   * Replenish prekeys when running low
   */
  async replenishKeys(): Promise<void> {
    await replenishOneTimePreKeys(this.identity);
    await rotateSignedPreKey(this.identity);
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.fileStreams.clear();
    // Clear sensitive data from memory
    if (this.ratchetState) {
      // Zero out sensitive keys if possible
      // Note: This is best effort as JS doesn't guarantee memory clearing
      this.ratchetState = null;
    }
  }
}

export { MessageEncryptionSDK };
