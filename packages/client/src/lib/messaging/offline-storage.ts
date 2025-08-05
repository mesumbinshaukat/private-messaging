interface Message {
  id: string;
  messageId: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  content: string;
  encryptedContent: string;
  messageType: 'text' | 'file' | 'image' | 'video' | 'audio' | 'document' | 'system';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: any;
  replyToMessageId?: string;
  editHistory?: Array<{
    editedAt: Date;
    previousContent: string;
  }>;
  deletedAt?: Date;
}

interface SyncState {
  conversationId: string;
  lastSyncTime: Date;
  messageCount: number;
  syncInProgress: boolean;
}

interface OfflineQueue {
  id: string;
  message: Message;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
}

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private dbName = 'MessagingApp';
  private version = 1;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('messageId', 'messageId', { unique: true });
          messageStore.createIndex('conversationId', 'conversationId');
          messageStore.createIndex('timestamp', 'timestamp');
          messageStore.createIndex('status', 'status');
          messageStore.createIndex('senderId', 'senderId');
          messageStore.createIndex('recipientId', 'recipientId');
        }

        // Offline queue store
        if (!db.objectStoreNames.contains('offlineQueue')) {
          const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id' });
          queueStore.createIndex('timestamp', 'timestamp');
          queueStore.createIndex('retryCount', 'retryCount');
        }

        // Sync state store
        if (!db.objectStoreNames.contains('syncState')) {
          const syncStore = db.createObjectStore('syncState', { keyPath: 'conversationId' });
          syncStore.createIndex('lastSyncTime', 'lastSyncTime');
        }

        // Search index store (for pre-computed search data)
        if (!db.objectStoreNames.contains('searchIndex')) {
          const searchStore = db.createObjectStore('searchIndex', { keyPath: 'messageId' });
          searchStore.createIndex('terms', 'terms', { multiEntry: true });
          searchStore.createIndex('conversationId', 'conversationId');
        }
      };
    });
  }

  // Message operations
  async saveMessage(message: Message): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      
      const request = store.put({
        ...message,
        id: message.messageId,
        timestamp: new Date(message.timestamp),
        createdAt: new Date(message.createdAt),
        updatedAt: new Date(message.updatedAt),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMessages(conversationId: string, limit = 50, offset = 0): Promise<Message[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('conversationId');
      
      const request = index.getAll(conversationId);
      
      request.onsuccess = () => {
        const messages = request.result
          .sort((a: Message, b: Message) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )
          .slice(offset, offset + limit);
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getMessage(messageId: string): Promise<Message | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.get(messageId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async updateMessageStatus(messageId: string, status: Message['status']): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const message = await this.getMessage(messageId);
    if (!message) return;

    message.status = status;
    message.updatedAt = new Date();
    
    await this.saveMessage(message);
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.delete(messageId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Offline queue operations
  async addToOfflineQueue(message: Message): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const queueItem: OfflineQueue = {
      id: `queue_${message.messageId}_${Date.now()}`,
      message,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: 3
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.put(queueItem);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getOfflineQueue(): Promise<OfflineQueue[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readonly');
      const store = transaction.objectStore('offlineQueue');
      const request = store.getAll();

      request.onsuccess = () => {
        const queue = request.result.sort((a: OfflineQueue, b: OfflineQueue) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        resolve(queue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async removeFromOfflineQueue(queueId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const request = store.delete(queueId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async incrementRetryCount(queueId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readwrite');
      const store = transaction.objectStore('offlineQueue');
      const getRequest = store.get(queueId);

      getRequest.onsuccess = () => {
        const queueItem = getRequest.result;
        if (queueItem) {
          queueItem.retryCount += 1;
          const putRequest = store.put(queueItem);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Sync state operations
  async updateSyncState(conversationId: string, lastSyncTime: Date, messageCount: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const syncState: SyncState = {
      conversationId,
      lastSyncTime,
      messageCount,
      syncInProgress: false
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncState'], 'readwrite');
      const store = transaction.objectStore('syncState');
      const request = store.put(syncState);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSyncState(conversationId: string): Promise<SyncState | null> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncState'], 'readonly');
      const store = transaction.objectStore('syncState');
      const request = store.get(conversationId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Search index operations
  async buildSearchIndex(message: Message): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Extract searchable terms from message
    const searchableText = `${message.content} ${message.metadata?.fileName || ''}`;
    const terms = searchableText
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/[^\w]/g, ''));

    const searchIndexItem = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      terms: [...new Set(terms)], // Remove duplicates
      timestamp: message.timestamp,
      messageType: message.messageType
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['searchIndex'], 'readwrite');
      const store = transaction.objectStore('searchIndex');
      const request = store.put(searchIndexItem);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async searchMessages(query: string, conversationId?: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not initialized');

    const searchTerms = query.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .map(term => term.replace(/[^\w]/g, ''));

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['searchIndex'], 'readonly');
      const store = transaction.objectStore('searchIndex');
      const request = store.getAll();

      request.onsuccess = () => {
        const searchResults = request.result
          .filter((item: any) => {
            // Filter by conversation if specified
            if (conversationId && item.conversationId !== conversationId) {
              return false;
            }

            // Check if any search terms match
            return searchTerms.some(term => 
              item.terms.some((indexTerm: string) => indexTerm.includes(term))
            );
          })
          .map((item: any) => item.messageId);

        resolve(searchResults);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Cleanup operations
  async clearOldMessages(olderThan: Date): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(olderThan);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getStorageUsage(): Promise<{ messages: number; queue: number; total: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const messageCount = await new Promise<number>((resolve, reject) => {
      const transaction = this.db!.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const queueCount = await new Promise<number>((resolve, reject) => {
      const transaction = this.db!.transaction(['offlineQueue'], 'readonly');
      const store = transaction.objectStore('offlineQueue');
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return {
      messages: messageCount,
      queue: queueCount,
      total: messageCount + queueCount
    };
  }
}

export default OfflineStorage;
export type { Message, SyncState, OfflineQueue };
