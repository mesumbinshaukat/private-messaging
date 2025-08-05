import sodium from 'libsodium-wrappers';
import { initSodium, X3DHKeyPair } from './x3dh';

export interface DoubleRatchetState {
  rootKey: Uint8Array;
  sendingChain: ChainState;
  receivingChain: ChainState;
  sendingRatchetKey: X3DHKeyPair;
  receivingRatchetKey: Uint8Array | null;
  previousCounter: number;
  skippedKeys: Map<string, Uint8Array>;
  messageNumber: number;
}

export interface ChainState {
  chainKey: Uint8Array;
  messageNumber: number;
}

export interface RatchetMessage {
  header: MessageHeader;
  ciphertext: Uint8Array;
}

export interface MessageHeader {
  ratchetPublicKey: Uint8Array;
  previousCounter: number;
  messageNumber: number;
}

export interface EncryptedMessage {
  header: string; // base64 encoded header
  ciphertext: string; // base64 encoded ciphertext
}

/**
 * Initialize Double Ratchet state from X3DH session
 */
export async function initializeDoubleRatchet(
  rootKey: Uint8Array,
  isInitiator: boolean,
  theirRatchetKey?: Uint8Array
): Promise<DoubleRatchetState> {
  await initSodium();
  
  const initialRatchetKeyPair = sodium.crypto_box_keypair();
  
  let state: DoubleRatchetState = {
    rootKey,
    sendingChain: { chainKey: new Uint8Array(32), messageNumber: 0 },
    receivingChain: { chainKey: new Uint8Array(32), messageNumber: 0 },
    sendingRatchetKey: {
      publicKey: initialRatchetKeyPair.publicKey,
      privateKey: initialRatchetKeyPair.privateKey
    },
    receivingRatchetKey: null,
    previousCounter: 0,
    skippedKeys: new Map(),
    messageNumber: 0,
  };

  if (isInitiator && theirRatchetKey) {
    // Perform initial DH ratchet step
    state = await performDHRatchetStep(state, theirRatchetKey);
  }

  return state;
}

/**
 * Perform DH ratchet step
 */
async function performDHRatchetStep(
  state: DoubleRatchetState,
  theirRatchetKey: Uint8Array
): Promise<DoubleRatchetState> {
  await initSodium();
  
  // Store previous chain for skipped message keys
  state.previousCounter = state.sendingChain.messageNumber;
  
  // Generate new ratchet key pair
  const newRatchetKeyPair = sodium.crypto_box_keypair();
  
  // Compute DH shared secret
  const dhOutput = sodium.crypto_scalarmult(newRatchetKeyPair.privateKey, theirRatchetKey);
  
  // KDF ratchet
  const kdfOutput = sodium.crypto_kdf_derive_from_key(64, 1, 'RATCHET', 
    concatenateArrays(state.rootKey, dhOutput));
  
  const newRootKey = kdfOutput.slice(0, 32);
  const newChainKey = kdfOutput.slice(32, 64);
  
  return {
    ...state,
    rootKey: newRootKey,
    sendingChain: { chainKey: newChainKey, messageNumber: 0 },
    sendingRatchetKey: {
      publicKey: newRatchetKeyPair.publicKey,
      privateKey: newRatchetKeyPair.privateKey
    },
    receivingRatchetKey: theirRatchetKey,
  };
}

/**
 * Encrypt message using Double Ratchet
 */
export async function encryptMessage(
  state: DoubleRatchetState,
  plaintext: string
): Promise<{ message: EncryptedMessage; newState: DoubleRatchetState }> {
  await initSodium();
  
  // Derive message key from chain key
  const messageKey = sodium.crypto_kdf_derive_from_key(32, 1, 'MSG_KEY', state.sendingChain.chainKey);
  
  // Update chain key
  const newChainKey = sodium.crypto_kdf_derive_from_key(32, 2, 'CHAIN_K', state.sendingChain.chainKey);
  
  // Create message header
  const header: MessageHeader = {
    ratchetPublicKey: state.sendingRatchetKey.publicKey,
    previousCounter: state.previousCounter,
    messageNumber: state.sendingChain.messageNumber,
  };
  
  // Serialize header
  const serializedHeader = serializeHeader(header);
  
  // Encrypt plaintext
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    serializedHeader,
    null,
    nonce,
    messageKey
  );
  
  // Combine nonce and ciphertext
  const fullCiphertext = new Uint8Array(nonce.length + ciphertext.length);
  fullCiphertext.set(nonce, 0);
  fullCiphertext.set(ciphertext, nonce.length);
  
  const encryptedMessage: EncryptedMessage = {
    header: sodium.to_base64(serializedHeader),
    ciphertext: sodium.to_base64(fullCiphertext),
  };
  
  const newState: DoubleRatchetState = {
    ...state,
    sendingChain: {
      chainKey: newChainKey,
      messageNumber: state.sendingChain.messageNumber + 1,
    },
    messageNumber: state.messageNumber + 1,
  };
  
  return { message: encryptedMessage, newState };
}

/**
 * Decrypt message using Double Ratchet
 */
export async function decryptMessage(
  state: DoubleRatchetState,
  encryptedMessage: EncryptedMessage
): Promise<{ plaintext: string; newState: DoubleRatchetState }> {
  await initSodium();
  
  const serializedHeader = sodium.from_base64(encryptedMessage.header);
  const fullCiphertext = sodium.from_base64(encryptedMessage.ciphertext);
  
  const header = deserializeHeader(serializedHeader);
  
  let currentState = state;
  
  // Check if we need to perform DH ratchet step
  if (!currentState.receivingRatchetKey || 
      !sodium.memcmp(header.ratchetPublicKey, currentState.receivingRatchetKey)) {
    currentState = await performDHRatchetStep(currentState, header.ratchetPublicKey);
  }
  
  // Try to decrypt with current receiving chain
  const messageKey = await tryGetMessageKey(currentState, header);
  
  // Extract nonce and ciphertext
  const nonce = fullCiphertext.slice(0, sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = fullCiphertext.slice(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  
  // Decrypt message
  const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    serializedHeader,
    nonce,
    messageKey
  );
  
  // Update receiving chain
  const newChainKey = sodium.crypto_kdf_derive_from_key(32, 2, 'CHAIN_K', currentState.receivingChain.chainKey);
  
  const newState: DoubleRatchetState = {
    ...currentState,
    receivingChain: {
      chainKey: newChainKey,
      messageNumber: Math.max(currentState.receivingChain.messageNumber, header.messageNumber + 1),
    },
  };
  
  return { plaintext: sodium.to_string(plaintext), newState };
}

/**
 * Try to get message key, handling out-of-order messages
 */
async function tryGetMessageKey(
  state: DoubleRatchetState,
  header: MessageHeader
): Promise<Uint8Array> {
  await initSodium();
  
  const keyId = `${sodium.to_base64(header.ratchetPublicKey)}-${header.messageNumber}`;
  
  // Check if we have a skipped key
  if (state.skippedKeys.has(keyId)) {
    const key = state.skippedKeys.get(keyId)!;
    state.skippedKeys.delete(keyId);
    return key;
  }
  
  // Generate keys for skipped messages
  let chainKey = state.receivingChain.chainKey;
  let messageNumber = state.receivingChain.messageNumber;
  
  while (messageNumber < header.messageNumber) {
    const messageKey = sodium.crypto_kdf_derive_from_key(32, 1, 'MSG_KEY', chainKey);
    const skipKeyId = `${sodium.to_base64(header.ratchetPublicKey)}-${messageNumber}`;
    state.skippedKeys.set(skipKeyId, messageKey);
    
    chainKey = sodium.crypto_kdf_derive_from_key(32, 2, 'CHAIN_K', chainKey);
    messageNumber++;
  }
  
  // Generate current message key
  return sodium.crypto_kdf_derive_from_key(32, 1, 'MSG_KEY', chainKey);
}

/**
 * Serialize message header
 */
function serializeHeader(header: MessageHeader): Uint8Array {
  const buffer = new ArrayBuffer(
    header.ratchetPublicKey.length + 4 + 4 // public key + 2 uint32s
  );
  const view = new DataView(buffer);
  const uint8View = new Uint8Array(buffer);
  
  let offset = 0;
  
  // Copy ratchet public key
  uint8View.set(header.ratchetPublicKey, offset);
  offset += header.ratchetPublicKey.length;
  
  // Write previous counter (4 bytes)
  view.setUint32(offset, header.previousCounter, true);
  offset += 4;
  
  // Write message number (4 bytes)
  view.setUint32(offset, header.messageNumber, true);
  
  return uint8View;
}

/**
 * Deserialize message header
 */
function deserializeHeader(serialized: Uint8Array): MessageHeader {
  const view = new DataView(serialized.buffer);
  
  const ratchetPublicKeyLength = 32; // Curve25519 public key length
  const ratchetPublicKey = serialized.slice(0, ratchetPublicKeyLength);
  
  let offset = ratchetPublicKeyLength;
  const previousCounter = view.getUint32(offset, true);
  offset += 4;
  const messageNumber = view.getUint32(offset, true);
  
  return {
    ratchetPublicKey,
    previousCounter,
    messageNumber,
  };
}

/**
 * Utility function to concatenate Uint8Arrays
 */
function concatenateArrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}
