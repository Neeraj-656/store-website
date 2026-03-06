import amqplib from 'amqplib';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import prisma from '../../prisma/client.js';

let connection = null;
let channel    = null;

// ─── Connection ──────────────────────────────────────────────────────────────

async function getChannel() {
  if (channel) return channel;

  connection = await amqplib.connect(config.rabbitmq.url);
  channel    = await connection.createChannel();

  await channel.assertExchange(config.rabbitmq.exchange, 'topic', { durable: true });

  connection.on('error', (err) => {
    logger.error({ msg: 'RabbitMQ connection error', err });
    channel = null; connection = null;
  });
  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    channel = null; connection = null;
  });

  logger.info({ msg: 'RabbitMQ channel ready', exchange: config.rabbitmq.exchange });
  return channel;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

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

// ─── Consume ─────────────────────────────────────────────────────────────────

export async function consume(routingKey, queue, handler) {
  const ch = await getChannel();

  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, config.rabbitmq.exchange, routingKey);
  ch.prefetch(1);

  ch.consume(queue, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload);
      ch.ack(msg);
    } catch (err) {
      logger.error({ msg: 'Consumer handler error', routingKey, err });
      ch.nack(msg, false, false); // dead-letter, don't requeue indefinitely
    }
  });

  logger.info({ msg: 'Consumer started', routingKey, queue });
}

// ─── Outbox Relay Worker ──────────────────────────────────────────────────────
// Polls PayoutOutboxEvent every 2s. At-least-once delivery guarantee.

const RELAY_INTERVAL_MS = 2_000;
const BATCH_SIZE = 50;

async function relayOutboxEvents() {
  try {
    const events = await prisma.payoutOutboxEvent.findMany({
      where:   { published: false },
      orderBy: { createdAt: 'asc' },
      take:    BATCH_SIZE,
    });

    for (const event of events) {
      try {
        await publishEvent(event.eventType, event.payload);
        await prisma.payoutOutboxEvent.update({
          where: { id: event.id },
          data:  { published: true, publishedAt: new Date() },
        });
      } catch (err) {
        logger.error({ msg: 'Outbox relay: failed to publish', eventId: event.id, err });
      }
    }
  } catch (err) {
    logger.error({ msg: 'Outbox relay: DB error', err });
  }
}

export function startOutboxRelay() {
  logger.info('Payout outbox relay worker started');
  setInterval(relayOutboxEvents, RELAY_INTERVAL_MS);
}

// ─── Graceful close ──────────────────────────────────────────────────────────

export async function closeRabbitMQ() {
  try {
    await channel?.close();
    await connection?.close();
  } catch (_) {}
}
