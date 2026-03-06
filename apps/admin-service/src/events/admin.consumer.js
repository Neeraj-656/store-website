/**
 * admin.consumer.js
 *
 * Listens to platform events that may require admin intervention.
 * Auto-creates CRITICAL moderation cases for high-priority signals.
 *
 * Events consumed:
 *   - vendor.fraud_flagged           → open FRAUD_REPORT case
 *   - review.manipulation_detected   → open REVIEW_MANIPULATION case
 *
 * ─── Issue 1 fix: Idempotent consumers ──────────────────────────────────────
 * RabbitMQ guarantees at-least-once delivery. A message can be redelivered if
 * a network partition occurs right after processing but before the ack arrives.
 * Without idempotency, ORDER_FORCE_REFUNDED or VENDOR_BLACKLISTED events could
 * be processed twice, causing double refunds or corrupt case state.
 *
 * Fix: before doing any work, each consumer calls withIdempotency(messageId, queue, fn).
 * This helper attempts to INSERT a ProcessedMessage row. If the row already
 * exists (duplicate delivery), it skips the handler entirely. The unique
 * database constraint is the atomic guard — no race condition possible.
 *
 * Message IDs: Publishers MUST set a stable correlationId or messageId on every
 * message. The consume() wrapper in rabbitmq.service.js surfaces the raw AMQP
 * message properties so consumers can extract it.
 */

import { consume } from '../services/rabbitmq.service.js';
import prisma      from '../../prisma/client.js';
import logger      from '../utils/logger.js';

// ─── Idempotency helper ───────────────────────────────────────────────────────

/**
 * Wraps a consumer handler with idempotency logic.
 *
 * @param {string} messageId  - Stable unique ID from the message (correlationId / messageId)
 * @param {string} queue      - Name of the consuming queue (for observability)
 * @param {Function} fn       - The actual handler to run if not already processed
 */
async function withIdempotency(messageId, queue, fn) {
  if (!messageId) {
    // No messageId — cannot guarantee idempotency. Log a warning and
    // process anyway rather than silently dropping the message.
    logger.warn({ msg: 'Message has no messageId — idempotency check skipped', queue });
    return fn();
  }

  try {
    // Attempt to claim the message ID. createMany with skipDuplicates is a
    // single atomic operation — if the row exists the insert is a no-op and
    // `count` will be 0.
    const { count } = await prisma.processedMessage.createMany({
      data:          [{ messageId, queue }],
      skipDuplicates: true,
    });

    if (count === 0) {
      logger.info({ msg: 'Duplicate message detected — skipping', messageId, queue });
      return; // already processed
    }

    await fn();
  } catch (err) {
    // If the insert itself fails for a reason other than uniqueness (e.g. DB
    // is down), propagate the error so the message is nack'd and redelivered
    // later rather than silently lost.
    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getSystemAdmin() {
  return prisma.adminUser.findFirst({
    where: { isActive: true, role: 'SUPER_ADMIN' },
  });
}

async function nextCaseNumber() {
  const year  = new Date().getFullYear();
  const count = await prisma.moderationCase.count({
    where: { caseNumber: { startsWith: `CASE-${year}-` } },
  });
  return `CASE-${year}-${String(count + 1).padStart(4, '0')}`;
}

// ─── Consumers ────────────────────────────────────────────────────────────────

export async function startConsumers() {

  // ── vendor.fraud_flagged ───────────────────────────────────────────────────
  await consume(
    'vendor.fraud_flagged',
    'admin-service.vendor.fraud_flagged',
    async (payload, props) => {
      const messageId = props?.correlationId ?? props?.messageId;

      await withIdempotency(messageId, 'admin-service.vendor.fraud_flagged', async () => {
        const { vendorId, fraudScore, flags } = payload;
        const systemAdmin = await getSystemAdmin();

        if (!systemAdmin) {
          logger.error({ msg: 'No active super admin to open auto-case', vendorId });
          return;
        }

        // Avoid duplicate open cases for the same vendor (business-level
        // dedup — separate from the message-level idempotency above).
        const existing = await prisma.moderationCase.findFirst({
          where: {
            entityType: 'VENDOR',
            entityId:   vendorId,
            status:     { in: ['OPEN', 'IN_REVIEW'] },
            category:   'FRAUD_REPORT',
          },
        });

        if (existing) {
          logger.info({ msg: 'Fraud case already open for vendor', vendorId, caseId: existing.id });
          return;
        }

        await prisma.moderationCase.create({
          data: {
            caseNumber:     await nextCaseNumber(),
            entityType:     'VENDOR',
            entityId:       vendorId,
            category:       'FRAUD_REPORT',
            priority:       'HIGH',
            status:         'OPEN',
            title:          `Auto-flagged: High fraud score (${fraudScore})`,
            description:    `Vendor automatically flagged by fraud scoring system.\n\nFlags:\n${JSON.stringify(flags, null, 2)}`,
            openedById:     systemAdmin.id,
            entitySnapshot: payload,
          },
        });

        logger.info({ msg: 'Auto-case created for fraud-flagged vendor', vendorId, fraudScore, messageId });
      });
    },
  );

  // ── review.manipulation_detected ──────────────────────────────────────────
  await consume(
    'review.manipulation_detected',
    'admin-service.review.manipulation',
    async (payload, props) => {
      const messageId = props?.correlationId ?? props?.messageId;

      await withIdempotency(messageId, 'admin-service.review.manipulation', async () => {
        const { vendorId, productId, reviewId, reason } = payload;
        const systemAdmin = await getSystemAdmin();
        if (!systemAdmin) return;

        await prisma.moderationCase.create({
          data: {
            caseNumber:     await nextCaseNumber(),
            entityType:     'REVIEW',
            entityId:       reviewId,
            category:       'REVIEW_MANIPULATION',
            priority:       'HIGH',
            status:         'OPEN',
            title:          `Review manipulation detected for product ${productId}`,
            description:    reason ?? 'Automated detection of review manipulation pattern',
            openedById:     systemAdmin.id,
            entitySnapshot: payload,
          },
        });

        logger.info({ msg: 'Auto-case created for review manipulation', reviewId, productId, messageId });
      });
    },
  );

  logger.info('Admin consumers started');
}
