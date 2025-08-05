// User types
export interface User {
  id: string;
  username: string;
  email: string;
  publicKey: string;
  createdAt: Date;
  updatedAt: Date;
  isOnline: boolean;
}

// Message types
export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string; // encrypted content
  encryptedKey: string; // encrypted symmetric key
  timestamp: Date;
  isRead: boolean;
  messageType: MessageType;
}

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
  IMAGE = 'image',
}

// Conversation types
export interface Conversation {
  id: string;
  participants: string[]; // user IDs
  lastMessage?: Message;
  createdAt: Date;
  updatedAt: Date;
}

// WebRTC types
export interface PeerConnectionData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidates: RTCIceCandidate[];
  userId: string;
  conversationId: string;
}

// Socket event types
export interface SocketEvents {
  // Authentication
  authenticate: (token: string) => void;
  authenticated: (user: User) => void;
  
  // Messages
  'message:send': (message: Omit<Message, 'id' | 'timestamp'>) => void;
  'message:receive': (message: Message) => void;
  'message:read': (messageId: string) => void;
  
  // Conversations
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  'conversation:typing': (conversationId: string, isTyping: boolean) => void;
  
  // WebRTC signaling
  'webrtc:offer': (data: PeerConnectionData) => void;
  'webrtc:answer': (data: PeerConnectionData) => void;
  'webrtc:ice-candidate': (data: { candidate: RTCIceCandidate; conversationId: string; userId: string }) => void;
  
  // User status
  'user:status': (userId: string, isOnline: boolean) => void;
  
  // Errors
  error: (error: { message: string; code?: string }) => void;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Authentication types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  publicKey: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Crypto key types
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedData {
  encryptedContent: string;
  encryptedKey: string;
  iv: string;
}

// Advanced crypto types
export interface X3DHKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface X3DHKeyBundle {
  identityKey: string;
  signedPreKey: string;
  signature: string;
  oneTimePreKey?: string;
}

export interface X3DHSession {
  rootKey: Uint8Array;
  chainKey: Uint8Array;
}

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

// File upload types
export interface FileUpload {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: Date;
}
