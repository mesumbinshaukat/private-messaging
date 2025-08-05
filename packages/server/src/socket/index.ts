import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import { authenticateToken } from '../middleware/auth';
import { IMessageEnvelope, User, MessageEnvelope, AuditLog, Device } from '../models';
import { Types } from 'mongoose';
import crypto from 'crypto';

dotenv.config();

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

pubClient.connect().catch(console.error);
subClient.connect().catch(console.error);

// Store connected devices for multi-device sync
const connectedDevices = new Map<string, Set<string>>(); // userId -> Set of socketIds
const deviceSocketMap = new Map<string, { userId: string, deviceId: string }>(); // socketId -> device info

// Message acknowledgment tracking
interface MessageAck {
  messageId: string;
  senderId: string;
  recipientId: string;
  conversationId: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
  deviceId?: string;
}

const pendingAcks = new Map<string, MessageAck>(); // messageId -> ack info

export function setupSocketIO(server: any) {
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.adapter(createAdapter(pubClient, subClient));

  const messagingNamespace = io.of('/messaging');
  
  messagingNamespace.use((socket, next) => {
    const token = socket.handshake.auth.token;
    authenticateToken({ headers: { authorization: `Bearer ${token}` } }, 
      {} as any, 
      next as any);
  });

  messagingNamespace.on('connection', (socket: Socket) => {
    const { userId } = socket.request as any;
    console.log(`User ${userId} connected to messaging namespace.`);

    // Device registration and multi-device handling
    socket.on('registerDevice', async (data: { conversationIds: string[], deviceId: string }) => {
      try {
        const { conversationIds, deviceId } = data;
        
        // Store device info
        deviceSocketMap.set(socket.id, { userId, deviceId });
        
        // Add to connected devices
        if (!connectedDevices.has(userId)) {
          connectedDevices.set(userId, new Set());
        }
        connectedDevices.get(userId)!.add(socket.id);

        // Join conversation rooms
        conversationIds.forEach((conversationId) => {
          socket.join(conversationId);
        });

        // Join user's personal room for multi-device sync
        socket.join(`user:${userId}`);

        AuditLog.logEvent({
          userId,
          action: 'device.register',
          category: 'system',
          severity: 'info',
          status: 'success',
          description: 'Device registered and joined conversations',
          context: {
            deviceId,
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          },
        });
      } catch (error) {
        console.error('Error registering device:', error);
      }
    });

    // Legacy support for joinConversations
    socket.on('joinConversations', (conversationIds: string[]) => {
      conversationIds.forEach((conversationId) => {
        socket.join(conversationId);
      });

      AuditLog.logEvent({
        userId,
        action: 'socket.join_conversations',
        category: 'system',
        severity: 'info',
        status: 'success',
        description: `User joined conversations`,
        context: {
          ipAddress: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent']
        },
      });
    });

// Handle sending messages
    socket.on('sendMessage', async (data: IMessageEnvelope) => {
      try {
        const sender = await User.findById(data.senderId);
        if (!sender || sender.status !== 'active') {
          throw new Error('Invalid sender');
        }

        // Generate unique messageId
        data.messageId = crypto.randomUUID();
        const message = new MessageEnvelope(data);
        await message.save();

        // Emit message to the recipient's conversation room
        socket.to(data.conversationId).emit('newMessage', message);

        // Add to pending acknowledgments
        pendingAcks.set(data.messageId, {
          messageId: data.messageId,
          senderId: data.senderId,
          recipientId: data.recipientId,
          conversationId: data.conversationId,
          timestamp: new Date(),
          status: 'sent',
        });

        // Logging the event
        AuditLog.logEvent({
          action: 'message.send',
          category: 'message',
          severity: 'info',
          status: 'success',
          userId,
          description: 'User sent a message',
          context: {
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          },
        });
      } catch (error: any) {
        console.error('Error sending message:', error);

        // Logging the failure
        AuditLog.logEvent({
          action: 'message.send_failure',
          category: 'message',
          severity: 'error',
          status: 'failure',
          userId,
          description: 'Failed to send message',
          error: {
            code: error.name,
            message: error.message
          },
          context: {
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          },
        });
      }
    });

    // Enhanced message acknowledgment handling
    socket.on('acknowledgeMessage', async (ack: { 
      messageId: string, 
      status: 'delivered' | 'read', 
      timestamp?: Date 
    }) => {
      try {
        const deviceInfo = deviceSocketMap.get(socket.id);
        if (!deviceInfo) return;

        const { deviceId } = deviceInfo;
        const message = await MessageEnvelope.findOne({ messageId: ack.messageId });
        if (!message) return;

        // Update delivery receipts
        if (ack.status === 'delivered') {
          await message.markAsDelivered(new Types.ObjectId(deviceId));
        } else if (ack.status === 'read') {
          await message.markAsRead(new Types.ObjectId(deviceId));
        }

        // Update pending acknowledgments
        const pendingAck = pendingAcks.get(ack.messageId);
        if (pendingAck) {
          pendingAck.status = ack.status;
          pendingAck.timestamp = ack.timestamp || new Date();
          pendingAck.deviceId = deviceId;

          // Notify sender about status update on all their devices
          socket.to(`user:${pendingAck.senderId}`).emit('messageStatusUpdate', {
            messageId: ack.messageId,
            status: ack.status,
            timestamp: pendingAck.timestamp,
            deviceId,
            recipientId: pendingAck.recipientId
          });

          // Remove from pending if read
          if (ack.status === 'read') {
            pendingAcks.delete(ack.messageId);
          }
        }
      } catch (error) {
        console.error('Error processing acknowledgment:', error);
      }
    });

    // Multi-device sync request
    socket.on('requestSync', async (data: { 
      conversationId?: string, 
      lastSyncTime?: Date,
      messageCount?: number 
    }) => {
      try {
        const query: any = {
          $or: [
            { senderId: userId },
            { recipientId: userId }
          ],
          deletedAt: { $exists: false }
        };

        if (data.conversationId) {
          query.conversationId = data.conversationId;
        }

        if (data.lastSyncTime) {
          query.updatedAt = { $gt: new Date(data.lastSyncTime) };
        }

        const messages = await MessageEnvelope.find(query)
          .sort({ createdAt: -1 })
          .limit(data.messageCount || 50)
          .populate('senderId', 'username displayName avatar')
          .populate('recipientId', 'username displayName avatar');

        socket.emit('syncResponse', {
          messages: messages.map(msg => ({
            ...msg.toObject(),
            _id: msg._id.toString()
          })),
          syncTime: new Date()
        });
      } catch (error) {
        console.error('Error during sync:', error);
        socket.emit('syncError', { error: 'Sync failed' });
      }
    });

    // Typing indicators with rooms
    socket.on('startTyping', (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit('userStartedTyping', {
        userId,
        conversationId: data.conversationId,
        timestamp: new Date()
      });
    });

    socket.on('stopTyping', (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit('userStoppedTyping', {
        userId,
        conversationId: data.conversationId,
        timestamp: new Date()
      });
    });

    // Legacy support for old acknowledgment events
    socket.on('messageDelivered', (messageId: string) => {
      socket.emit('acknowledgeMessage', {
        messageId,
        status: 'delivered',
        timestamp: new Date()
      });
    });

    socket.on('messageRead', (messageId: string) => {
      socket.emit('acknowledgeMessage', {
        messageId,
        status: 'read',
        timestamp: new Date()
      });
    });

    // Handle disconnects with cleanup
    socket.on('disconnect', () => {
      const deviceInfo = deviceSocketMap.get(socket.id);
      const deviceId = deviceInfo?.deviceId || 'unknown';
      
      console.log(`User ${userId} (device: ${deviceId}) disconnected from messaging namespace.`);

      // Remove from connected devices
      const userSockets = connectedDevices.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          connectedDevices.delete(userId);
        }
      }

      // Remove device socket mapping
      deviceSocketMap.delete(socket.id);

      AuditLog.logEvent({
        userId,
        action: 'socket.disconnect',
        category: 'system',
        severity: 'info',
        status: 'success',
        description: `User disconnected from messaging namespace`,
        context: {
          deviceId,
          ipAddress: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent']
        },
      });
    });
  });

  return io;
}

// Utility functions for multi-device management
export function getConnectedDevices(userId: string): string[] {
  const sockets = connectedDevices.get(userId);
  if (!sockets) return [];
  
  return Array.from(sockets).map(socketId => {
    const deviceInfo = deviceSocketMap.get(socketId);
    return deviceInfo?.deviceId || socketId;
  });
}

export function getUserDeviceCount(userId: string): number {
  return connectedDevices.get(userId)?.size || 0;
}

export function isUserOnline(userId: string): boolean {
  return connectedDevices.has(userId) && connectedDevices.get(userId)!.size > 0;
}

// Message acknowledgment utilities
export function getPendingAcknowledgments(userId: string): MessageAck[] {
  const pending: MessageAck[] = [];
  for (const ack of pendingAcks.values()) {
    if (ack.senderId === userId || ack.recipientId === userId) {
      pending.push(ack);
    }
  }
  return pending;
}

export function clearExpiredAcknowledgments(maxAge: number = 24 * 60 * 60 * 1000): number {
  const now = new Date();
  let cleared = 0;
  
  for (const [messageId, ack] of pendingAcks.entries()) {
    if (now.getTime() - ack.timestamp.getTime() > maxAge) {
      pendingAcks.delete(messageId);
      cleared++;
    }
  }
  
  return cleared;
}

// Offline message queueing (used by enhanced-messaging.ts)
export { queueOfflineMessage } from './enhanced-messaging';
