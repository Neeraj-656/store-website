/**
 * ledger.helpers.js
 *
 * All mutations run inside prisma.$transaction(tx => ...) callers.
 * These helpers receive `tx` and never commit on their own.
 */

// ─── Write an immutable ledger entry ────────────────────────────────────────

export async function writeLedgerEntry(tx, { vendorId, type, amount, balanceAfter, referenceId, referenceType, description }) {
  return tx.ledgerEntry.create({
    data: { vendorId, type, amount, balanceAfter, referenceId, referenceType, description: description ?? null },
  });
}

// ─── Write payout status history ────────────────────────────────────────────

export async function recordPayoutHistory(tx, payoutId, fromStatus, toStatus, reason) {
  return tx.payoutStatusHistory.create({
    data: {
      payoutId,
      fromStatus: fromStatus ?? undefined,
      toStatus,
      reason: reason ?? null,
    },
  });
}

// ─── Enqueue outbox event (guaranteed delivery via relay worker) ─────────────

export async function enqueueOutboxEvent(tx, payoutId, eventType, payload) {
  return tx.payoutOutboxEvent.create({
    data: { payoutId, eventType, payload },
  });
}
