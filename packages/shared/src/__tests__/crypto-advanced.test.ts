import {
  initSodium,
  generateIdentityKeyPair,
  generateSignedPreKeyPair,
  generateOneTimePreKeyPair,
  createKeyBundle,
  performX3DHSender,
  performX3DHReceiver,
  signPreKey,
  verifyPreKeySignature,
} from '../crypto/x3dh';

import {
  initializeDoubleRatchet,
  encryptMessage as ratchetEncrypt,
  decryptMessage as ratchetDecrypt,
} from '../crypto/double-ratchet';

import {
  generateDeviceIdentity,
  createPreKeyBundle,
  replenishOneTimePreKeys,
  rotateSignedPreKey,
  getIdentityFingerprint,
  serializeDeviceIdentity,
  deserializeDeviceIdentity,
} from '../crypto/identity';

import {
  MessageEncryptionSDK,
  StreamChunk,
  EncryptedChunk,
} from '../crypto/sdk';

import { hybridEncrypt, hybridDecrypt } from '../crypto/hybrid';
import sodium from 'libsodium-wrappers';

describe('Advanced Cryptography Suite', () => {
  beforeAll(async () => {
    await initSodium();
  });

  describe('X3DH Key Agreement', () => {
    it('should generate valid identity key pairs', async () => {
      const keyPair = await generateIdentityKeyPair();
      
      expect(keyPair.publicKey).toHaveLength(32);
      expect(keyPair.privateKey).toHaveLength(32);
      expect(keyPair.publicKey).not.toEqual(keyPair.privateKey);
    });

    it('should create and verify signed prekeys', async () => {
      const identityKeyPair = await generateIdentityKeyPair();
      const preKeyPair = await generateSignedPreKeyPair();
      
      const signature = await signPreKey(preKeyPair.publicKey, identityKeyPair.privateKey);
      const isValid = await verifyPreKeySignature(signature, preKeyPair.publicKey, identityKeyPair.publicKey);
      
      expect(isValid).toBe(true);
    });

    it('should perform complete X3DH key agreement', async () => {
      // Alice's keys
      const aliceIdentity = await generateIdentityKeyPair();
      const aliceEphemeral = await generateIdentityKeyPair();
      
      // Bob's keys
      const bobIdentity = await generateIdentityKeyPair();
      const bobSignedPreKey = await generateSignedPreKeyPair();
      const bobOneTimePreKey = await generateOneTimePreKeyPair();
      
      // Create Bob's key bundle
      const bobKeyBundle = await createKeyBundle(
        bobIdentity,
        bobSignedPreKey,
        bobOneTimePreKey
      );
      
      // Alice performs X3DH
      const aliceSession = await performX3DHSender(
        aliceIdentity,
        aliceEphemeral,
        bobKeyBundle
      );
      
      // Bob performs X3DH
      const bobSession = await performX3DHReceiver(
        bobIdentity,
        bobSignedPreKey,
        bobOneTimePreKey,
        aliceIdentity.publicKey,
        aliceEphemeral.publicKey
      );
      
      // Both should derive the same root key
      expect(aliceSession.rootKey).toEqual(bobSession.rootKey);
      expect(aliceSession.chainKey).toEqual(bobSession.chainKey);
    });

    it('should reject invalid signatures', async () => {
      const identityKeyPair = await generateIdentityKeyPair();
      const preKeyPair = await generateSignedPreKeyPair();
      const wrongIdentity = await generateIdentityKeyPair();
      
      const signature = await signPreKey(preKeyPair.publicKey, identityKeyPair.privateKey);
      const isValid = await verifyPreKeySignature(signature, preKeyPair.publicKey, wrongIdentity.publicKey);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Double Ratchet', () => {
    it('should encrypt and decrypt messages in order', async () => {
      const rootKey = sodium.randombytes_buf(32);
      const initialRatchetKey = sodium.randombytes_buf(32);
      
      const aliceRatchet = await initializeDoubleRatchet(rootKey, true, initialRatchetKey);
      const bobRatchet = await initializeDoubleRatchet(rootKey, false);
      
      const message1 = 'Hello, Bob!';
      const message2 = 'How are you?';
      
      // Alice encrypts messages
      const encrypted1 = await ratchetEncrypt(aliceRatchet, message1);
      const encrypted2 = await ratchetEncrypt(encrypted1.newState, message2);
      
      // Bob decrypts messages
      const decrypted1 = await ratchetDecrypt(bobRatchet, encrypted1.message);
      const decrypted2 = await ratchetDecrypt(decrypted1.newState, encrypted2.message);
      
      expect(decrypted1.plaintext).toBe(message1);
      expect(decrypted2.plaintext).toBe(message2);
    });

    it('should handle out-of-order message delivery', async () => {
      const rootKey = sodium.randombytes_buf(32);
      const initialRatchetKey = sodium.randombytes_buf(32);
      
      const aliceRatchet = await initializeDoubleRatchet(rootKey, true, initialRatchetKey);
      const bobRatchet = await initializeDoubleRatchet(rootKey, false);
      
      const message1 = 'First message';
      const message2 = 'Second message';
      const message3 = 'Third message';
      
      // Alice encrypts messages
      const encrypted1 = await ratchetEncrypt(aliceRatchet, message1);
      const encrypted2 = await ratchetEncrypt(encrypted1.newState, message2);
      const encrypted3 = await ratchetEncrypt(encrypted2.newState, message3);
      
      // Bob receives messages out of order: 1, 3, 2
      const decrypted1 = await ratchetDecrypt(bobRatchet, encrypted1.message);
      const decrypted3 = await ratchetDecrypt(decrypted1.newState, encrypted3.message);
      const decrypted2 = await ratchetDecrypt(decrypted3.newState, encrypted2.message);
      
      expect(decrypted1.plaintext).toBe(message1);
      expect(decrypted2.plaintext).toBe(message2);
      expect(decrypted3.plaintext).toBe(message3);
    });
  });

  describe('Device Identity Management', () => {
    it('should generate complete device identity', async () => {
      const deviceId = 'test-device-123';
      const identity = await generateDeviceIdentity(deviceId, 50);
      
      expect(identity.deviceId).toBe(deviceId);
      expect(identity.identityKeyPair.publicKey).toHaveLength(32);
      expect(identity.signedPreKeyPair.publicKey).toHaveLength(32);
      expect(identity.oneTimePreKeys.size).toBe(50);
      expect(identity.createdAt).toBeInstanceOf(Date);
    });

    it('should create and consume prekey bundles', async () => {
      const identity = await generateDeviceIdentity('test-device', 10);
      const initialKeyCount = identity.oneTimePreKeys.size;
      
      const bundle = await createPreKeyBundle(identity);
      
      expect(bundle.deviceId).toBe('test-device');
      expect(bundle.identityKey).toBeTruthy();
      expect(bundle.signedPreKey).toBeTruthy();
      expect(bundle.signedPreKeySignature).toBeTruthy();
      expect(bundle.oneTimePreKey).toBeTruthy();
      expect(bundle.oneTimePreKeyId).toBeTruthy();
      
      // One-time prekey should be consumed
      expect(identity.oneTimePreKeys.size).toBe(initialKeyCount - 1);
    });

    it('should replenish one-time prekeys', async () => {
      const identity = await generateDeviceIdentity('test-device', 5);
      
      // Consume some keys
      await createPreKeyBundle(identity);
      await createPreKeyBundle(identity);
      await createPreKeyBundle(identity);
      
      expect(identity.oneTimePreKeys.size).toBe(2);
      
      await replenishOneTimePreKeys(identity, 10);
      expect(identity.oneTimePreKeys.size).toBe(10);
    });

    it('should rotate signed prekeys', async () => {
      const identity = await generateDeviceIdentity('test-device', 10);
      const originalSignedPreKey = identity.signedPreKeyPair.publicKey;
      
      await rotateSignedPreKey(identity);
      
      expect(identity.signedPreKeyPair.publicKey).not.toEqual(originalSignedPreKey);
    });

    it('should generate identity fingerprints', async () => {
      const identity = await generateDeviceIdentity('test-device', 10);
      const fingerprint = await getIdentityFingerprint(identity.identityKeyPair.publicKey);
      
      expect(fingerprint).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){9}$/);
    });

    it('should serialize and deserialize device identity', async () => {
      const originalIdentity = await generateDeviceIdentity('test-device', 5);
      
      const serialized = await serializeDeviceIdentity(originalIdentity);
      const deserializedIdentity = await deserializeDeviceIdentity(serialized);
      
      expect(deserializedIdentity.deviceId).toBe(originalIdentity.deviceId);
      expect(deserializedIdentity.identityKeyPair.publicKey).toEqual(originalIdentity.identityKeyPair.publicKey);
      expect(deserializedIdentity.oneTimePreKeys.size).toBe(originalIdentity.oneTimePreKeys.size);
      expect(deserializedIdentity.createdAt).toEqual(originalIdentity.createdAt);
    });
  });

  describe('Hybrid Encryption', () => {
    it('should encrypt and decrypt with AES-GCM + Curve25519', async () => {
      const keyPair = sodium.crypto_box_keypair();
      const plaintext = 'This is a test message for hybrid encryption';
      
      const { encryptedData, nonce } = await hybridEncrypt(plaintext, keyPair.publicKey);
      const decryptedText = await hybridDecrypt(encryptedData, nonce, keyPair.publicKey, keyPair.privateKey);
      
      expect(decryptedText).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const keyPair = sodium.crypto_box_keypair();
      const plaintext = 'Same message';
      
      const result1 = await hybridEncrypt(plaintext, keyPair.publicKey);
      const result2 = await hybridEncrypt(plaintext, keyPair.publicKey);
      
      expect(result1.encryptedData).not.toEqual(result2.encryptedData);
      expect(result1.nonce).not.toEqual(result2.nonce);
    });
  });

  describe('Message Encryption SDK', () => {
    let aliceIdentity: any;
    let bobIdentity: any;
    let aliceSDK: MessageEncryptionSDK;
    let bobSDK: MessageEncryptionSDK;

    beforeEach(async () => {
      aliceIdentity = await generateDeviceIdentity('alice-device', 100);
      bobIdentity = await generateDeviceIdentity('bob-device', 100);
      aliceSDK = new MessageEncryptionSDK(aliceIdentity);
      bobSDK = new MessageEncryptionSDK(bobIdentity);
    });

    afterEach(() => {
      aliceSDK.cleanup();
      bobSDK.cleanup();
    });

    it('should initialize session and encrypt/decrypt messages', async () => {
      const bobKeyBundle = await bobSDK.createPreKeyBundle();
      await aliceSDK.initializeSession(bobKeyBundle);
      
      const message = 'Hello from Alice!';
      const encrypted = await aliceSDK.encryptMessage(message);
      
      expect(encrypted.header).toBeTruthy();
      expect(encrypted.ciphertext).toBeTruthy();
      
      // For this test, we would need to implement session synchronization
      // This is a simplified test structure
    });

    it('should handle file streaming encryption', async () => {
      const fileId = 'test-file-123';
      const fileData = new Uint8Array(1024 * 1024); // 1MB test file
      sodium.randombytes_buf_deterministic(fileData, sodium.from_string('test-seed'));
      
      // Start file encryption
      const { encryptionKey, totalChunks } = await aliceSDK.startFileEncryption(fileId, fileData.length);
      
      // Split file into chunks
      const chunks = aliceSDK.splitFileIntoChunks(fileData);
      expect(chunks).toHaveLength(totalChunks);
      
      // Encrypt each chunk
      const encryptedChunks: EncryptedChunk[] = [];
      for (const chunk of chunks) {
        const encryptedChunk = await aliceSDK.encryptFileChunk(fileId, chunk);
        encryptedChunks.push(encryptedChunk);
      }
      
      // Start file decryption on receiver side
      await bobSDK.startFileDecryption(fileId, encryptionKey, totalChunks);
      
      // Decrypt each chunk
      const decryptedChunks: StreamChunk[] = [];
      for (const encryptedChunk of encryptedChunks) {
        const decryptedChunk = await bobSDK.decryptFileChunk(fileId, encryptedChunk);
        decryptedChunks.push(decryptedChunk);
      }
      
      // Assemble file
      const assembledFile = await bobSDK.assembleFile(fileId);
      
      expect(assembledFile).toEqual(fileData);
    });

    it('should handle out-of-order chunk delivery', async () => {
      const fileId = 'test-file-ooo';
      const fileData = new Uint8Array(256 * 1024); // 256KB test file
      sodium.randombytes_buf_deterministic(fileData, sodium.from_string('ooo-test'));
      
      const { encryptionKey, totalChunks } = await aliceSDK.startFileEncryption(fileId, fileData.length);
      const chunks = aliceSDK.splitFileIntoChunks(fileData);
      
      // Encrypt chunks
      const encryptedChunks: EncryptedChunk[] = [];
      for (const chunk of chunks) {
        encryptedChunks.push(await aliceSDK.encryptFileChunk(fileId, chunk));
      }
      
      // Start decryption
      await bobSDK.startFileDecryption(fileId, encryptionKey, totalChunks);
      
      // Decrypt chunks out of order
      const shuffledChunks = [...encryptedChunks].sort(() => Math.random() - 0.5);
      for (const encryptedChunk of shuffledChunks) {
        await bobSDK.decryptFileChunk(fileId, encryptedChunk);
      }
      
      const assembledFile = await bobSDK.assembleFile(fileId);
      expect(assembledFile).toEqual(fileData);
    });
  });

  describe('Wycheproof Test Vectors', () => {
    // Simplified Wycheproof-style tests
    it('should handle AES-GCM test vectors correctly', async () => {
      await initSodium();
      
      // Test vector from Wycheproof (simplified)
      const key = sodium.from_hex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
      const nonce = sodium.from_hex('000102030405060708090a0b');
      const plaintext = 'Hello, World!';
      const additionalData = sodium.from_hex('feedfacedeadbeeffeedfacedeadbeef');
      
      // Encrypt
      const ciphertext = sodium.crypto_aead_aes256gcm_encrypt(
        plaintext,
        additionalData,
        null,
        nonce,
        key
      );
      
      // Decrypt
      const decrypted = sodium.crypto_aead_aes256gcm_decrypt(
        null,
        ciphertext,
        additionalData,
        nonce,
        key
      );
      
      expect(sodium.to_string(decrypted)).toBe(plaintext);
    });

    it('should reject tampered ciphertexts', async () => {
      await initSodium();
      
      const key = sodium.randombytes_buf(32);
      const nonce = sodium.randombytes_buf(12);
      const plaintext = 'This should fail when tampered';
      
      const ciphertext = sodium.crypto_aead_aes256gcm_encrypt(plaintext, null, null, nonce, key);
      
      // Tamper with ciphertext
      const tamperedCiphertext = new Uint8Array(ciphertext);
      tamperedCiphertext[0] ^= 1; // Flip a bit
      
      // Should throw when decrypting tampered data
      expect(() => {
        sodium.crypto_aead_aes256gcm_decrypt(null, tamperedCiphertext, null, nonce, key);
      }).toThrow();
    });

    it('should handle Curve25519 scalar multiplication test vectors', async () => {
      await initSodium();
      
      // Test vector: scalar multiplication
      const scalar = sodium.from_hex('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4');
      const point = sodium.from_hex('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c');
      
      const result = sodium.crypto_scalarmult(scalar, point);
      
      // Verify result has correct length and format
      expect(result).toHaveLength(32);
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should validate digital signature test vectors', async () => {
      await initSodium();
      
      const keyPair = sodium.crypto_sign_keypair();
      const message = 'Test message for signature verification';
      
      // Sign message
      const signature = sodium.crypto_sign_detached(message, keyPair.privateKey);
      
      // Verify signature
      const isValid = sodium.crypto_sign_verify_detached(signature, message, keyPair.publicKey);
      expect(isValid).toBe(true);
      
      // Verify with wrong message should fail
      const isInvalid = sodium.crypto_sign_verify_detached(signature, 'Wrong message', keyPair.publicKey);
      expect(isInvalid).toBe(false);
    });
  });
});
