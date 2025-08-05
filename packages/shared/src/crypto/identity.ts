import sodium from 'libsodium-wrappers';
import { initSodium, X3DHKeyPair, generateIdentityKeyPair, generateOneTimePreKeyPair, generateSignedPreKeyPair, signPreKey } from './x3dh';

export interface DeviceIdentity {
  deviceId: string;
  identityKeyPair: X3DHKeyPair;
  signedPreKeyPair: X3DHKeyPair;
  signedPreKeySignature: Uint8Array;
  oneTimePreKeys: Map<string, X3DHKeyPair>;
  createdAt: Date;
}

export interface PreKeyBundle {
  deviceId: string;
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  oneTimePreKeyId?: string;
}

/**
 * Generate a new device identity with prekeys
 */
export async function generateDeviceIdentity(deviceId: string, oneTimeKeyCount: number = 100): Promise<DeviceIdentity> {
  await initSodium();
  
  const identityKeyPair = await generateIdentityKeyPair();
  const signedPreKeyPair = await generateSignedPreKeyPair();
  const signature = await signPreKey(signedPreKeyPair.publicKey, identityKeyPair.privateKey);
  
  const oneTimePreKeys = new Map<string, X3DHKeyPair>();
  
  // Generate one-time prekeys
  for (let i = 0; i < oneTimeKeyCount; i++) {
    const oneTimePreKeyPair = await generateOneTimePreKeyPair();
    const keyId = generateKeyId();
    oneTimePreKeys.set(keyId, oneTimePreKeyPair);
  }
  
  return {
    deviceId,
    identityKeyPair,
    signedPreKeyPair,
    signedPreKeySignature: signature,
    oneTimePreKeys,
    createdAt: new Date(),
  };
}

/**
 * Create a prekey bundle for public distribution
 */
export async function createPreKeyBundle(identity: DeviceIdentity): Promise<PreKeyBundle> {
  await initSodium();
  
  // Get the first available one-time prekey
  let oneTimePreKey: string | undefined;
  let oneTimePreKeyId: string | undefined;
  
  if (identity.oneTimePreKeys.size > 0) {
    const [keyId, keyPair] = identity.oneTimePreKeys.entries().next().value;
    oneTimePreKey = sodium.to_base64(keyPair.publicKey);
    oneTimePreKeyId = keyId;
    
    // Remove the used one-time prekey
    identity.oneTimePreKeys.delete(keyId);
  }
  
  return {
    deviceId: identity.deviceId,
    identityKey: sodium.to_base64(identity.identityKeyPair.publicKey),
    signedPreKey: sodium.to_base64(identity.signedPreKeyPair.publicKey),
    signedPreKeySignature: sodium.to_base64(identity.signedPreKeySignature),
    oneTimePreKey,
    oneTimePreKeyId,
  };
}

/**
 * Replenish one-time prekeys when running low
 */
export async function replenishOneTimePreKeys(identity: DeviceIdentity, targetCount: number = 100): Promise<void> {
  await initSodium();
  
  const currentCount = identity.oneTimePreKeys.size;
  const neededCount = Math.max(0, targetCount - currentCount);
  
  for (let i = 0; i < neededCount; i++) {
    const oneTimePreKeyPair = await generateOneTimePreKeyPair();
    const keyId = generateKeyId();
    identity.oneTimePreKeys.set(keyId, oneTimePreKeyPair);
  }
}

/**
 * Rotate signed prekey periodically for forward secrecy
 */
export async function rotateSignedPreKey(identity: DeviceIdentity): Promise<void> {
  await initSodium();
  
  const newSignedPreKeyPair = await generateSignedPreKeyPair();
  const newSignature = await signPreKey(newSignedPreKeyPair.publicKey, identity.identityKeyPair.privateKey);
  
  identity.signedPreKeyPair = newSignedPreKeyPair;
  identity.signedPreKeySignature = newSignature;
}

/**
 * Get one-time prekey by ID
 */
export function getOneTimePreKey(identity: DeviceIdentity, keyId: string): X3DHKeyPair | null {
  return identity.oneTimePreKeys.get(keyId) || null;
}

/**
 * Remove used one-time prekey
 */
export function removeOneTimePreKey(identity: DeviceIdentity, keyId: string): boolean {
  return identity.oneTimePreKeys.delete(keyId);
}

/**
 * Get identity key fingerprint for verification
 */
export async function getIdentityFingerprint(publicKey: Uint8Array): Promise<string> {
  await initSodium();
  
  const hash = sodium.crypto_generichash(20, publicKey); // 160-bit hash
  
  // Format as hex string with spaces every 4 characters
  const hexString = sodium.to_hex(hash).toUpperCase();
  return hexString.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Serialize device identity for storage
 */
export async function serializeDeviceIdentity(identity: DeviceIdentity): Promise<string> {
  await initSodium();
  
  const serializable = {
    deviceId: identity.deviceId,
    identityKeyPair: {
      publicKey: sodium.to_base64(identity.identityKeyPair.publicKey),
      privateKey: sodium.to_base64(identity.identityKeyPair.privateKey),
    },
    signedPreKeyPair: {
      publicKey: sodium.to_base64(identity.signedPreKeyPair.publicKey),
      privateKey: sodium.to_base64(identity.signedPreKeyPair.privateKey),
    },
    signedPreKeySignature: sodium.to_base64(identity.signedPreKeySignature),
    oneTimePreKeys: Array.from(identity.oneTimePreKeys.entries()).map(([id, keyPair]) => ({
      id,
      publicKey: sodium.to_base64(keyPair.publicKey),
      privateKey: sodium.to_base64(keyPair.privateKey),
    })),
    createdAt: identity.createdAt.toISOString(),
  };
  
  return JSON.stringify(serializable);
}

/**
 * Deserialize device identity from storage
 */
export async function deserializeDeviceIdentity(serialized: string): Promise<DeviceIdentity> {
  await initSodium();
  
  const data = JSON.parse(serialized);
  
  const oneTimePreKeys = new Map<string, X3DHKeyPair>();
  for (const preKey of data.oneTimePreKeys) {
    oneTimePreKeys.set(preKey.id, {
      publicKey: sodium.from_base64(preKey.publicKey),
      privateKey: sodium.from_base64(preKey.privateKey),
    });
  }
  
  return {
    deviceId: data.deviceId,
    identityKeyPair: {
      publicKey: sodium.from_base64(data.identityKeyPair.publicKey),
      privateKey: sodium.from_base64(data.identityKeyPair.privateKey),
    },
    signedPreKeyPair: {
      publicKey: sodium.from_base64(data.signedPreKeyPair.publicKey),
      privateKey: sodium.from_base64(data.signedPreKeyPair.privateKey),
    },
    signedPreKeySignature: sodium.from_base64(data.signedPreKeySignature),
    oneTimePreKeys,
    createdAt: new Date(data.createdAt),
  };
}

/**
 * Generate a unique key ID
 */
function generateKeyId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
