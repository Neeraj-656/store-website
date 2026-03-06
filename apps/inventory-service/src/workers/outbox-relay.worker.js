import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { rabbitMQ } from '../events/rabbitmq.js';
import { logger } from '../lib/logger.js';

const MAX_RETRIES = 5;

class OutboxRelayWorker {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.pollInterval = 3000;
    this.workerId = crypto.randomUUID();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info({ workerId: this.workerId }, 'Started Production-Grade Outbox Relay');
    this.intervalId = setInterval(() => this.processOutbox(), this.pollInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
    logger.info('Stopped Outbox Relay Worker');
  }

  async processOutbox() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      // 5-minute dead-worker timeout
      const crashThreshold = new Date(now.getTime() - 5 * 60000); 

      // STEP 1 & 2: Identify and Atomically Claim Candidates
      await prisma.outboxEvent.updateMany({
        where: {
          OR: [
            { status: 'PENDING' },
            { status: 'PROCESSING', processingStartedAt: { lte: crashThreshold } }
          ]
        },
        data: { 
          status: 'PROCESSING', 
          processingStartedAt: now,
          workerId: this.workerId
        }
      });

      // STEP 3: Fetch ONLY this worker's claimed events
      const events = await prisma.outboxEvent.findMany({
        where: { workerId: this.workerId, status: 'PROCESSING' },
        orderBy: { createdAt: 'asc' }
      });

      if (events.length === 0) return;

      for (const event of events) {
        try {
          await rabbitMQ.publishEvent(event.type, event.payload);

          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: { status: 'PUBLISHED', lastError: null } // Leave workerId for historical audit
          });

        } catch (err) {
          const isFatal = event.retryCount >= MAX_RETRIES;
          
          await prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: isFatal ? 'FAILED' : 'PENDING',
              retryCount: { increment: 1 },
              lastError: err.message || 'Unknown network error',
              // 🚀 FIX: Clear the worker tags so it can be cleanly retried
              workerId: null,
              processingStartedAt: null 
            }
          });

          if (isFatal) {
            logger.fatal({ eventId: event.id }, 'Outbox event moved to DLQ (Max Retries Reached)');
          } else {
            logger.warn({ eventId: event.id, retry: event.retryCount + 1 }, 'Publish failed. Releasing claim for retry.');
          }
        }
      }
    } catch (err) {
      logger.error(err, 'Outbox worker critical failure');
    } finally {
      this.isProcessing = false;
    }
  }
}

export const outboxWorker = new OutboxRelayWorker();