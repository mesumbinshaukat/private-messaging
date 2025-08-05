# Messaging Architecture

## Sequence Diagrams

### Multi-Device Session Handling
```plaintext
device_A -> server : Connect
server -> device_A: Session Token
device_B -> server: Connect
server -> device_B: Session Token
device_A <-> device_B: Sync Sessions
```

### Message ACK/NACK
```plaintext
device -> server: Send Message
server -> device: ACK
server -> device: NACK (if error)
```

### Offline Queue Storage
```plaintext
device -> server: Send Message
server -> MongoDB: Store Message
server -> Redis: Enqueue to Stream
```

## Socket Events
- `typing`: Indicates user is typing
- `delivered`: Message delivered to server
- `read`: Message read by recipient

## Encryption Flow
Each device has a unique end-to-end (E2E) key.
- Device generates E2E key for each session
- Messages are encrypted with the recipient's E2E key
- Server does not decrypt messages

### Key Exchange
```plaintext
device_A -> server: Request Device B Key
server -> device_A: Device B Key
```

### Message Encryption
```plaintext
device_A -> device_B: Encrypt(Message, Device B Key)
```

