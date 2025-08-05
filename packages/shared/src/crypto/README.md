# Shared Crypto Library

This is a comprehensive cryptographic library implementing modern end-to-end encryption protocols for secure messaging. The library provides Double Ratchet messaging, X3DH key agreement, hybrid encryption, device identity management, and streaming APIs for large files.

## Features

### ✅ Implemented Features

1. **X3DH (Extended Triple Diffie-Hellman) Key Agreement**
   - Identity key pairs generation using Curve25519
   - Signed prekey generation and verification
   - One-time prekey generation
   - Complete X3DH key agreement protocol implementation
   - Signature verification with Ed25519

2. **Double Ratchet Protocol**
   - Forward-secure messaging with automatic key rotation
   - Out-of-order message handling with skipped key storage
   - Symmetric and asymmetric ratcheting
   - XChaCha20-Poly1305 AEAD encryption for messages

3. **Hybrid Forward-Secure Encryption**
   - AES-256-GCM + Curve25519 ECDH
   - Ephemeral key generation for perfect forward secrecy
   - Deterministic key derivation using libsodium

4. **Per-Device Identity Management**
   - Device-specific identity key generation
   - One-time prekey cache with automatic replenishment
   - Signed prekey rotation for forward secrecy
   - Identity fingerprint generation for verification
   - Serialization/deserialization for storage

5. **Message Encryption SDK with Streaming API**
   - High-level SDK for message encryption/decryption
   - File streaming support for large files (64KB chunks)
   - Out-of-order chunk handling
   - Automatic session management
   - Resource cleanup and memory management

6. **Comprehensive Test Suite**
   - Unit tests for all crypto operations
   - Wycheproof-style test vectors
   - Edge case handling tests
   - Performance and security validation

## Architecture

```
shared/src/crypto/
├── x3dh.ts           # X3DH key agreement protocol
├── double-ratchet.ts # Double Ratchet messaging protocol
├── hybrid.ts         # Hybrid encryption (AES-GCM + Curve25519)
├── identity.ts       # Device identity and prekey management
├── sdk.ts           # High-level Message Encryption SDK
└── README.md        # This documentation
```

## Usage Examples

### Basic Message Encryption

```typescript
import { 
  generateDeviceIdentity, 
  MessageEncryptionSDK 
} from '@private-messaging/shared';

// Initialize devices
const aliceIdentity = await generateDeviceIdentity('alice-device', 100);
const bobIdentity = await generateDeviceIdentity('bob-device', 100);

// Create SDKs
const aliceSDK = new MessageEncryptionSDK(aliceIdentity);
const bobSDK = new MessageEncryptionSDK(bobIdentity);

// Key exchange
const bobKeyBundle = await bobSDK.createPreKeyBundle();
await aliceSDK.initializeSession(bobKeyBundle);

// Encrypt message
const message = "Hello, secure world!";
const encrypted = await aliceSDK.encryptMessage(message);

// Decrypt message (after session sync)
const decrypted = await bobSDK.decryptMessage(encrypted);
console.log(decrypted); // "Hello, secure world!"
```

### File Streaming Encryption

```typescript
// Large file encryption
const fileId = 'large-document.pdf';
const fileData = new Uint8Array(10 * 1024 * 1024); // 10MB file

// Start file encryption
const { encryptionKey, totalChunks } = await aliceSDK.startFileEncryption(
  fileId, 
  fileData.length
);

// Split and encrypt chunks
const chunks = aliceSDK.splitFileIntoChunks(fileData);
const encryptedChunks = [];

for (const chunk of chunks) {
  const encryptedChunk = await aliceSDK.encryptFileChunk(fileId, chunk);
  encryptedChunks.push(encryptedChunk);
}

// Receiver side: decrypt and assemble
await bobSDK.startFileDecryption(fileId, encryptionKey, totalChunks);

for (const encryptedChunk of encryptedChunks) {
  await bobSDK.decryptFileChunk(fileId, encryptedChunk);
}

const assembledFile = await bobSDK.assembleFile(fileId);
// assembledFile === fileData
```

### Device Identity Management

```typescript
import { 
  generateDeviceIdentity, 
  createPreKeyBundle,
  replenishOneTimePreKeys,
  rotateSignedPreKey,
  getIdentityFingerprint,
  serializeDeviceIdentity
} from '@private-messaging/shared';

// Generate device identity
const identity = await generateDeviceIdentity('device-123', 100);

// Get fingerprint for verification
const fingerprint = await getIdentityFingerprint(identity.identityKeyPair.publicKey);
console.log('Identity fingerprint:', fingerprint);

// Create prekey bundle for key exchange
const preKeyBundle = await createPreKeyBundle(identity);

// Maintain key hygiene
await replenishOneTimePreKeys(identity, 100); // Replenish to 100 keys
await rotateSignedPreKey(identity); // Rotate signed prekey

// Serialize for storage
const serialized = await serializeDeviceIdentity(identity);
localStorage.setItem('device-identity', serialized);
```

## Security Features

### Forward Secrecy
- **Double Ratchet**: Automatic key rotation ensures old keys cannot decrypt new messages
- **Ephemeral Keys**: X3DH uses ephemeral keys that are discarded after use
- **One-time Prekeys**: Each key exchange consumes a unique one-time prekey

### Cryptographic Primitives
- **Curve25519**: Elliptic curve for key agreement (ECDH)
- **Ed25519**: Digital signatures for authentication
- **XChaCha20-Poly1305**: Authenticated encryption for messages
- **AES-256-GCM**: Authenticated encryption for file chunks
- **BLAKE2b**: Key derivation and hashing

### Threat Model Protection
- **Compromise Recovery**: Forward secrecy protects future messages if keys are compromised
- **Replay Attacks**: Message numbering and authentication prevent replay attacks
- **Man-in-the-Middle**: Identity verification and signed prekeys prevent MITM
- **Data Integrity**: Authenticated encryption ensures messages cannot be tampered

## Performance Considerations

### File Streaming
- **Chunk Size**: 64KB chunks balance memory usage and encryption overhead
- **Parallel Processing**: Chunks can be encrypted/decrypted independently
- **Memory Efficiency**: Streaming prevents loading entire files into memory

### Key Management
- **Prekey Cache**: 100 one-time prekeys by default, automatically replenished
- **Key Rotation**: Signed prekeys rotated periodically for forward secrecy
- **Storage Optimization**: Binary serialization for efficient storage

## Testing

The library includes comprehensive tests:

```bash
npm test
```

Test coverage includes:
- **Unit Tests**: Individual function testing
- **Integration Tests**: End-to-end protocol testing
- **Wycheproof Vectors**: Industry-standard test vectors
- **Edge Cases**: Out-of-order delivery, corrupted data, etc.

## Dependencies

- **libsodium-wrappers**: Modern cryptographic library
- **crypto-js**: Legacy crypto support (deprecated)
- **zod**: Schema validation

## Security Audit

This implementation follows established cryptographic protocols:
- **X3DH**: Signal Protocol specification
- **Double Ratchet**: Signal Protocol specification
- **Hybrid Encryption**: Industry best practices

⚠️ **Production Note**: This implementation is for educational/development purposes. Production deployments should undergo formal security audits.

## API Reference

### Core Functions

#### X3DH Key Agreement
```typescript
// Generate key pairs
generateIdentityKeyPair(): Promise<X3DHKeyPair>
generateSignedPreKeyPair(): Promise<X3DHKeyPair>
generateOneTimePreKeyPair(): Promise<X3DHKeyPair>

// Key agreement
performX3DHSender(identity: X3DHKeyPair, ephemeral: X3DHKeyPair, bundle: X3DHKeyBundle): Promise<X3DHSession>
performX3DHReceiver(identity: X3DHKeyPair, signedPreKey: X3DHKeyPair, oneTimePreKey: X3DHKeyPair | null, theirIdentity: Uint8Array, theirEphemeral: Uint8Array): Promise<X3DHSession>
```

#### Double Ratchet
```typescript
// Initialize ratchet
initializeDoubleRatchet(rootKey: Uint8Array, isInitiator: boolean, theirRatchetKey?: Uint8Array): Promise<DoubleRatchetState>

// Message encryption/decryption
encryptMessage(state: DoubleRatchetState, plaintext: string): Promise<{message: EncryptedMessage, newState: DoubleRatchetState}>
decryptMessage(state: DoubleRatchetState, message: EncryptedMessage): Promise<{plaintext: string, newState: DoubleRatchetState}>
```

#### Device Identity
```typescript
// Identity management
generateDeviceIdentity(deviceId: string, oneTimeKeyCount?: number): Promise<DeviceIdentity>
createPreKeyBundle(identity: DeviceIdentity): Promise<PreKeyBundle>
replenishOneTimePreKeys(identity: DeviceIdentity, targetCount?: number): Promise<void>
rotateSignedPreKey(identity: DeviceIdentity): Promise<void>
```

#### Message Encryption SDK
```typescript
class MessageEncryptionSDK {
  constructor(identity: DeviceIdentity)
  
  // Session management
  initializeSession(keyBundle: X3DHKeyBundle): Promise<void>
  
  // Message encryption
  encryptMessage(plaintext: string): Promise<EncryptedMessage>
  decryptMessage(message: EncryptedMessage): Promise<string>
  
  // File streaming
  startFileEncryption(fileId: string, fileSize: number): Promise<{encryptionKey: string, totalChunks: number}>
  encryptFileChunk(fileId: string, chunk: StreamChunk): Promise<EncryptedChunk>
  startFileDecryption(fileId: string, encryptionKey: string, totalChunks: number): Promise<void>
  decryptFileChunk(fileId: string, chunk: EncryptedChunk): Promise<StreamChunk>
  assembleFile(fileId: string): Promise<Uint8Array>
  
  // Utility
  splitFileIntoChunks(data: Uint8Array): StreamChunk[]
  cleanup(): void
}
```

## Contributing

When contributing to the crypto library:

1. **Security First**: All changes must maintain or improve security
2. **Test Coverage**: New features require comprehensive tests
3. **Documentation**: Update documentation for API changes
4. **Code Review**: All crypto code requires thorough review
5. **Audit Trail**: Document security-relevant decisions

## License

This implementation is provided under the same license as the parent project.
