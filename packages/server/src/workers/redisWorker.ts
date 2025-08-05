import Redis from 'ioredis';
import retryWithBackoff from '../util/retryBackoff';
import { OfflineStorage } from '../messaging/offline-storage';

/**
 * Worker service to process Redis stream
 * */
function createRedisWorker() {
  const redis = new Redis();
  const offlineStorage = new OfflineStorage();
  await offlineStorage.init();

  async function flushPendingMessages() {
    const messages = await offlineStorage.getOfflineQueue();

    for (const queueItem of messages) {
      await retryWithBackoff(async () => {
        // Process the message
        // Let's assume sendMessage is a function that sends the message and returns a promise
        const success = await sendMessage(queueItem.message);
        if (success) {
          await offlineStorage.removeFromOfflineQueue(queueItem.id);
        }
      }, 5, 2000);
    }
  }

  function processStream() {
    // Listen on Redis stream
    redis.subscribe('pending-messages', async (err, count) => {
      if (err) {
        console.error('Failed to subscribe: ', err);
        return;
      }
      console.log(`Subscribed to ${count} channel(s).`);
    });

    redis.on('message', async (channel, message) => {
      if (channel === 'pending-messages') {
        console.log('Processing new message from stream...');
        await flushPendingMessages();
      }
    });
  }

  processStream();
}

createRedisWorker();

function sendMessage(message: any): Promise<boolean> {
  // Dummy implementation
  return Promise.resolve(true);
}

export default createRedisWorker;
