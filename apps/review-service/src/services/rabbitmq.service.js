import amqplib from 'amqplib';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import prisma from '../../prisma/client.js';

let connection = null;
let channel = null;

// ─── Connection ────────────────────────────────────────────────────────────

async function getChannel() {
  if (channel) return channel;

  connection = await amqplib.connect(config.rabbitmq.url);
  channel = await connection.createChannel();

  await channel.assertExchange(config.rabbitmq.exchange, 'topic', { durable: true });

  connection.on('error', (err) => {
    logger.error({ msg: 'RabbitMQ connection error', err });
    channel = null;
    connection = null;
  });

  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    channel = null;
    connection = null;
  });

  logger.info({ msg: 'RabbitMQ channel ready', exchange: config.rabbitmq.exchange });
  return channel;
}

// ─── Publisher ─────────────────────────────────────────────────────────────

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

// ─── Outbox Relay Worker ───────────────────────────────────────────────────
//
// Polls ReviewOutboxEvent every 2s and publishes unpublished events.
// Writes happen in the same DB transaction as the state change, so
// this guarantees at-least-once delivery even on process crash.

const RELAY_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;

async function relayOutboxEvents() {
  try {
    const events = await prisma.reviewOutboxEvent.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (events.length === 0) return;

    for (const event of events) {
      try {
        await publishEvent(event.eventType, event.payload);
        await prisma.reviewOutboxEvent.update({
          where: { id: event.id },
          data: { published: true, publishedAt: new Date() },
        });
      } catch (err) {
        logger.error({ msg: 'Outbox relay: failed to publish event', eventId: event.id, err });
      }
    }
  } catch (err) {
    logger.error({ msg: 'Outbox relay: DB error', err });
  }
}

export function startOutboxRelay() {
  logger.info('Outbox relay worker started');
  setInterval(relayOutboxEvents, RELAY_INTERVAL_MS);
}

// ─── Consumer — listen for Order Service events ────────────────────────────
//
// The Review Service subscribes to order.delivered events so it can build
// a local DeliveredOrder cache. This avoids synchronous calls to Order Service
// when verifying that a customer actually received the product before reviewing.

export async function startOrderEventConsumer(onDelivered) {
  const ch = await getChannel();

  const queue = 'review-service.order-events';

  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, config.rabbitmq.exchange, 'order.delivered');

  ch.prefetch(10);

  ch.consume(queue, async (msg) => {
    if (!msg) return;

    try {
      const payload = JSON.parse(msg.content.toString());
      logger.debug({ msg: 'Received order event', routingKey: msg.fields.routingKey });

      await onDelivered(payload);
      ch.ack(msg);
    } catch (err) {
      logger.error({ msg: 'Failed to process order event', err });
      // nack without requeue to avoid poison-pill loops
      ch.nack(msg, false, false);
    }
  });

  logger.info({ msg: 'Subscribed to order.delivered events', queue });
}

// ─── Graceful close ────────────────────────────────────────────────────────

export async function closeRabbitMQ() {
  try {
    await channel?.close();
    await connection?.close();
  } catch (_) {
    // best-effort on shutdown
  }
}