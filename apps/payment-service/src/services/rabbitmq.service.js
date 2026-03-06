import amqplib from 'amqplib';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import prisma from '../../prisma/client.js';

let connection = null;
let channel = null;

// ─── Connection ───────────────────────────────────────────────────────────────

async function getChannel() {
  if (channel) return channel;

  connection = await amqplib.connect(config.rabbitmq.url);
  channel = await connection.createChannel();

  await channel.assertExchange(config.rabbitmq.exchange, 'topic', { durable: true });

  connection.on('error', (err) => {
    logger.error({ msg: 'RabbitMQ connection error — will reconnect on next publish', err });
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

// ─── Publish ──────────────────────────────────────────────────────────────────

export async function publishEvent(routingKey, payload) {
  const ch = await getChannel();
  ch.publish(
    config.rabbitmq.exchange,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true, contentType: 'application/json' },
  );
  logger.debug({ msg: 'Event published to RabbitMQ', routingKey });
}

// ─── Outbox Relay Worker ──────────────────────────────────────────────────────
//
// Polls the PaymentOutboxEvent table every 2 s and publishes unpublished events.
// Because events are written to the DB in the same transaction as state changes,
// this guarantees at-least-once delivery even if the process crashes mid-publish.

const RELAY_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;

async function relayOutboxEvents() {
  try {
    const events = await prisma.paymentOutboxEvent.findMany({
      where: { published: false },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (events.length === 0) return;

    for (const event of events) {
      try {
        await publishEvent(event.eventType, event.payload);
        await prisma.paymentOutboxEvent.update({
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

// ─── Graceful close ───────────────────────────────────────────────────────────

export async function closeRabbitMQ() {
  try {
    await channel?.close();
    await connection?.close();
  } catch (_) {
    // best-effort on shutdown
  }
}