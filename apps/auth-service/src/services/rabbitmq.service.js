/**
 * rabbitmq.service.js
 *
 * RabbitMQ connection, publisher, consumer, and outbox relay.
 * Pattern matches every other service in the codebase.
 */

import amqplib from 'amqplib';
import config  from '../config/index.js';
import logger  from '../utils/logger.js';
import prisma  from '../../prisma/client.js';

let connection = null;
let channel    = null;

// ─── Connection ──────────────────────────────────────────────────────────────

async function getChannel() {
  if (channel) return channel;

  connection = await amqplib.connect(config.rabbitmq.url);
  channel    = await connection.createChannel();

  await channel.assertExchange(config.rabbitmq.exchange, 'topic', { durable: true });

  connection.on('error', (err) => {
    logger.error({ msg: 'RabbitMQ connection error', err: err.message });
    channel = null; connection = null;
  });

  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    channel = null; connection = null;
  });

  logger.info({ msg: 'RabbitMQ channel ready', exchange: config.rabbitmq.exchange });
  return channel;
}

// ─── Publisher ────────────────────────────────────────────────────────────────

export async function publishEvent(routingKey, payload) {
  const ch = await getChannel();
  ch.publish(
    config.rabbitmq.exchange,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true, contentType: 'application/json' },
  );
  logger.debug({ msg: 'Event published', routingKey });
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

export async function consume(routingKey, queue, handler) {
  const ch = await getChannel();
  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, config.rabbitmq.exchange, routingKey);
  ch.prefetch(1);

  ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      await handler(JSON.parse(msg.content.toString()));
      ch.ack(msg);
    } catch (err) {
      logger.error({ msg: 'Consumer handler error', routingKey, err: err.message });
      // nack without requeue — goes to DLX if configured
      ch.nack(msg, false, false);
    }
  });

  logger.info({ msg: 'Consumer started', routingKey, queue });
}

// ─── Outbox Relay ─────────────────────────────────────────────────────────────
// Polls AuthOutboxEvent every 2s and publishes unpublished entries.
// Guarantees at-least-once delivery even on crash before publish completes.

const RELAY_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;

async function relayOutboxEvents() {
  try {
    const events = await prisma.authOutboxEvent.findMany({
      where:   { published: false },
      orderBy: { createdAt: 'asc' },
      take:    BATCH_SIZE,
    });

    if (events.length === 0) return;

    for (const event of events) {
      try {
        await publishEvent(event.eventType, event.payload);
        await prisma.authOutboxEvent.update({
          where: { id: event.id },
          data:  { published: true, publishedAt: new Date() },
        });
      } catch (err) {
        logger.error({ msg: 'Outbox relay: failed to publish', eventId: event.id, err: err.message });
      }
    }
  } catch (err) {
    logger.error({ msg: 'Outbox relay: DB error', err: err.message });
  }
}

export function startOutboxRelay() {
  logger.info('Auth outbox relay started');
  setInterval(relayOutboxEvents, RELAY_INTERVAL_MS);
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export async function closeRabbitMQ() {
  try {
    await channel?.close();
    await connection?.close();
  } catch (_) { /* best-effort */ }
}
