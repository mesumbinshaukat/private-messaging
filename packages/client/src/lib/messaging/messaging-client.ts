import { io, Socket } from 'socket.io-client';
import OfflineStorage, { Message, OfflineQueue } from './offline-storage';
import SearchEngine from './search-engine';

interface MessagingClientOptions {
  serverUrl: string;
  token: string;
  deviceId: string;
  userId: string;
  onMessage?: (message: Message) => void;
  onMessageStatusUpdate?: (update: { messageId: string; status: string; timestamp: Date }) => void;
  onConnectionStatusChange?: (connected: boolean) => void;
  onTypingIndicator?: (data: { userId: string; conversationId: string; isTyping: boolean }) => void;
}

interface SendMessageOptions {
  conversationId: string;
  recipientId: string;
  content: string;
  messageType?: 'text' | 'file' | 'image' | 'video' | 'audio' | 'document';
  metadata?: any;
  replyToMessageId?: string;
}

class MessagingClient {
  private socket: Socket | null = null;
  private offlineStorage: OfflineStorage;
  private searchEngine: SearchEngine;
  private options: MessagingClientOptions;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private syncInProgress = new Set<string>();
  private messageCallbacks = new Map<string, Function>();

  constructor(options: MessagingClientOptions) {
    this.options = options;
    this.offlineStorage = new OfflineStorage();
    this.searchEngine = new SearchEngine();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize offline storage
      await this.offlineStorage.init();
      
      // Initialize search engine with messages from storage
      await this.initializeSearchEngine();
      
      // Connect to server
      await this.connect();
      
      // Process offline queue
      await this.processOfflineQueue();
      
      console.log('Messaging client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize messaging client:', error);
      throw error;
    }
  }

  private async initializeSearchEngine(): Promise<void> {
    // This will be implemented when we create the search engine
    // For now, just initialize it
    await this.searchEngine.init();
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = io(`${this.options.serverUrl}/messaging`, {
        auth: {
          token: this.options.token,
          deviceId: this.options.deviceId
        },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay
      });

      this.socket.on('connect', () => {
        console.log('Connected to messaging server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.options.onConnectionStatusChange?.(true);
        resolve();
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from messaging server');
        this.isConnected = false;
        this.options.onConnectionStatusChange?.(false);
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect after maximum attempts'));
        }
      });

      // Message handlers
      this.socket.on('newMessage', async (message: Message) => {
        await this.handleIncomingMessage(message);
      });

      this.socket.on('messageSync', async (message: Message) => {
        await this.handleMessageSync(message);
      });

      this.socket.on('messageStatusUpdate', (update) => {
        this.handleMessageStatusUpdate(update);
      });

      this.socket.on('syncResponse', async (data) => {
        await this.handleSyncResponse(data);
      });

      // Typing indicators
      this.socket.on('userStartedTyping', (data) => {
        this.options.onTypingIndicator?.({ ...data, isTyping: true });
      });

      this.socket.on('userStoppedTyping', (data) => {
        this.options.onTypingIndicator?.({ ...data, isTyping: false });
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.options.onConnectionStatusChange?.(false);
    }
  }

  async registerDevice(conversationIds: string[]): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Not connected to server');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit('registerDevice', { conversationIds }, (response: any) => {
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Registration failed'));
        }
      });
    });
  }

  async sendMessage(options: SendMessageOptions): Promise<string> {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const message: Message = {
      id: messageId,
      messageId,
      conversationId: options.conversationId,
      senderId: this.options.userId,
      recipientId: options.recipientId,
      content: options.content,
      encryptedContent: options.content, // TODO: Add encryption
      messageType: options.messageType || 'text',
      status: 'pending',
      timestamp: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: options.metadata,
      replyToMessageId: options.replyToMessageId
    };

    // Save message locally first
    await this.offlineStorage.saveMessage(message);
    await this.searchEngine.indexMessage(message);

    if (this.isConnected && this.socket) {
      try {
        // Send message to server
        const response = await new Promise<any>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Message send timeout'));
          }, 10000);

          this.socket!.emit('sendMessage', message, (response: any) => {
            clearTimeout(timeout);
            if (response?.success) {
              resolve(response);
            } else {
              reject(new Error(response?.error || 'Failed to send message'));
            }
          });
        });

        // Update message status
        message.status = 'sent';
        await this.offlineStorage.saveMessage(message);
        
        return messageId;
      } catch (error) {
        console.error('Failed to send message:', error);
        
        // Add to offline queue
        await this.offlineStorage.addToOfflineQueue(message);
        message.status = 'failed';
        await this.offlineStorage.saveMessage(message);
        
        throw error;
      }
    } else {
      // Add to offline queue
      await this.offlineStorage.addToOfflineQueue(message);
      message.status = 'pending';
      await this.offlineStorage.saveMessage(message);
      
      return messageId;
    }
  }

  async getMessages(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
    return this.offlineStorage.getMessages(conversationId, limit, offset);
  }

  async searchMessages(query: string, conversationId?: string): Promise<Message[]> {
    const messageIds = await this.searchEngine.search(query, conversationId);
    const messages: Message[] = [];
    
    for (const messageId of messageIds) {
      const message = await this.offlineStorage.getMessage(messageId);
      if (message) {
        messages.push(message);
      }
    }
    
    return messages.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async acknowledgeMessage(messageId: string, status: 'delivered' | 'read'): Promise<void> {
    if (this.socket?.connected) {
      this.socket.emit('acknowledgeMessage', {
        messageId,
        status,
        timestamp: new Date()
      });
    }

    // Update local status
    await this.offlineStorage.updateMessageStatus(messageId, status);
  }

  async requestSync(conversationId?: string, lastSyncTime?: Date): Promise<void> {
    if (!this.socket?.connected) {
      return;
    }

    if (this.syncInProgress.has(conversationId || 'global')) {
      return;
    }

    this.syncInProgress.add(conversationId || 'global');

    try {
      this.socket.emit('requestSync', {
        conversationId,
        lastSyncTime,
        messageCount: 50
      });
    } finally {
      setTimeout(() => {
        this.syncInProgress.delete(conversationId || 'global');
      }, 1000);
    }
  }

  startTyping(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('startTyping', { conversationId });
    }
  }

  stopTyping(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('stopTyping', { conversationId });
    }
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    try {
      // Save message to local storage
      await this.offlineStorage.saveMessage(message);
      
      // Index for search
      await this.searchEngine.indexMessage(message);
      
      // Acknowledge receipt
      await this.acknowledgeMessage(message.messageId, 'delivered');
      
      // Notify application
      this.options.onMessage?.(message);
    } catch (error) {
      console.error('Error handling incoming message:', error);
    }
  }

  private async handleMessageSync(message: Message): Promise<void> {
    try {
      // This is for multi-device sync
      const existingMessage = await this.offlineStorage.getMessage(message.messageId);
      
      if (!existingMessage || existingMessage.updatedAt < message.updatedAt) {
        await this.offlineStorage.saveMessage(message);
        await this.searchEngine.indexMessage(message);
      }
    } catch (error) {
      console.error('Error handling message sync:', error);
    }
  }

  private handleMessageStatusUpdate(update: {
    messageId: string;
    status: string;
    timestamp: Date;
    deviceId: string;
  }): void {
    this.options.onMessageStatusUpdate?.(update);
  }

  private async handleSyncResponse(data: {
    messages: Message[];
    syncTime: Date;
  }): Promise<void> {
    try {
      for (const message of data.messages) {
        await this.offlineStorage.saveMessage(message);
        await this.searchEngine.indexMessage(message);
      }
      
      console.log(`Synced ${data.messages.length} messages at ${data.syncTime}`);
    } catch (error) {
      console.error('Error handling sync response:', error);
    }
  }

  private async processOfflineQueue(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      const queue = await this.offlineStorage.getOfflineQueue();
      
      for (const queueItem of queue) {
        try {
          const response = await new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout'));
            }, 5000);

            this.socket!.emit('sendMessage', queueItem.message, (response: any) => {
              clearTimeout(timeout);
              if (response?.success) {
                resolve(response);
              } else {
                reject(new Error(response?.error || 'Failed to send'));
              }
            });
          });

          // Successfully sent, remove from queue and update status
          await this.offlineStorage.removeFromOfflineQueue(queueItem.id);
          queueItem.message.status = 'sent';
          await this.offlineStorage.saveMessage(queueItem.message);
          
        } catch (error) {
          console.error(`Failed to send queued message ${queueItem.message.messageId}:`, error);
          
          if (queueItem.retryCount < queueItem.maxRetries) {
            await this.offlineStorage.incrementRetryCount(queueItem.id);
          } else {
            // Max retries reached, mark as failed and remove from queue
            await this.offlineStorage.removeFromOfflineQueue(queueItem.id);
            queueItem.message.status = 'failed';
            await this.offlineStorage.saveMessage(queueItem.message);
          }
        }
      }
    } catch (error) {
      console.error('Error processing offline queue:', error);
    }
  }

  // Utility methods
  async getStorageUsage(): Promise<{ messages: number; queue: number; total: number }> {
    return this.offlineStorage.getStorageUsage();
  }

  async clearOldMessages(olderThanDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    await this.offlineStorage.clearOldMessages(cutoffDate);
  }

  isOnline(): boolean {
    return this.isConnected;
  }

  getConnectionStatus(): { connected: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

export default MessagingClient;
export type { MessagingClientOptions, SendMessageOptions };
