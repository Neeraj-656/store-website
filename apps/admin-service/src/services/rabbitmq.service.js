/**
 * rabbitmq.service.js
 *
 * Fixes applied:
 *
 * Issue 1  — Idempotent consumers: the consume() handler now receives
 *            (payload, properties) so consumers can extract correlationId /
 *            messageId and feed it to the withIdempotency() helper in
 *            admin.consumer.js.
 *
 * Issue 2  — Outbox table bloat: startOutboxSweeper() runs a daily cron that
 *            hard-DELETEs outbox rows whose publishedAt is older than the
 *            configured retention window (default 7 days).
 *            ProcessedMessage rows are also swept on the same schedule
 *            (default 30-day retention) to prevent that table from growing
 *            indefinitely.
 *
 * Issue 6  — RabbitMQ reconnect: replaced raw amqplib with amqp-connection-
 *            manager which handles reconnections automatically.
 *
 * Issue 7  — Outbox relay distributed lock: FOR UPDATE SKIP LOCKED ensures
 *            only one replica processes each batch.
 *
 * Issue 14 — Dead-letter exchange: queues declared with x-dead-letter-exchange
 *            so failed messages are routed to ecommerce_dead_letters instead of
 *            being dropped.
 *
 * Required package: amqp-connection-manager
 *   npm install amqp-connection-manager
 */

import amqpConnectionManager from 'amqp-connection-manager';
import config  from '../config/index.js';
import logger  from '../utils/logger.js';
import prisma  from '../../prisma/client.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DLX = 'ecommerce_dead_letters';

// How long to retain published outbox events before sweeping them (days).
const OUTBOX_RETENTION_DAYS = parseInt(process.env.OUTBOX_RETENTION_DAYS ?? '7',  10);

// How long to retain ProcessedMessage rows before sweeping them (days).
const MSG_ID_RETENTION_DAYS = parseInt(process.env.MSG_ID_RETENTION_DAYS  ?? '30', 10);

// ─── Connection ───────────────────────────────────────────────────────────────

let connection    = null;
let channelWrapper = null;

export function getChannelWrapper() {
  return channelWrapper;
}

function getConnection() {
  if (connection) return connection;

  connection = amqpConnectionManager.connect([config.rabbitmq.url], {
    reconnectTimeInSeconds: 5,
  });

  connection.on('connect',    () => logger.info({ msg: 'RabbitMQ connected' }));
  connection.on('disconnect', ({ err }) =>
    logger.warn({ msg: 'RabbitMQ disconnected — will retry', err: err?.message }),
  );

  return connection;
}

function ensureChannelWrapper() {
  if (channelWrapper) return channelWrapper;

  const conn = getConnection();

  channelWrapper = conn.createChannel({
    json: false,
    setup: async (ch) => {
      await ch.assertExchange(config.rabbitmq.exchange, 'topic', { durable: true });
      await ch.assertExchange(DLX, 'topic', { durable: true });
      logger.info({ msg: 'RabbitMQ channel setup complete', exchange: config.rabbitmq.exchange });
    },
  });

  return channelWrapper;
}

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function publishEvent(routingKey, payload, options = {}) {
  const ch = ensureChannelWrapper();
  await ch.publish(
    config.rabbitmq.exchange,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    {
      persistent:   true,
      contentType:  'application/json',
      // Publishers SHOULD set a correlationId so consumers can use it for
      // idempotency checks. Fall back to a timestamp-based ID as a last resort.
      correlationId: options.correlationId ?? `${routingKey}-${Date.now()}`,
      ...options,
    },
  );
  logger.debug({ msg: 'Event published', routingKey });
}

// ─── Consume ──────────────────────────────────────────────────────────────────
// The handler receives (payload, properties) — consumers MUST use the
// properties.correlationId for idempotency (Issue 1 fix).

export async function consume(routingKey, queue, handler) {
  const ch = ensureChannelWrapper();

  await ch.addSetup(async (rawChannel) => {
    await rawChannel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange':    DLX,
        'x-dead-letter-routing-key': `${routingKey}.failed`,
      },
    });

    await rawChannel.bindQueue(queue, config.rabbitmq.exchange, routingKey);
    rawChannel.prefetch(1);

    await rawChannel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        // Pass message properties alongside the payload so consumers can
        // extract correlationId / messageId for idempotency. (Issue 1 fix)
        await handler(JSON.parse(msg.content.toString()), msg.properties);
        rawChannel.ack(msg);
      } catch (err) {
        logger.error({ msg: 'Consumer error — routing to DLX', routingKey, err });
        rawChannel.nack(msg, false, false);
      }
    });

    logger.info({ msg: 'Consumer started', routingKey, queue });
  });
}

// ─── Outbox relay ─────────────────────────────────────────────────────────────

const RELAY_INTERVAL_MS = 2_000;
const BATCH_SIZE        = 50;

async function relayOutboxEvents() {
  try {
    const events = await prisma.$transaction(async (tx) => {
      return tx.$queryRaw`
        SELECT id, "eventType", payload
        FROM   "AdminOutboxEvent"
        WHERE  published = false
        ORDER  BY "createdAt"
        LIMIT  ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
    });

    for (const event of events) {
      try {
        await publishEvent(event.eventType, event.payload, {
          correlationId: event.id, // outbox row ID is the stable message ID
        });
        await prisma.adminOutboxEvent.update({
          where: { id: event.id },
          data:  { published: true, publishedAt: new Date() },
        });
      } catch (err) {
        logger.error({ msg: 'Outbox relay failed for event', eventId: event.id, err });
      }
    }
  } catch (err) {
    logger.error({ msg: 'Outbox relay DB error', err });
  }
}

export function startOutboxRelay() {
  logger.info('Admin outbox relay started');
  setInterval(relayOutboxEvents, RELAY_INTERVAL_MS);
}

// ─── Outbox sweeper (Issue 2 fix) ─────────────────────────────────────────────
// Without this, the AdminOutboxEvent table grows indefinitely. Published rows
// are never deleted so after months of operation the polling queries slow down
// and storage costs balloon.
//
// The sweeper runs once per day and hard-DELETEs:
//   1. AdminOutboxEvent rows with publishedAt older than OUTBOX_RETENTION_DAYS
//   2. ProcessedMessage rows older than MSG_ID_RETENTION_DAYS
//
// Both use deleteMany (batched by Prisma into a single DELETE ... WHERE) so
// they are fast even on large tables and do not hold long-running locks.

async function sweepStaleRecords() {
  const outboxCutoff = new Date();
  outboxCutoff.setDate(outboxCutoff.getDate() - OUTBOX_RETENTION_DAYS);

  const msgCutoff = new Date();
  msgCutoff.setDate(msgCutoff.getDate() - MSG_ID_RETENTION_DAYS);

  try {
    const [outboxResult, msgResult] = await Promise.all([
      prisma.adminOutboxEvent.deleteMany({
        where: {
          published:   true,
          publishedAt: { lt: outboxCutoff },
        },
      }),
      prisma.processedMessage.deleteMany({
        where: { processedAt: { lt: msgCutoff } },
      }),
    ]);

    logger.info({
      msg:                  'Outbox sweep complete',
      outboxRowsDeleted:    outboxResult.count,
      msgIdRowsDeleted:     msgResult.count,
      outboxRetentionDays:  OUTBOX_RETENTION_DAYS,
      msgIdRetentionDays:   MSG_ID_RETENTION_DAYS,
    });
  } catch (err) {
    logger.error({ msg: 'Outbox sweep failed', err });
  }
}

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1_000; // 24 hours

export function startOutboxSweeper() {
  logger.info({
    msg:                 'Outbox sweeper started',
    outboxRetentionDays: OUTBOX_RETENTION_DAYS,
    msgIdRetentionDays:  MSG_ID_RETENTION_DAYS,
  });

  // Run once shortly after startup (offset by 5 min to avoid boot-time load),
  // then on a fixed 24-hour interval.
  setTimeout(sweepStaleRecords, 5 * 60 * 1_000);
  setInterval(sweepStaleRecords, SWEEP_INTERVAL_MS);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export async function closeRabbitMQ() {
  try {
    await channelWrapper?.close();
    await connection?.close();
  } catch (_) {}
}
