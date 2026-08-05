import { config } from '../config/env';
import { logger } from '../utils/logger';

export interface QueueMessage {
  id: string;
  zaloUserId: string;
  message: string;
  createdAt: Date;
}

type SendHandler = (zaloUserId: string, message: string) => Promise<boolean>;

export function splitMessageIntoChunks(message: string, maxLen: number = 1800): string[] {
  if (message.length <= maxLen) return [message];

  const lines = message.split('\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    if (line.length > maxLen) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
      continue;
    }

    if ((currentChunk + '\n' + line).length > maxLen) {
      chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

class MessageQueueService {
  private queue: QueueMessage[] = [];
  private isProcessing = false;
  private sendHandler: SendHandler | null = null;
  private sentCount = 0;
  private failedCount = 0;

  public setSendHandler(handler: SendHandler) {
    this.sendHandler = handler;
  }

  public enqueue(zaloUserId: string, message: string): string[] {
    const chunks = splitMessageIntoChunks(message, 1800);
    const ids: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks.length > 1 ? `[Phần ${i + 1}/${chunks.length}]\n${chunks[i]}` : chunks[i];
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      this.queue.push({
        id,
        zaloUserId,
        message: chunkText,
        createdAt: new Date(),
      });
      ids.push(id);
    }

    logger.info(`Queued ${chunks.length} message chunk(s) for ZaloUser: ${zaloUserId}. Queue length: ${this.queue.length}`);

    // Trigger processing loop if not already running
    this.processQueue();
    return ids;
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      if (!this.sendHandler) {
        logger.warn(`No active Zalo send handler registered (Test/Standalone mode). Dropping message for ${item.zaloUserId}`);
        this.failedCount++;
        continue;
      }

      try {
        logger.info(`Processing queued message to ${item.zaloUserId}...`);
        const success = await this.sendHandler(item.zaloUserId, item.message);
        if (success) {
          this.sentCount++;
          logger.info(`Message delivered successfully to ${item.zaloUserId}`);
        } else {
          this.failedCount++;
          logger.error(`Failed to deliver message to ${item.zaloUserId}`);
        }
      } catch (err: any) {
        this.failedCount++;
        logger.error(`Error delivering message to ${item.zaloUserId}: ${err.message}`);
      }

      // Delay execution for rate limit safety (1.5 seconds)
      if (this.queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.zaloSendDelayMs));
      }
    }

    this.isProcessing = false;
  }

  public getStats() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      sentCount: this.sentCount,
      failedCount: this.failedCount,
      delayMs: config.zaloSendDelayMs,
    };
  }
}

export const messageQueue = new MessageQueueService();
