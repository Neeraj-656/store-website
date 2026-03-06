/**
 * Shared transaction helpers.
 * These are called inside prisma.$transaction() so they receive `tx` (not prisma).
 */

export async function recordStatusHistory(tx, paymentId, fromStatus, toStatus, reason) {
  await tx.paymentStatusHistory.create({
    data: {
      paymentId,
      fromStatus: fromStatus ?? undefined,
      toStatus,
      reason: reason ?? null,
    },
  });
}

export async function enqueueOutboxEvent(tx, paymentId, eventType, payload) {
  await tx.paymentOutboxEvent.create({
    data: { paymentId, eventType, payload },
  });
}