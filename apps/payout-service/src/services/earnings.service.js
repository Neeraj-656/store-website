/**
 * earnings.service.js
 *
 * Responsibility A: Earnings Ledger
 * - Called when an order is delivered (via RabbitMQ consumer)
 * - Creates/upserts vendor wallet
 * - Calculates commission and payment fee deductions
 * - Locks net earnings in escrow until release window passes
 *
 * Responsibility B: Escrow Release
 * - Called by the escrow-release worker on a schedule
 * - Moves net amount from pendingBalance → availableBalance
 */

import prisma from '../../prisma/client.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { writeLedgerEntry } from './ledger.helpers.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

// ─── Resolve commission rule for vendor ─────────────────────────────────────

async function getCommissionRule(vendorId) {
  // Prefer vendor-specific override, fall back to platform default
  const rule = await prisma.commissionRule.findFirst({
    where: {
      isActive: true,
      OR: [{ vendorId }, { vendorId: null }],
    },
    orderBy: [
      // vendor-specific rows have vendorId != null — sort them first
      { vendorId: 'desc' },
    ],
  });

  return {
    commissionRate: rule ? Number(rule.commissionRate) : config.settlement.defaultCommissionRate,
    paymentFeeRate: rule ? Number(rule.paymentFeeRate) : config.settlement.defaultPaymentFeeRate,
  };
}

// ─── Credit vendor earnings when order is delivered ─────────────────────────
//
// Flow:
//  1. Upsert wallet (create if first order for this vendor)
//  2. Calculate fees
//  3. Create escrow hold — funds locked for ESCROW_HOLD_DAYS
//  4. Increment pendingBalance on wallet
//  5. Write CREDIT, COMMISSION_FEE, PAYMENT_FEE ledger entries

export async function creditVendorEarnings({ orderId, vendorId, grossAmount }) {
  // Guard: one escrow hold per order
  const existing = await prisma.escrowHold.findUnique({ where: { orderId } });
  if (existing) {
    logger.warn({ msg: 'Duplicate creditVendorEarnings — escrow already exists', orderId });
    return existing;
  }

  const { commissionRate, paymentFeeRate } = await getCommissionRule(vendorId);

  const commissionFee = Math.round(grossAmount * commissionRate);
  const paymentFee    = Math.round(grossAmount * paymentFeeRate);
  const netAmount     = grossAmount - commissionFee - paymentFee;

  const releaseAfter = new Date();
  releaseAfter.setDate(releaseAfter.getDate() + config.escrow.holdDays);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Upsert wallet
    const wallet = await tx.vendorWallet.upsert({
      where:  { vendorId },
      create: {
        vendorId,
        availableBalance: 0,
        pendingBalance:   netAmount,
        lifetimeEarnings: netAmount,
        totalPayouts:     0,
      },
      update: {
        pendingBalance:   { increment: netAmount },
        lifetimeEarnings: { increment: netAmount },
      },
    });

    // 2. Create escrow hold
    const escrow = await tx.escrowHold.create({
      data: { vendorId, orderId, grossAmount, commissionFee, paymentFee, netAmount, releaseAfter },
    });

    // 3. Ledger: gross credit
    await writeLedgerEntry(tx, {
      vendorId,
      type:          'CREDIT',
      amount:        grossAmount,
      balanceAfter:  wallet.availableBalance,   // available unchanged at this point
      referenceId:   orderId,
      referenceType: 'ORDER',
      description:   `Gross earnings for order ${orderId}`,
    });

    // 4. Ledger: commission deducted
    await writeLedgerEntry(tx, {
      vendorId,
      type:          'COMMISSION_FEE',
      amount:        commissionFee,
      balanceAfter:  wallet.availableBalance,
      referenceId:   orderId,
      referenceType: 'ORDER',
      description:   `Platform commission ${(commissionRate * 100).toFixed(2)}%`,
    });

    // 5. Ledger: payment fee deducted
    await writeLedgerEntry(tx, {
      vendorId,
      type:          'PAYMENT_FEE',
      amount:        paymentFee,
      balanceAfter:  wallet.availableBalance,
      referenceId:   orderId,
      referenceType: 'ORDER',
      description:   `Payment gateway fee ${(paymentFeeRate * 100).toFixed(2)}%`,
    });

    return { wallet, escrow };
  });

  logger.info({
    msg: 'Vendor earnings credited to escrow',
    vendorId, orderId, grossAmount, commissionFee, paymentFee, netAmount,
    releaseAfter,
  });

  return result.escrow;
}

// ─── Debit vendor on order refund ───────────────────────────────────────────
//
// If the order is still in escrow, mark escrow REFUNDED and reduce pendingBalance.
// If already released (rare), reduce availableBalance and write REFUND_DEBIT.

export async function debitVendorOnRefund({ orderId, vendorId }) {
  const escrow = await prisma.escrowHold.findUnique({ where: { orderId } });
  if (!escrow) {
    logger.warn({ msg: 'debitVendorOnRefund: no escrow found for order', orderId });
    return;
  }

  if (escrow.status === 'REFUNDED') {
    logger.warn({ msg: 'debitVendorOnRefund: escrow already refunded', orderId });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.escrowHold.update({
      where: { orderId },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });

    if (escrow.status === 'HELD') {
      // Still pending — reduce pendingBalance
      await tx.vendorWallet.update({
        where: { vendorId },
        data: { pendingBalance: { decrement: escrow.netAmount }, lifetimeEarnings: { decrement: escrow.netAmount } },
      });
    } else {
      // Already released — claw back from available balance
      const wallet = await tx.vendorWallet.update({
        where: { vendorId },
        data: { availableBalance: { decrement: escrow.netAmount }, lifetimeEarnings: { decrement: escrow.netAmount } },
      });
      await writeLedgerEntry(tx, {
        vendorId,
        type:          'REFUND_DEBIT',
        amount:        escrow.netAmount,
        balanceAfter:  wallet.availableBalance,
        referenceId:   orderId,
        referenceType: 'ORDER',
        description:   `Claw-back for refunded order ${orderId}`,
      });
    }
  });

  logger.info({ msg: 'Vendor earnings debited due to refund', vendorId, orderId });
}

// ─── Release escrow holds whose window has passed ───────────────────────────
//
// Called by the escrow-release worker on a schedule (e.g. every hour).
// Moves held funds from pendingBalance → availableBalance in batches.

export async function releaseMaturedEscrowHolds(batchSize = 50) {
  const now = new Date();

  const matured = await prisma.escrowHold.findMany({
    where: { status: 'HELD', releaseAfter: { lte: now } },
    take:  batchSize,
    orderBy: { releaseAfter: 'asc' },
  });

  if (matured.length === 0) return 0;

  let released = 0;

  for (const hold of matured) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.escrowHold.update({
          where: { id: hold.id },
          data: { status: 'RELEASED', releasedAt: now },
        });

        const wallet = await tx.vendorWallet.update({
          where: { vendorId: hold.vendorId },
          data: {
            pendingBalance:   { decrement: hold.netAmount },
            availableBalance: { increment: hold.netAmount },
          },
        });

        await writeLedgerEntry(tx, {
          vendorId:      hold.vendorId,
          type:          'CREDIT',
          amount:        hold.netAmount,
          balanceAfter:  wallet.availableBalance,
          referenceId:   hold.orderId,
          referenceType: 'ESCROW',
          description:   `Escrow released for order ${hold.orderId}`,
        });
      });

      released++;
      logger.info({ msg: 'Escrow released', escrowId: hold.id, vendorId: hold.vendorId, netAmount: hold.netAmount });
    } catch (err) {
      logger.error({ msg: 'Failed to release escrow hold', escrowId: hold.id, err });
    }
  }

  return released;
}

// ─── Get vendor wallet ───────────────────────────────────────────────────────

export async function getVendorWallet(vendorId) {
  const wallet = await prisma.vendorWallet.findUnique({ where: { vendorId } });
  if (!wallet) throw new NotFoundError('VendorWallet');
  return wallet;
}

// ─── Get ledger entries (paginated) ─────────────────────────────────────────

export async function getLedgerEntries({ vendorId, from, to, type, page, limit }) {
  const where = {
    vendorId,
    ...(type && { type }),
    ...(from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      },
    },
  };

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  (page - 1) * limit,
      take:  limit,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return { entries, total, page, limit, pages: Math.ceil(total / limit) };
}
