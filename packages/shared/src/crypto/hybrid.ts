import sodium from 'libsodium-wrappers';
import { initSodium } from './x3dh';

/**
 * Encrypt data using AES-GCM and Curve25519
 */
export async function hybridEncrypt(plaintext: string, theirPublicKey: Uint8Array): Promise<{ encryptedData: Uint8Array, nonce: Uint8Array }> {
  await initSodium();

  // Generate ephemeral key pair
  const ephemeralKeyPair = sodium.crypto_box_keypair();

  // Perform ECDH
  const sharedSecret = sodium.crypto_scalarmult(ephemeralKeyPair.privateKey, theirPublicKey);

  // Create nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_aes256gcm_NPUBBYTES);

  // Derive encryption key
  const encryptionKey = sodium.crypto_generichash(32, sharedSecret);

  // Encrypt
  const encryptedData = sodium.crypto_aead_aes256gcm_encrypt(plaintext, null, null, nonce, encryptionKey);

  return { encryptedData, nonce };
}

/**
 * Decrypt data using AES-GCM and Curve25519
 */
export async function hybridDecrypt(encryptedData: Uint8Array, nonce: Uint8Array, theirPublicKey: Uint8Array, myPrivateKey: Uint8Array): Promise<string> {
  await initSodium();

  // Perform ECDH
  const sharedSecret = sodium.crypto_scalarmult(myPrivateKey, theirPublicKey);

  // Derive decryption key
  const decryptionKey = sodium.crypto_generichash(32, sharedSecret);

  // Decrypt
  const decryptedData = sodium.crypto_aead_aes256gcm_decrypt(null, encryptedData, null, nonce, decryptionKey);

  return sodium.to_string(decryptedData);
}
