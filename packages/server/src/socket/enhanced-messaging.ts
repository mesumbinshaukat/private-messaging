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

// Offline message queue tracking
interface OfflineQueue {
  userId: string;
  messages: IMessageEnvelope[];
  lastSyncTime: Date;
}

const offlineQueues = new Map<string, OfflineQueue>(); // userId -> offline queue

export function setupEnhancedSocketIO(server: any) {
  const io = new Server(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.adapter(createAdapter(pubClient, subClient));

  const messagingNamespace = io.of('/messaging');
  
  messagingNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const deviceId = socket.handshake.auth.deviceId;
      
      if (!token || !deviceId) {
        return next(new Error('Missing authentication data'));
      }

      // Authenticate the token
      await new Promise((resolve, reject) => {
        authenticateToken({ headers: { authorization: `Bearer ${token}` } }, 
          {} as any, 
          (err: any) => {
            if (err) reject(err);
            else resolve(true);
          });
      });

      // Store device info
      const { userId } = socket.request as any;
      deviceSocketMap.set(socket.id, { userId, deviceId });
      
      // Add to connected devices
      if (!connectedDevices.has(userId)) {
        connectedDevices.set(userId, new Set());
      }
      connectedDevices.get(userId)!.add(socket.id);

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  messagingNamespace.on('connection', (socket: Socket) => {
    const deviceInfo = deviceSocketMap.get(socket.id);
    if (!deviceInfo) return;

    const { userId, deviceId } = deviceInfo;
    console.log(`User ${userId} (device: ${deviceId}) connected to messaging namespace.`);

    // Device registration and room joining
    socket.on('registerDevice', async (data: { conversationIds: string[] }) => {
      try {
        // Join conversation rooms
        data.conversationIds.forEach((conversationId) => {
          socket.join(conversationId);
        });

        // Join user's personal room for multi-device sync
        socket.join(`user:${userId}`);

        // Send offline messages if any
        await syncOfflineMessages(socket, userId);

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

    // Enhanced message sending with acknowledgment flow
    socket.on('sendMessage', async (data: IMessageEnvelope, callback?: Function) => {
      try {
        const sender = await User.findById(data.senderId);
        if (!sender || sender.status !== 'active') {
          throw new Error('Invalid sender');
        }

        // Generate unique messageId if not provided
        if (!data.messageId) {
          data.messageId = crypto.randomUUID();
        }

        // Set sender device
        data.senderDeviceId = new Types.ObjectId(deviceId);
        
        const message = new MessageEnvelope({
          ...data,
          status: 'sent',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        await message.save();

        // Create acknowledgment entry
        pendingAcks.set(data.messageId, {
          messageId: data.messageId,
          senderId: userId,
          recipientId: data.recipientId.toString(),
          conversationId: data.conversationId,
          timestamp: new Date(),
          status: 'sent',
          deviceId
        });

        // Emit to conversation room (excluding sender)
        socket.to(data.conversationId).emit('newMessage', {
          ...message.toObject(),
          _id: message._id.toString()
        });

        // Emit to all recipient devices for multi-device sync
        socket.to(`user:${data.recipientId}`).emit('messageSync', {
          ...message.toObject(),
          _id: message._id.toString()
        });

        // Send confirmation to sender
        if (callback) {
          callback({ success: true, messageId: data.messageId });
        }

        AuditLog.logEvent({
          action: 'message.send',
          category: 'message',
          severity: 'info',
          status: 'success',
          userId,
          description: 'Message sent successfully',
          context: {
            messageId: data.messageId,
            conversationId: data.conversationId,
            deviceId,
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          },
        });
      } catch (error: any) {
        console.error('Error sending message:', error);

        if (callback) {
          callback({ success: false, error: error.message });
        }

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
            deviceId,
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          },
        });
      }
    });

    // Message acknowledgment handling
    socket.on('acknowledgeMessage', async (ack: { 
      messageId: string, 
      status: 'delivered' | 'read', 
      timestamp?: Date 
    }) => {
      try {
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

          // Notify sender about status update
          socket.to(`user:${pendingAck.senderId}`).emit('messageStatusUpdate', {
            messageId: ack.messageId,
            status: ack.status,
            timestamp: pendingAck.timestamp,
            deviceId
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

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`User ${userId} (device: ${deviceId}) disconnected`);

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
        description: 'User disconnected from messaging namespace',
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

// Helper function to sync offline messages
async function syncOfflineMessages(socket: Socket, userId: string) {
  try {
    const offlineQueue = offlineQueues.get(userId);
    if (offlineQueue && offlineQueue.messages.length > 0) {
      // Send queued messages
      for (const message of offlineQueue.messages) {
        socket.emit('newMessage', message);
      }

      // Clear the queue
      offlineQueues.delete(userId);
    }

    // Get undelivered messages from database
    const undeliveredMessages = await MessageEnvelope.find({
      recipientId: userId,
      status: { $in: ['sent', 'pending'] },
      createdAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    }).sort({ createdAt: 1 });

    for (const message of undeliveredMessages) {
      socket.emit('newMessage', {
        ...message.toObject(),
        _id: message._id.toString()
      });
    }
  } catch (error) {
    console.error('Error syncing offline messages:', error);
  }
}

// Store message for offline delivery
export function queueOfflineMessage(recipientId: string, message: IMessageEnvelope) {
  if (!offlineQueues.has(recipientId)) {
    offlineQueues.set(recipientId, {
      userId: recipientId,
      messages: [],
      lastSyncTime: new Date()
    });
  }

  const queue = offlineQueues.get(recipientId)!;
  queue.messages.push(message);
  queue.lastSyncTime = new Date();
}
