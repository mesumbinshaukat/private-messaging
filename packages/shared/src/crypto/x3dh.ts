import sodium from 'libsodium-wrappers';

export interface X3DHKeyBundle {
  identityKey: string;
  signedPreKey: string;
  signature: string;
  oneTimePreKey?: string;
}

export interface X3DHKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface X3DHSession {
  rootKey: Uint8Array;
  chainKey: Uint8Array;
}

/**
 * Initialize libsodium
 */
let sodiumReady: Promise<void> | null = null;

export async function initSodium(): Promise<void> {
  if (!sodiumReady) {
    sodiumReady = sodium.ready;
  }
  await sodiumReady;
}

/**
 * Generate identity key pair using Curve25519
 */
export async function generateIdentityKeyPair(): Promise<X3DHKeyPair> {
  await initSodium();
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate signed prekey pair
 */
export async function generateSignedPreKeyPair(): Promise<X3DHKeyPair> {
  await initSodium();
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Generate one-time prekey pair
 */
export async function generateOneTimePreKeyPair(): Promise<X3DHKeyPair> {
  await initSodium();
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Sign prekey with identity key
 */
export async function signPreKey(preKeyPublic: Uint8Array, identityPrivate: Uint8Array): Promise<Uint8Array> {
  await initSodium();
  return sodium.crypto_sign_detached(preKeyPublic, identityPrivate);
}

/**
 * Verify prekey signature
 */
export async function verifyPreKeySignature(
  signature: Uint8Array,
  preKeyPublic: Uint8Array,
  identityPublic: Uint8Array
): Promise<boolean> {
  await initSodium();
  try {
    return sodium.crypto_sign_verify_detached(signature, preKeyPublic, identityPublic);
  } catch {
    return false;
  }
}

/**
 * Create X3DH key bundle for publishing
 */
export async function createKeyBundle(
  identityKeyPair: X3DHKeyPair,
  signedPreKeyPair: X3DHKeyPair,
  oneTimePreKeyPair?: X3DHKeyPair
): Promise<X3DHKeyBundle> {
  await initSodium();
  
  const signature = await signPreKey(signedPreKeyPair.publicKey, identityKeyPair.privateKey);
  
  return {
    identityKey: sodium.to_base64(identityKeyPair.publicKey),
    signedPreKey: sodium.to_base64(signedPreKeyPair.publicKey),
    signature: sodium.to_base64(signature),
    oneTimePreKey: oneTimePreKeyPair ? sodium.to_base64(oneTimePreKeyPair.publicKey) : undefined,
  };
}

/**
 * Perform X3DH key agreement (sender side)
 */
export async function performX3DHSender(
  myIdentityKeyPair: X3DHKeyPair,
  myEphemeralKeyPair: X3DHKeyPair,
  theirKeyBundle: X3DHKeyBundle
): Promise<X3DHSession> {
  await initSodium();
  
  const theirIdentityKey = sodium.from_base64(theirKeyBundle.identityKey);
  const theirSignedPreKey = sodium.from_base64(theirKeyBundle.signedPreKey);
  const theirSignature = sodium.from_base64(theirKeyBundle.signature);
  const theirOneTimePreKey = theirKeyBundle.oneTimePreKey 
    ? sodium.from_base64(theirKeyBundle.oneTimePreKey) 
    : null;

  // Verify signature
  const isValidSignature = await verifyPreKeySignature(
    theirSignature,
    theirSignedPreKey,
    theirIdentityKey
  );
  
  if (!isValidSignature) {
    throw new Error('Invalid prekey signature');
  }

  // Perform DH computations
  const dh1 = sodium.crypto_scalarmult(myIdentityKeyPair.privateKey, theirSignedPreKey);
  const dh2 = sodium.crypto_scalarmult(myEphemeralKeyPair.privateKey, theirIdentityKey);
  const dh3 = sodium.crypto_scalarmult(myEphemeralKeyPair.privateKey, theirSignedPreKey);
  
  let masterSecret: Uint8Array;
  if (theirOneTimePreKey) {
    const dh4 = sodium.crypto_scalarmult(myEphemeralKeyPair.privateKey, theirOneTimePreKey);
    masterSecret = new Uint8Array(dh1.length + dh2.length + dh3.length + dh4.length);
    masterSecret.set(dh1, 0);
    masterSecret.set(dh2, dh1.length);
    masterSecret.set(dh3, dh1.length + dh2.length);
    masterSecret.set(dh4, dh1.length + dh2.length + dh3.length);
  } else {
    masterSecret = new Uint8Array(dh1.length + dh2.length + dh3.length);
    masterSecret.set(dh1, 0);
    masterSecret.set(dh2, dh1.length);
    masterSecret.set(dh3, dh1.length + dh2.length);
  }

  // Derive root key and chain key
  const kdf = sodium.crypto_kdf_derive_from_key(64, 1, 'X3DH_KEY', masterSecret);
  const rootKey = kdf.slice(0, 32);
  const chainKey = kdf.slice(32, 64);

  return {
    rootKey,
    chainKey,
  };
}

/**
 * Perform X3DH key agreement (receiver side)
 */
export async function performX3DHReceiver(
  myIdentityKeyPair: X3DHKeyPair,
  mySignedPreKeyPair: X3DHKeyPair,
  myOneTimePreKeyPair: X3DHKeyPair | null,
  theirIdentityKey: Uint8Array,
  theirEphemeralKey: Uint8Array
): Promise<X3DHSession> {
  await initSodium();

  // Perform DH computations (mirror of sender)
  const dh1 = sodium.crypto_scalarmult(mySignedPreKeyPair.privateKey, theirIdentityKey);
  const dh2 = sodium.crypto_scalarmult(myIdentityKeyPair.privateKey, theirEphemeralKey);
  const dh3 = sodium.crypto_scalarmult(mySignedPreKeyPair.privateKey, theirEphemeralKey);
  
  let masterSecret: Uint8Array;
  if (myOneTimePreKeyPair) {
    const dh4 = sodium.crypto_scalarmult(myOneTimePreKeyPair.privateKey, theirEphemeralKey);
    masterSecret = new Uint8Array(dh1.length + dh2.length + dh3.length + dh4.length);
    masterSecret.set(dh1, 0);
    masterSecret.set(dh2, dh1.length);
    masterSecret.set(dh3, dh1.length + dh2.length);
    masterSecret.set(dh4, dh1.length + dh2.length + dh3.length);
  } else {
    masterSecret = new Uint8Array(dh1.length + dh2.length + dh3.length);
    masterSecret.set(dh1, 0);
    masterSecret.set(dh2, dh1.length);
    masterSecret.set(dh3, dh1.length + dh2.length);
  }

  // Derive root key and chain key
  const kdf = sodium.crypto_kdf_derive_from_key(64, 1, 'X3DH_KEY', masterSecret);
  const rootKey = kdf.slice(0, 32);
  const chainKey = kdf.slice(32, 64);

  return {
    rootKey,
    chainKey,
  };
}
