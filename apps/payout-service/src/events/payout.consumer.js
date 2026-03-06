/**
 * payout.consumer.js
 *
 * Subscribes to domain events from other services:
 *   - order.delivered   → credit vendor earnings into escrow
 *   - payment.refunded  → claw back vendor earnings
 */

import { consume } from '../services/rabbitmq.service.js';
import { creditVendorEarnings, debitVendorOnRefund } from '../services/earnings.service.js';
import logger from '../utils/logger.js';

export async function startConsumers() {
  // ── order.delivered ──────────────────────────────────────────────────────
  // Expected payload from Order Service:
  // { orderId, vendorId, grossAmount, customerId }
  await consume(
    'order.delivered',
    'payout-service.order.delivered',
    async (payload) => {
      const { orderId, vendorId, grossAmount } = payload;

      if (!orderId || !vendorId || !grossAmount) {
        logger.warn({ msg: 'order.delivered: missing required fields', payload });
        return;
      }

      logger.info({ msg: 'Processing order.delivered', orderId, vendorId, grossAmount });
      await creditVendorEarnings({ orderId, vendorId, grossAmount });
    },
  );

  // ── payment.refunded ─────────────────────────────────────────────────────
  // Expected payload from Payment Service:
  // { orderId, vendorId, paymentId, amount, type }
  await consume(
    'payment.refunded',
    'payout-service.payment.refunded',
    async (payload) => {
      const { orderId, vendorId } = payload;

      if (!orderId || !vendorId) {
        logger.warn({ msg: 'payment.refunded: missing required fields', payload });
        return;
      }

      logger.info({ msg: 'Processing payment.refunded', orderId, vendorId });
      await debitVendorOnRefund({ orderId, vendorId });
    },
  );

  logger.info('Payout consumers started');
}
