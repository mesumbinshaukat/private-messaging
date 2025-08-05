// Export all crypto modules
export * from './crypto/double-ratchet';
export * from './crypto/identity';
export * from './crypto/x3dh';
export * from './crypto/hybrid';
export * from './crypto/sdk';

// Legacy crypto functions (kept for backward compatibility)
import CryptoJS from 'crypto-js';
import { KeyPair, EncryptedData } from './types';
export async function generateKeyPair(): Promise<KeyPair> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    // Browser environment
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    return {
      publicKey: arrayBufferToBase64(publicKey),
      privateKey: arrayBufferToBase64(privateKey),
    };
  } else {
    // Node.js environment - simplified implementation
    // In production, use node:crypto for proper RSA key generation
    const keyData = CryptoJS.lib.WordArray.random(256/8).toString();
    return {
      publicKey: CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(`pub_${keyData}`)),
      privateKey: CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(`priv_${keyData}`)),
    };
  }
}

/**
 * Generate a random symmetric key for AES encryption
 */
export function generateSymmetricKey(): string {
  return CryptoJS.lib.WordArray.random(256/8).toString();
}

/**
 * Encrypt data using AES symmetric encryption
 */
export function encryptSymmetric(data: string, key: string): { encrypted: string; iv: string } {
  const iv = CryptoJS.lib.WordArray.random(128/8);
  const encrypted = CryptoJS.AES.encrypt(data, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return {
    encrypted: encrypted.toString(),
    iv: iv.toString()
  };
}

/**
 * Decrypt data using AES symmetric encryption
 */
export function decryptSymmetric(encryptedData: string, key: string, iv: string): string {
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Encrypt symmetric key using RSA public key
 * Simplified implementation - in production use proper RSA encryption
 */
export function encryptAsymmetric(data: string, publicKey: string): string {
  // Simplified encryption using the public key as a seed
  // In production, use proper RSA encryption
  const key = CryptoJS.enc.Base64.parse(publicKey).toString();
  return CryptoJS.AES.encrypt(data, key).toString();
}

/**
 * Decrypt symmetric key using RSA private key
 * Simplified implementation - in production use proper RSA decryption
 */
export function decryptAsymmetric(encryptedData: string, privateKey: string): string {
  // Simplified decryption using the private key as a seed
  // In production, use proper RSA decryption
  const key = CryptoJS.enc.Base64.parse(privateKey).toString();
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
  return decrypted.toString(CryptoJS.enc.Utf8);
}

/**
 * Encrypt message for end-to-end encryption
 */
export function encryptMessage(message: string, recipientPublicKey: string): EncryptedData {
  // Generate symmetric key
  const symmetricKey = generateSymmetricKey();
  
  // Encrypt message with symmetric key
  const { encrypted: encryptedContent, iv } = encryptSymmetric(message, symmetricKey);
  
  // Encrypt symmetric key with recipient's public key
  const encryptedKey = encryptAsymmetric(symmetricKey, recipientPublicKey);
  
  return {
    encryptedContent,
    encryptedKey,
    iv
  };
}

/**
 * Decrypt message for end-to-end encryption
 */
export function decryptMessage(encryptedData: EncryptedData, privateKey: string): string {
  // Decrypt symmetric key with private key
  const symmetricKey = decryptAsymmetric(encryptedData.encryptedKey, privateKey);
  
  // Decrypt message with symmetric key
  return decryptSymmetric(encryptedData.encryptedContent, symmetricKey, encryptedData.iv);
}

/**
 * Hash password using SHA-256
 */
export function hashPassword(password: string, salt?: string): string {
  const saltToUse = salt || CryptoJS.lib.WordArray.random(128/8).toString();
  return CryptoJS.SHA256(password + saltToUse).toString();
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return CryptoJS.lib.WordArray.random(length).toString();
}

/**
 * Utility function to convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Utility function to convert Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
