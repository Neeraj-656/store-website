import axios      from 'axios';
import axiosRetry from 'axios-retry';
import { prisma } from '../config/prisma.js';
import { ORDER_STATUS, TERMINAL_STATES, VALID_TRANSITIONS } from '../constants/orderStateMachine.js';
import * as publishers from '../events/publishers.js';
import logger from '../config/logger.js';

// ── Axios with retry + timeout ────────────────────────────────────────────────
const http = axios.create({ timeout: 5_000 });
axiosRetry(http, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) =>
    axiosRetry.isNetworkError(err) || (err.response?.status >= 500 && err.response?.status <= 599),
  onRetry: (count, err) =>
    logger.warn(`Axios retry ${count} for ${err.config?.url}: ${err.message}`),
});

// ── Custom errors ─────────────────────────────────────────────────────────────
export class StateError    extends Error { constructor(m) { super(m); this.name = 'StateError';    this.statusCode = 422; } }
export class NotFoundError extends Error { constructor(m) { super(m); this.name = 'NotFoundError'; this.statusCode = 404; } }
export class ConflictError extends Error { constructor(m) { super(m); this.name = 'ConflictError'; this.statusCode = 409; } }

// ── State machine ─────────────────────────────────────────────────────────────
function assertTransition(order, toStatus) {
  if (TERMINAL_STATES.has(order.status)) throw new StateError(`Order is in terminal state: ${order.status}`);
  const allowed = VALID_TRANSITIONS[order.status] || [];
  if (!allowed.includes(toStatus)) {
    throw new StateError(`Invalid transition: ${order.status} → ${toStatus}. Allowed: [${allowed.join(', ')}]`);
  }
}

// ── Currency helpers ──────────────────────────────────────────────────────────
const toCents   = (dollars) => Math.round(parseFloat(dollars) * 100);
const fromCents = (cents)   => (cents / 100).toFixed(2);

// ── Service ───────────────────────────────────────────────────────────────────

export async function createOrder({ customerId, items, idempotencyKey }) {
  await validateCustomer(customerId);
  const deduped       = deduplicateItems(items);
  const enrichedItems = await validateAndEnrichItems(deduped);
  const totalCents    = enrichedItems.reduce((sum, i) => sum + i.subtotalCents, 0);

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          customerId,
          orderReference: idempotencyKey,
          totalCents,
          items: {
            create: enrichedItems.map((i) => ({
              productId: i.productId, productName: i.productName,
              quantity: i.quantity, unitCents: i.unitCents, subtotalCents: i.subtotalCents,
            })),
          },
          statusHistory: {
            create: { fromStatus: null, toStatus: ORDER_STATUS.PENDING, reason: 'Order created', triggeredBy: 'customer' },
          },
        },
        include: { items: true },
      });
      await publishers.publishOrderCreated(tx, newOrder);
      return newOrder;
    });
  } catch (err) {
    if (err.code === 'P2002' && err.meta?.target?.includes('orderReference')) {
      logger.info(`Idempotent return for key: ${idempotencyKey}`);
      return prisma.order.findUnique({
        where:   { orderReference: idempotencyKey },
        include: { items: true, statusHistory: true },
      }).then(serializeOrder);
    }
    throw err;
  }

  return getOrderById(order.id);
}

export async function checkoutOrder(orderId) {
  const order = await findOrFail(orderId);
  assertTransition(order, ORDER_STATUS.CHECKOUT_INITIATED);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where:   { id: orderId },
      data:    { status: ORDER_STATUS.CHECKOUT_INITIATED },
      include: { items: true },
    });
    await tx.orderStatusHistory.create({
      data: { orderId, fromStatus: ORDER_STATUS.PENDING, toStatus: ORDER_STATUS.CHECKOUT_INITIATED, reason: 'Checkout started', triggeredBy: 'customer' },
    });
    await publishers.publishCheckoutInitiated(tx, updated);
  });

  logger.info(`Order ${orderId} → CHECKOUT_INITIATED (saga queued)`);
  return getOrderById(orderId);
}

export async function shipOrder(orderId, triggeredBy = 'system') {
  const order = await findOrFail(orderId);
  assertTransition(order, ORDER_STATUS.SHIPPED);
  return transitionOrder(order, ORDER_STATUS.SHIPPED, 'Order shipped', triggeredBy, publishers.publishOrderShipped);
}

export async function deliverOrder(orderId, triggeredBy = 'system') {
  const order = await findOrFail(orderId);
  assertTransition(order, ORDER_STATUS.DELIVERED);
  return transitionOrder(order, ORDER_STATUS.DELIVERED, 'Order delivered', triggeredBy, publishers.publishOrderDelivered);
}

export async function cancelOrder(orderId, reason = 'Customer requested', triggeredBy = 'customer') {
  const order = await findOrFail(orderId);
  assertTransition(order, ORDER_STATUS.CANCELLED);
  return transitionOrder(order, ORDER_STATUS.CANCELLED, reason, triggeredBy,
    (tx, o) => publishers.publishOrderCancelled(tx, o, reason));
}

export async function getOrderById(orderId) {
  const order = await prisma.order.findUnique({
    where:   { id: orderId },
    include: { items: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
  });
  if (!order) throw new NotFoundError(`Order ${orderId} not found`);
  return serializeOrder(order);
}

export async function getOrdersByCustomer(customerId, { page = 1, limit = 20 } = {}) {
  const take = Math.min(Math.max(parseInt(limit), 1), 100);
  const skip = (Math.max(parseInt(page), 1) - 1) * take;

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where: { customerId }, include: { items: true },
      orderBy: { createdAt: 'desc' }, take, skip,
    }),
    prisma.order.count({ where: { customerId } }),
  ]);

  return {
    data: orders.map(serializeOrder),
    pagination: { page: parseInt(page), limit: take, total, pages: Math.ceil(total / take) },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function serializeOrder(order) {
  return {
    ...order,
    total:      fromCents(order.totalCents),
    totalCents: order.totalCents,
    items: (order.items || []).map((i) => ({
      ...i, unitPrice: fromCents(i.unitCents), subtotal: fromCents(i.subtotalCents),
    })),
  };
}

async function findOrFail(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError(`Order ${orderId} not found`);
  return order;
}

async function transitionOrder(order, toStatus, reason, triggeredBy, publishFn) {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({ where: { id: order.id }, data: { status: toStatus } });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus, reason, triggeredBy },
    });
    await publishFn(tx, updated);
  });
  return getOrderById(order.id);
}

function deduplicateItems(items) {
  const map = new Map();
  for (const item of items) {
    if (map.has(item.productId)) map.get(item.productId).quantity += item.quantity;
    else map.set(item.productId, { ...item });
  }
  return Array.from(map.values());
}

async function validateCustomer(customerId) {
  try {
    await http.get(`${process.env.CUSTOMER_SERVICE_URL}/api/customers/${customerId}`);
  } catch (err) {
    if (err.response?.status === 404) throw new NotFoundError(`Customer ${customerId} not found`);
    logger.warn(`Customer service unreachable for ${customerId}: ${err.message}`);
    if (process.env.NODE_ENV === 'production') throw err;
  }
}

async function validateAndEnrichItems(items) {
  return Promise.all(items.map(async ({ productId, quantity }) => {
    try {
      const { data: product } = await http.get(`${process.env.INVENTORY_SERVICE_URL}/api/products/${productId}`);
      const unitCents     = toCents(product.price);
      const subtotalCents = unitCents * quantity;
      return { productId, productName: product.name, quantity, unitCents, subtotalCents };
    } catch (err) {
      if (err.response?.status === 404) throw new NotFoundError(`Product ${productId} not found`);
      throw err;
    }
  }));
}
