import amqp   from 'amqplib';
import logger from './logger.js';

let connection = null;
let channel    = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 30_000;

export const EXCHANGE = 'grocery.events';
export const DLX      = 'grocery.dlx';
export const MAX_RETRIES = 3;

export const QUORUM_QUEUE_ARGS = { 'x-queue-type': 'quorum' };

export const QUEUES = {
  ORDER_EVENTS:          'order.events',
  PAYMENT_EVENTS:        'payment.events',
  INVENTORY_EVENTS:      'inventory.events',
  ORDER_CHECKOUT_EVENTS: 'order.checkout.events',
};

export const DLQ = {
  PAYMENT:   'payment.events.dlq',
  INVENTORY: 'inventory.events.dlq',
  CHECKOUT:  'order.checkout.events.dlq',
};

export const ROUTING_KEYS = {
  ORDER_CREATED:               'order.created',
  ORDER_CONFIRMED:             'order.confirmed',
  ORDER_SHIPPED:               'order.shipped',
  ORDER_CANCELLED:             'order.cancelled',
  ORDER_DELIVERED:             'order.delivered',
  CHECKOUT_INITIATED:          'order.checkout.initiated',
  INVENTORY_RELEASE_REQUESTED: 'inventory.release.requested',

  PAYMENT_SUCCESS:        'payment.success',
  PAYMENT_FAILED:         'payment.failed',
  INVENTORY_INSUFFICIENT: 'inventory.insufficient',
};

export async function connectRabbitMQ() {
  const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  try {
    connection = await amqp.connect(url);
    reconnectAttempts = 0;

    channel = await connection.createChannel();
    await channel.prefetch(1);
    await setupTopology(channel);

    connection.on('error', (err) => logger.error('RabbitMQ connection error:', err.message));
    connection.on('close', () => {
      channel = null; connection = null;
      scheduleReconnect();
    });
    channel.on('error', (err) => { logger.error('RabbitMQ channel error:', err.message); channel = null; });
    channel.on('close', ()    => { logger.warn('RabbitMQ channel closed'); channel = null; });

    logger.info('RabbitMQ topology ready');
  } catch (err) {
    logger.error('RabbitMQ connect failed:', err.message);
    scheduleReconnect();
    throw err;
  }
}

async function setupTopology(ch) {
  await ch.assertExchange(EXCHANGE, 'topic',  { durable: true });
  await ch.assertExchange(DLX,      'direct', { durable: true });

  await ch.assertQueue(DLQ.PAYMENT,   { durable: true });
  await ch.assertQueue(DLQ.INVENTORY, { durable: true });
  await ch.assertQueue(DLQ.CHECKOUT,  { durable: true });
  await ch.bindQueue(DLQ.PAYMENT,   DLX, QUEUES.PAYMENT_EVENTS);
  await ch.bindQueue(DLQ.INVENTORY, DLX, QUEUES.INVENTORY_EVENTS);
  await ch.bindQueue(DLQ.CHECKOUT,  DLX, QUEUES.ORDER_CHECKOUT_EVENTS);

  await ch.assertQueue(QUEUES.ORDER_EVENTS, {
    durable: true, arguments: { ...QUORUM_QUEUE_ARGS },
  });
  await ch.assertQueue(QUEUES.PAYMENT_EVENTS, {
    durable: true,
    arguments: { ...QUORUM_QUEUE_ARGS, 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': QUEUES.PAYMENT_EVENTS },
  });
  await ch.assertQueue(QUEUES.INVENTORY_EVENTS, {
    durable: true,
    arguments: { ...QUORUM_QUEUE_ARGS, 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': QUEUES.INVENTORY_EVENTS },
  });
  await ch.assertQueue(QUEUES.ORDER_CHECKOUT_EVENTS, {
    durable: true,
    arguments: { ...QUORUM_QUEUE_ARGS, 'x-dead-letter-exchange': DLX, 'x-dead-letter-routing-key': QUEUES.ORDER_CHECKOUT_EVENTS },
  });

  await ch.bindQueue(QUEUES.PAYMENT_EVENTS,        EXCHANGE, ROUTING_KEYS.PAYMENT_SUCCESS);
  await ch.bindQueue(QUEUES.PAYMENT_EVENTS,        EXCHANGE, ROUTING_KEYS.PAYMENT_FAILED);
  await ch.bindQueue(QUEUES.INVENTORY_EVENTS,      EXCHANGE, ROUTING_KEYS.INVENTORY_INSUFFICIENT);
  await ch.bindQueue(QUEUES.ORDER_CHECKOUT_EVENTS, EXCHANGE, ROUTING_KEYS.CHECKOUT_INITIATED);
}

function scheduleReconnect() {
  reconnectAttempts += 1;
  const delay = Math.min(1000 * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  logger.warn(`RabbitMQ reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
  setTimeout(async () => {
    try { await connectRabbitMQ(); } catch { /* scheduleReconnect called internally */ }
  }, delay);
}

export function getChannel() {
  if (!channel) throw new Error('RabbitMQ channel not ready');
  return channel;
}

export function isConnected() {
  return connection !== null && channel !== null;
}

export async function closeRabbitMQ() {
  try {
    if (channel)    await channel.close();
    if (connection) await connection.close();
    logger.info('RabbitMQ closed gracefully');
  } catch (err) {
    logger.error('Error closing RabbitMQ:', err.message);
  }
}
