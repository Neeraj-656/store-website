import { prisma } from '../lib/prisma.js';
import { eventBus } from './eventBus.js'; 

let isShuttingDown = false;
let activeBatchPromise = null; // Tracks the currently executing batch

export const startOutboxRelay = () => {
  console.log("🚀 Tier-1 Outbox Relay Worker initialized.");
  poll();
};

export const stopOutboxRelay = async () => {
  console.log("🛑 Signal received. Waiting for active Outbox batch to finish...");
  isShuttingDown = true;
  
  if (activeBatchPromise) {
    await activeBatchPromise; 
  }
};

const poll = async () => {
  if (isShuttingDown) return;

  // Wrap the exact processing logic in a tracked promise
  activeBatchPromise = (async () => {
    try {
      const events = await prisma.$transaction(async (tx) => {
        const lockedEvents = await tx.$queryRaw`
          SELECT * FROM "OutboxEvent"
          WHERE (
            status = 'PENDING'::"OutboxStatus" 
            AND "nextAttemptAt" <= NOW()
          ) OR (
            status = 'PROCESSING'::"OutboxStatus" 
            AND "updatedAt" < NOW() - INTERVAL '5 minutes'
          )
          ORDER BY "createdAt" ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        `;

        if (!lockedEvents || lockedEvents.length === 0) return [];

        const ids = lockedEvents.map(e => e.id);
        
        await tx.outboxEvent.updateMany({
          where: { id: { in: ids } },
          data: { status: 'PROCESSING' }
        });

        return lockedEvents;
      });

      if (events.length === 0) return 0;

      await Promise.allSettled(
        events.map(async (event) => {
          try {
            await eventBus.publish(event.type, event.payload);

            await prisma.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'PUBLISHED', publishedAt: new Date() }
            });
          } catch (err) {
            console.error(`❌ Publish failed for event ${event.id}:`, err.message);

            const isDead = event.retryCount >= 9; 
            const baseDelay = Math.min(Math.pow(2, event.retryCount + 1) * 1000, 300000);
            const jitter = Math.random() * 1000;
            const nextAttemptAt = new Date(Date.now() + baseDelay + jitter);

            await prisma.outboxEvent.update({
              where: { id: event.id },
              data: {
                status: isDead ? 'FAILED' : 'PENDING',
                retryCount: { increment: 1 },
                nextAttemptAt
              }
            });
          }
        })
      );

      return events.length;
    } catch (criticalErr) {
      console.error("🚨 Outbox Worker Critical Polling Error:", criticalErr.message);
      return 0; // Treat as 0 processed so it backs off safely
    }
  })(); // Immediately invoke to assign the promise

  try {
    const processedCount = await activeBatchPromise;
    
    if (!isShuttingDown) {
      // Adaptive Polling
      const delay = processedCount === 0 ? 5000 : 500;
      setTimeout(poll, delay);
    }
  } finally {
    activeBatchPromise = null; // Clear the track when done
  }
};