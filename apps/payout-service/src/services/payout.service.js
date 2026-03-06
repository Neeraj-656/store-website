/**
 * payout.service.js
 *
 * Responsibility C: Settlement
 * - Vendor or admin initiates a payout
 * - Validates sufficient availableBalance
 * - Calls Razorpay X (Payouts API) to initiate bank transfer
 * - Persists payout record with outbox event
 * - Handles Razorpay X webhook callbacks for status updates
 */

import prisma from '../../prisma/client.js';
import logger from '../utils/logger.js';
import { writeLedgerEntry, recordPayoutHistory, enqueueOutboxEvent } from './ledger.helpers.js';
import { NotFoundError, ConflictError, InsufficientBalanceError } from '../utils/errors.js';
import { razorpayXProvider } from './providers/razorpayx.provider.js';

// ─── Request a payout ────────────────────────────────────────────────────────
//
// 1. Validate availableBalance >= amount
// 2. Deduct from availableBalance (hold funds)
// 3. Create PENDING payout record + ledger entry
// 4. Initiate transfer via Razorpay X
// 5. Update payout with provider details

export async function requestPayout({ vendorId, amount, bankAccountId, ifscCode, accountNumber }) {
  const wallet = await prisma.vendorWallet.findUnique({ where: { vendorId } });
  if (!wallet) throw new NotFoundError('VendorWallet');

  if (wallet.availableBalance < amount) {
    throw new InsufficientBalanceError(wallet.availableBalance, amount);
  }

  // ── Reserve funds + create PENDING payout in one transaction ─────────────
  const payout = await prisma.$transaction(async (tx) => {
    const updatedWallet = await tx.vendorWallet.update({
      where: { vendorId },
      data: {
        availableBalance: { decrement: amount },
        totalPayouts:     { increment: amount },
      },
    });

    const p = await tx.payout.create({
      data: {
        vendorId,
        amount,
        status:        'PENDING',
        bankAccountId,
        ifscCode,
        accountNumber: accountNumber.slice(-4),  // store last 4 only
      },
    });

    await recordPayoutHistory(tx, p.id, null, 'PENDING', 'Payout requested');

    await writeLedgerEntry(tx, {
      vendorId,
      type:          'PAYOUT',
      amount,
      balanceAfter:  updatedWallet.availableBalance,
      referenceId:   p.id,
      referenceType: 'PAYOUT',
      description:   `Payout initiated to bank account ending ${accountNumber.slice(-4)}`,
    });

    await enqueueOutboxEvent(tx, p.id, 'payout.initiated', {
      payoutId: p.id,
      vendorId,
      amount,
    });

    return p;
  });

  logger.info({ msg: 'Payout record created, initiating transfer', payoutId: payout.id, vendorId, amount });

  // ── Call Razorpay X to initiate bank transfer ─────────────────────────────
  const result = await razorpayXProvider.initiateTransfer({
    amount,
    accountNumber,
    ifscCode,
    referenceId: payout.id,
  });

  const newStatus = result.status === 'processing' ? 'PROCESSING' : 'FAILED';

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payout.update({
      where: { id: payout.id },
      data: {
        status:          newStatus,
        razorpayPayoutId: result.razorpayPayoutId ?? null,
        providerResponse: result.providerResponse,
        failureReason:   result.failureReason ?? null,
        initiatedAt:     newStatus === 'PROCESSING' ? new Date() : null,
      },
    });

    await recordPayoutHistory(tx, p.id, 'PENDING', newStatus, result.failureReason ?? null);

    if (newStatus === 'FAILED') {
      // Reverse the balance deduction — refund back to available
      await tx.vendorWallet.update({
        where: { vendorId },
        data: {
          availableBalance: { increment: amount },
          totalPayouts:     { decrement: amount },
        },
      });

      await enqueueOutboxEvent(tx, p.id, 'payout.failed', {
        payoutId: p.id,
        vendorId,
        amount,
        reason: result.failureReason,
      });
    }

    return p;
  });

  logger.info({ msg: 'Payout status updated', payoutId: updated.id, status: updated.status });
  return updated;
}

// ─── Handle Razorpay X webhook ───────────────────────────────────────────────

export async function handlePayoutWebhook(rawBody, signature) {
  const result = razorpayXProvider.verifyWebhook(rawBody, signature);
  if (!result.valid) {
    const { AppError } = await import('../utils/errors.js');
    throw new AppError(400, 'Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  const { eventType, razorpayPayoutId, utr, payload } = result;
  logger.info({ msg: 'Payout webhook received', eventType, razorpayPayoutId });

  const payout = await prisma.payout.findUnique({ where: { razorpayPayoutId } });
  if (!payout) {
    logger.warn({ msg: 'Payout webhook: no payout found', razorpayPayoutId });
    return;
  }

  // ── payout.processed → SUCCESS ───────────────────────────────────────────
  if (eventType === 'payout.processed') {
    if (payout.status === 'SUCCESS') return; // idempotent

    await prisma.$transaction(async (tx) => {
      const p = await tx.payout.update({
        where: { id: payout.id },
        data: {
          status:          'SUCCESS',
          utr:             utr ?? null,
          providerResponse: payload,
          completedAt:     new Date(),
        },
      });

      await recordPayoutHistory(tx, p.id, payout.status, 'SUCCESS', 'Webhook: payout.processed');
      await enqueueOutboxEvent(tx, p.id, 'payout.success', {
        payoutId: p.id,
        vendorId: p.vendorId,
        amount:   p.amount,
        utr,
      });
    });
  }

  // ── payout.reversed → FAILED (bank returned funds) ───────────────────────
  else if (eventType === 'payout.reversed' || eventType === 'payout.failed') {
    if (['FAILED', 'CANCELLED'].includes(payout.status)) return;

    const reason = payload?.payout?.error_description ?? 'Payout reversed by bank';

    await prisma.$transaction(async (tx) => {
      const p = await tx.payout.update({
        where: { id: payout.id },
        data: { status: 'FAILED', failureReason: reason, providerResponse: payload },
      });

      await recordPayoutHistory(tx, p.id, payout.status, 'FAILED', reason);

      // Refund back to vendor available balance
      const wallet = await tx.vendorWallet.update({
        where: { vendorId: payout.vendorId },
        data: {
          availableBalance: { increment: payout.amount },
          totalPayouts:     { decrement: payout.amount },
        },
      });

      await writeLedgerEntry(tx, {
        vendorId:      payout.vendorId,
        type:          'ADJUSTMENT',
        amount:        payout.amount,
        balanceAfter:  wallet.availableBalance,
        referenceId:   p.id,
        referenceType: 'PAYOUT',
        description:   `Payout reversed: ${reason}`,
      });

      await enqueueOutboxEvent(tx, p.id, 'payout.failed', {
        payoutId: p.id,
        vendorId: p.vendorId,
        amount:   p.amount,
        reason,
      });
    });
  }

  else {
    logger.debug({ msg: 'Payout webhook event not handled', eventType });
  }
}

// ─── Get payout by ID ────────────────────────────────────────────────────────

export async function getPayoutById(id, vendorId) {
  const payout = await prisma.payout.findUnique({
    where: { id },
    include: {
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!payout) throw new NotFoundError('Payout');
  if (vendorId && payout.vendorId !== vendorId) {
    const { ForbiddenError } = await import('../utils/errors.js');
    throw new ForbiddenError();
  }

  return payout;
}

// ─── List payouts for vendor ─────────────────────────────────────────────────

export async function listPayouts({ vendorId, status, page = 1, limit = 20 }) {
  const where = {
    vendorId,
    ...(status && { status }),
  };

  const [payouts, total] = await Promise.all([
    prisma.payout.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
      include: { statusHistory: { orderBy: { createdAt: 'asc' } } },
    }),
    prisma.payout.count({ where }),
  ]);

  return { payouts, total, page, limit, pages: Math.ceil(total / limit) };
}
