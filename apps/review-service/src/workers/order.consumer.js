// order.consumer.js
// ─────────────────────────────────────────────────────────────────────────────
// Consumes order.delivered events from RabbitMQ and writes them to the local
// DeliveredOrder cache. This decouples the Review Service from the Order Service
// — no synchronous HTTP calls needed at review time.
//
// Event shape expected (published by Order Service):
// {
//   orderId: "uuid",
//   userId: "uuid",
//   productIds: ["SKU-1", "SKU-2"],
//   deliveredAt: "2026-02-28T10:00:00.000Z"
// }
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../../prisma/client.js';
import logger from '../utils/logger.js';
import { deliveredOrderEventSchema } from '../utils/schemas.js';

export async function handleDeliveredOrder(rawPayload) {
  // Validate shape before touching the DB
  const result = deliveredOrderEventSchema.safeParse(rawPayload);

  if (!result.success) {
    logger.warn({ msg: 'Invalid order.delivered payload — skipping', errors: result.error.errors, rawPayload });
    return;
  }

  const { orderId, userId, productIds, deliveredAt } = result.data;

  // Upsert so re-deliveries or replayed events are idempotent
  await prisma.deliveredOrder.upsert({
    where: { orderId },
    create: {
      orderId,
      userId,
      productIds,
      deliveredAt: new Date(deliveredAt),
    },
    update: {
      productIds,
      deliveredAt: new Date(deliveredAt),
    },
  });

  logger.info({ msg: 'DeliveredOrder cached', orderId, userId, productCount: productIds.length });
}