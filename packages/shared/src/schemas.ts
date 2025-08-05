import { z } from 'zod';
import { MessageType } from './types';

// User schemas
export const UserSchema = z.object({
  id: z.string(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  publicKey: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  isOnline: z.boolean(),
});

export const LoginCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const RegisterDataSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8),
  publicKey: z.string(),
});

// Message schemas
export const MessageSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  receiverId: z.string(),
  content: z.string(),
  encryptedKey: z.string(),
  timestamp: z.date(),
  isRead: z.boolean(),
  messageType: z.nativeEnum(MessageType),
});

export const CreateMessageSchema = z.object({
  receiverId: z.string(),
  content: z.string(),
  encryptedKey: z.string(),
  messageType: z.nativeEnum(MessageType).default(MessageType.TEXT),
});

// Conversation schemas
export const ConversationSchema = z.object({
  id: z.string(),
  participants: z.array(z.string()),
  lastMessage: MessageSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// WebRTC schemas
export const PeerConnectionDataSchema = z.object({
  offer: z.object({
    type: z.literal('offer'),
    sdp: z.string(),
  }).optional(),
  answer: z.object({
    type: z.literal('answer'),
    sdp: z.string(),
  }).optional(),
  iceCandidates: z.array(z.object({
    candidate: z.string(),
    sdpMLineIndex: z.number().nullable(),
    sdpMid: z.string().nullable(),
  })),
  userId: z.string(),
  conversationId: z.string(),
});

// API Response schemas
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

// File upload schemas
export const FileUploadSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimetype: z.string(),
  size: z.number().positive(),
  url: z.string().url(),
  uploadedBy: z.string(),
  uploadedAt: z.date(),
});

// Validation helpers
export const validateEmail = (email: string): boolean => {
  return LoginCredentialsSchema.pick({ email: true }).safeParse({ email }).success;
};

export const validatePassword = (password: string): boolean => {
  return LoginCredentialsSchema.pick({ password: true }).safeParse({ password }).success;
};

export const validateUsername = (username: string): boolean => {
  return RegisterDataSchema.pick({ username: true }).safeParse({ username }).success;
};
