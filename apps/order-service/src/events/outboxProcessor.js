import { prisma }               from '../config/prisma.js';
import { getChannel, EXCHANGE } from '../config/rabbitmq.js';
import logger                   from '../config/logger.js';

const POLL_INTERVAL_MS    = 2_000;
const ALERT_INTERVAL_MS   = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const BATCH_SIZE          = 20;
const MAX_OUTBOX_RETRIES  = 5;
const RETENTION_DAYS      = 7;

let pollTimer    = null;
let alertTimer   = null;
let cleanupTimer = null;

async function processOutbox() {
  try {
    const channel = getChannel();

    await prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw`
        SELECT id, "orderId", "routingKey", payload, retries
        FROM "OutboxEvent"
        WHERE published  = false
          AND "failedAt" IS NULL
          AND retries    < ${MAX_OUTBOX_RETRIES}
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;

      if (!events || events.length === 0) return;

      for (const event of events) {
        try {
          const message = Buffer.from(JSON.stringify({
            ...event.payload,
            outboxEventId: event.id,
            timestamp:     new Date().toISOString(),
            source:        'order-service',
          }));

          channel.publish(EXCHANGE, event.routingKey, message, {
            persistent:  true,
            contentType: 'application/json',
            messageId:   event.id,
          });

          await tx.outboxEvent.update({
            where: { id: event.id },
            data:  { published: true, publishedAt: new Date() },
          });

          logger.debug(`[Outbox] Published: ${event.routingKey} (${event.id})`);
        } catch (err) {
          logger.error(`[Outbox] Failed to publish event ${event.id}:`, err.message);

          const newRetries  = (event.retries ?? 0) + 1;
          const isExhausted = newRetries >= MAX_OUTBOX_RETRIES;

          await tx.outboxEvent.update({
            where: { id: event.id },
            data:  { retries: newRetries, ...(isExhausted && { failedAt: new Date() }) },
          }).catch((dbErr) => {
            logger.error(`[Outbox] Could not update retry count for ${event.id}:`, dbErr.message);
          });
        }
      }
    });
  } catch (err) {
    logger.error('[Outbox] Poll cycle failed (DB/MQ unavailable):', err.message);
  }
}

async function triggerAlert(deadEvents) {
  logger.error('[Outbox] !! CRITICAL: PERMANENTLY STUCK OUTBOX EVENTS !!', {
    level: 'CRITICAL',
    count: deadEvents.length,
    deadEvents: deadEvents.map((e) => ({
      id: e.id, orderId: e.orderId, routingKey: e.routingKey,
      retries: e.retries, failedAt: e.failedAt, createdAt: e.createdAt, payload: e.payload,
    })),
    action: 'Manual intervention required. Replay via outboxEvent.update({ published: false, failedAt: null, retries: 0 }).',
  });
}

async function alertOnDeadEvents() {
  try {
    const deadEvents = await prisma.outboxEvent.findMany({
      where: { published: false, failedAt: { not: null } },
      orderBy: { failedAt: 'asc' },
    });
    if (deadEvents.length > 0) await triggerAlert(deadEvents);
  } catch (err) {
    logger.error('[Outbox] Alert sweep failed:', err.message);
  }
}

async function cleanupOldEvents() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await prisma.outboxEvent.deleteMany({
      where: { published: true, publishedAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      logger.info(`[Outbox] Deleted ${result.count} published events older than ${RETENTION_DAYS}d`);
    }
  } catch (err) {
    logger.error('[Outbox] Cleanup sweep failed:', err.message);
  }
}

export function startOutboxProcessor() {
  logger.info(
    `[Outbox] Starting — poll:${POLL_INTERVAL_MS}ms  alert:${ALERT_INTERVAL_MS / 60000}min  cleanup:${CLEANUP_INTERVAL_MS / 3600000}h`
  );

  pollTimer = setInterval(processOutbox, POLL_INTERVAL_MS);
  if (pollTimer.unref) pollTimer.unref();

  alertOnDeadEvents();
  alertTimer = setInterval(alertOnDeadEvents, ALERT_INTERVAL_MS);
  if (alertTimer.unref) alertTimer.unref();

  cleanupOldEvents();
  cleanupTimer = setInterval(cleanupOldEvents, CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function stopOutboxProcessor() {
  if (pollTimer)    { clearInterval(pollTimer);    pollTimer    = null; }
  if (alertTimer)   { clearInterval(alertTimer);   alertTimer   = null; }
  if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
  logger.info('[Outbox] Processor stopped');
}
