import axios      from 'axios';
import axiosRetry from 'axios-retry';
import { getChannel, QUEUES, ROUTING_KEYS, MAX_RETRIES } from '../config/rabbitmq.js';
import { prisma }    from '../config/prisma.js';
import { ORDER_STATUS, TERMINAL_STATES } from '../constants/orderStateMachine.js';
import * as publishers from './publishers.js';
import logger from '../config/logger.js';

const http = axios.create({ timeout: 5_000 });
axiosRetry(http, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkError(err) || (err.response?.status >= 500),
});

const RETRY_BACKOFF_MS = [5_000, 15_000, 30_000];

function getDeliveryCount(msg) {
  return msg.properties?.headers?.['x-delivery-count'] ?? 0;
}

function withRetry(handler) {
  return async (msg) => {
    if (!msg) return;
    const channel = getChannel();

    let event;
    try {
      event = JSON.parse(msg.content.toString());
    } catch {
      logger.error('[Consumer] Malformed JSON — routing to DLQ immediately (no retry)');
      channel.nack(msg, false, false);
      return;
    }

    const deliveryCount = getDeliveryCount(msg);

    try {
      await handler(event, msg);
      channel.ack(msg);
    } catch (err) {
      logger.error(
        `[Consumer] Handler failed (delivery ${deliveryCount + 1}, max ${MAX_RETRIES + 1}): ${err.message}`
      );

      if (deliveryCount >= MAX_RETRIES) {
        logger.error('[Consumer] Max retries exhausted — routing to DLQ');
        channel.nack(msg, false, false);
      } else {
        const delayMs = RETRY_BACKOFF_MS[deliveryCount] ?? 30_000;
        logger.warn(`[Consumer] Backing off ${delayMs}ms before retry ${deliveryCount + 1}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        channel.nack(msg, false, true);
      }
    }
  };
}

export async function startConsumers() {
  const channel = getChannel();

  channel.consume(QUEUES.PAYMENT_EVENTS, withRetry(async (event, msg) => {
    const rk = msg.fields.routingKey;
    if      (rk === ROUTING_KEYS.PAYMENT_SUCCESS) await handlePaymentSuccess(event);
    else if (rk === ROUTING_KEYS.PAYMENT_FAILED)  await handlePaymentFailed(event);
    else logger.warn(`[Consumer] Unknown routing key on payment queue: ${rk}`);
  }));

  channel.consume(QUEUES.INVENTORY_EVENTS, withRetry(async (event) => {
    await handleInventoryInsufficient(event);
  }));

  channel.consume(QUEUES.ORDER_CHECKOUT_EVENTS, withRetry(async (event) => {
    await handleCheckoutInitiated(event);
  }));

  logger.info('Consumers active: payment.events, inventory.events, order.checkout.events');
}

async function handlePaymentSuccess({ orderId, paymentReference }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return logger.warn(`payment.success: Order ${orderId} not found`);
  if (order.status !== ORDER_STATUS.CHECKOUT_INITIATED) {
    return logger.warn(`payment.success: Order ${orderId} not in CHECKOUT_INITIATED (${order.status})`);
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data:  { status: ORDER_STATUS.PROCESSING, paymentReference },
    });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: ORDER_STATUS.CHECKOUT_INITIATED, toStatus: ORDER_STATUS.PROCESSING, reason: 'Payment confirmed', triggeredBy: 'payment-service' },
    });
    await publishers.publishOrderConfirmed(tx, updated);
  });

  logger.info(`Order ${orderId} → PROCESSING`);
}

async function handlePaymentFailed({ orderId, reason }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || TERMINAL_STATES.has(order.status)) return;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data:  { status: ORDER_STATUS.CANCELLED },
    });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: order.status, toStatus: ORDER_STATUS.CANCELLED, reason: reason || 'Payment failed', triggeredBy: 'payment-service' },
    });
    if (order.inventoryReservationId) {
      await publishers.publishInventoryReleaseRequested(tx, orderId, order.inventoryReservationId);
    }
    await publishers.publishOrderCancelled(tx, updated, reason || 'Payment failed');
  });

  logger.info(`Order ${orderId} → CANCELLED (payment failed) — inventory release queued`);
}

async function handleInventoryInsufficient({ orderId, reason }) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || TERMINAL_STATES.has(order.status)) return;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data:  { status: ORDER_STATUS.CANCELLED },
    });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: order.status, toStatus: ORDER_STATUS.CANCELLED, reason: reason || 'Inventory insufficient', triggeredBy: 'inventory-service' },
    });
    await publishers.publishOrderCancelled(tx, updated, reason || 'Inventory insufficient');
  });

  logger.info(`Order ${orderId} → CANCELLED (inventory insufficient)`);
}

async function handleCheckoutInitiated({ orderId, items, totalCents }) {
  const order = await prisma.order.findUnique({
    where:   { id: orderId },
    include: { items: true },
  });

  if (!order) return logger.warn(`checkout.initiated: Order ${orderId} not found`);
  if (TERMINAL_STATES.has(order.status)) return;

  let reservationId = order.inventoryReservationId;

  if (!reservationId) {
    try {
      const { data } = await http.post(
        `${process.env.INVENTORY_SERVICE_URL}/api/inventory/reserve`,
        { orderId, items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) }
      );
      reservationId = data.reservationId;
      await prisma.order.update({ where: { id: orderId }, data: { inventoryReservationId: reservationId } });
      logger.info(`Order ${orderId}: inventory reserved (${reservationId})`);
    } catch (err) {
      logger.error(`Order ${orderId}: inventory reservation failed:`, err.message);
      throw err;
    }
  }

  try {
    await http.post(`${process.env.PAYMENT_SERVICE_URL}/api/payments/charge`, {
      orderId,
      customerId:  order.customerId,
      amountCents: totalCents || order.totalCents,
    });
    logger.info(`Order ${orderId}: payment requested`);
  } catch (paymentErr) {
    logger.error(`Order ${orderId}: payment request failed — queuing inventory release`);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data:  { status: ORDER_STATUS.CANCELLED },
      });
      await tx.orderStatusHistory.create({
        data: { orderId, fromStatus: order.status, toStatus: ORDER_STATUS.CANCELLED, reason: 'Payment request failed during checkout', triggeredBy: 'saga' },
      });
      await publishers.publishInventoryReleaseRequested(tx, orderId, reservationId);
      await publishers.publishOrderCancelled(tx, updated, 'Payment request failed');
    });
  }
}
