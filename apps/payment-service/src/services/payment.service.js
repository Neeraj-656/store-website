import prisma from '../../prisma/client.js';
import RazorpayProvider from './providers/razorpay.provider.js';
import { enqueueOutboxEvent, recordStatusHistory } from './payment.helpers.js';
import logger from '../utils/logger.js';
import { AppError, ConflictError, NotFoundError } from '../utils/errors.js';

// Singleton provider instance
const razorpay = new RazorpayProvider();

// ─── Initiate Payment ─────────────────────────────────────────────────────────
//
// Called by the Order Service (internal endpoint).
// Creates a Razorpay Order and returns razorpayOrderId to the client so the
// frontend can open the Razorpay checkout widget.

export async function initiatePayment({ orderId, userId, amount, currency = 'INR', idempotencyKey }) {
  const iKey = idempotencyKey ?? `pay_${orderId}_${userId}`;

  // ── Idempotency guard ──────────────────────────────────────────────────────
  const existing = await prisma.payment.findUnique({ where: { idempotencyKey: iKey } });
  if (existing) {
    logger.warn({ msg: 'Duplicate initiate — returning existing record', orderId });
    return existing;
  }

  // ── One payment per order ──────────────────────────────────────────────────
  const orderPayment = await prisma.payment.findUnique({ where: { orderId } });
  if (orderPayment) {
    throw new ConflictError(`Payment for order ${orderId} already exists`);
  }

  // ── Create INITIATED record first ──────────────────────────────────────────
  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: { orderId, userId, amount, currency, idempotencyKey: iKey, status: 'INITIATED' },
    });
    await recordStatusHistory(tx, p.id, null, 'INITIATED', 'Payment initiated');
    return p;
  });

  // ── Call Razorpay to create an Order ──────────────────────────────────────
  const result = await razorpay.createOrder({ idempotencyKey: iKey, amount, currency, orderId, userId });

  const newStatus = result.status === 'processing' ? 'PROCESSING' : 'FAILED';

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        razorpayOrderId: result.razorpayOrderId ?? null,
        providerResponse: result.providerResponse,
        failureReason: result.failureReason,
      },
    });

    await recordStatusHistory(tx, p.id, 'INITIATED', newStatus, result.failureReason);

    if (newStatus === 'FAILED') {
      await enqueueOutboxEvent(tx, p.id, 'payment.failed', {
        paymentId: p.id,
        orderId: p.orderId,
        userId: p.userId,
        reason: result.failureReason ?? 'Razorpay order creation failed',
      });
    }

    return p;
  });

  logger.info({ msg: 'Payment initiated', paymentId: updated.id, status: updated.status });
  return updated;
}

// ─── Verify Payment (called after frontend completes checkout) ────────────────
//
// The frontend sends razorpayOrderId + razorpayPaymentId + razorpaySignature.
// We verify the HMAC signature and mark the payment SUCCESS.

export async function verifyPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
  if (!payment) throw new NotFoundError('Payment');

  if (payment.status === 'SUCCESS') {
    logger.warn({ msg: 'verifyPayment called on already-SUCCESS payment', paymentId: payment.id });
    return payment;
  }

  // ── Verify HMAC signature ─────────────────────────────────────────────────
  const valid = razorpay.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

  if (!valid) {
    throw new AppError(400, 'Invalid payment signature', 'INVALID_SIGNATURE');
  }

  // ── Fetch full payment details from Razorpay ──────────────────────────────
  const rzpPayment = await razorpay.fetchPayment(razorpayPaymentId);

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        razorpayPaymentId,
        providerResponse: rzpPayment,
      },
    });

    await recordStatusHistory(tx, p.id, payment.status, 'SUCCESS', 'Signature verified');

    await enqueueOutboxEvent(tx, p.id, 'payment.success', {
      paymentId: p.id,
      orderId: p.orderId,
      userId: p.userId,
      amount: p.amount,
      currency: p.currency,
      razorpayOrderId,
      razorpayPaymentId,
    });

    return p;
  });

  logger.info({ msg: 'Payment verified and marked SUCCESS', paymentId: updated.id });
  return updated;
}

// ─── Get Payment by ID ────────────────────────────────────────────────────────

export async function getPaymentById(id, userId) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      refunds: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!payment) throw new NotFoundError('Payment');
  if (userId && payment.userId !== userId) {
    throw new AppError(403, 'You do not have access to this payment', 'FORBIDDEN');
  }

  return payment;
}

// ─── Get Payment by Order ID ──────────────────────────────────────────────────

export async function getPaymentByOrderId(orderId) {
  const payment = await prisma.payment.findUnique({
    where: { orderId },
    include: {
      refunds: true,
      statusHistory: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!payment) throw new NotFoundError('Payment');
  return payment;
}

// ─── Request Refund ───────────────────────────────────────────────────────────

export async function requestRefund({ paymentId, amount, reason, requestedBy }) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { refunds: true },
  });

  if (!payment) throw new NotFoundError('Payment');

  if (!['SUCCESS', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
    throw new ConflictError(`Cannot refund a payment in status: ${payment.status}`);
  }

  if (!payment.razorpayPaymentId) {
    throw new ConflictError('No razorpayPaymentId on record — payment may not be confirmed yet');
  }

  // ── Calculate refundable balance ──────────────────────────────────────────
  const alreadyRefunded = payment.refunds
    .filter((r) => r.status !== 'FAILED')
    .reduce((sum, r) => sum + r.amount, 0);

  const refundableBalance = payment.amount - alreadyRefunded;
  const refundAmount = amount ?? refundableBalance;

  if (refundAmount <= 0) throw new ConflictError('Nothing left to refund');
  if (refundAmount > refundableBalance) {
    throw new ConflictError(`Refund amount ₹${refundAmount / 100} exceeds refundable balance ₹${refundableBalance / 100}`);
  }

  const isFullRefund = refundAmount === refundableBalance && alreadyRefunded === 0;
  const refundType = isFullRefund ? 'FULL' : 'PARTIAL';
  const idempotencyKey = `refund_${paymentId}_${requestedBy}_${Date.now()}`;

  // ── Create PENDING refund record ──────────────────────────────────────────
  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id,
      type: refundType,
      amount: refundAmount,
      reason: reason ?? null,
      idempotencyKey,
      status: 'PENDING',
    },
  });

  // ── Call Razorpay ─────────────────────────────────────────────────────────
  const result = await razorpay.refund({
    razorpayPaymentId: payment.razorpayPaymentId,
    amount: refundAmount,
    reason,
  });

  const refundStatus =
    result.status === 'success' ? 'SUCCESS' :
    result.status === 'processing' ? 'PROCESSING' :
    'FAILED';

  // ── Persist result atomically ─────────────────────────────────────────────
  const [updatedRefund, updatedPayment] = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.update({
      where: { id: refund.id },
      data: {
        status: refundStatus,
        razorpayRefundId: result.razorpayRefundId ?? null,
        providerResponse: result.providerResponse,
        failureReason: result.failureReason,
      },
    });

    const totalRefunded = alreadyRefunded + (refundStatus !== 'FAILED' ? refundAmount : 0);
    let newPaymentStatus = payment.status;

    if (refundStatus !== 'FAILED') {
      newPaymentStatus = totalRefunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }

    const p = await tx.payment.update({
      where: { id: payment.id },
      data: { status: newPaymentStatus },
    });

    await recordStatusHistory(tx, p.id, payment.status, newPaymentStatus, reason);

    if (refundStatus !== 'FAILED') {
      await enqueueOutboxEvent(tx, p.id, 'payment.refunded', {
        paymentId: p.id,
        refundId: r.id,
        orderId: p.orderId,
        userId: p.userId,
        amount: refundAmount,
        currency: p.currency,
        type: refundType,
        razorpayRefundId: result.razorpayRefundId,
      });
    }

    return [r, p];
  });

  logger.info({ msg: 'Refund processed', refundId: updatedRefund.id, status: refundStatus });
  return { refund: updatedRefund, payment: updatedPayment };
}

// ─── Handle Razorpay Webhook ──────────────────────────────────────────────────

export async function handleWebhook(rawBody, signature) {
  const result = razorpay.verifyWebhook(rawBody, signature);

  if (!result.valid) {
    throw new AppError(400, 'Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  const { eventType, razorpayOrderId, razorpayPaymentId, payload } = result;

  logger.info({ msg: 'Webhook received', eventType, razorpayOrderId, razorpayPaymentId });

  // ── payment.captured → SUCCESS ────────────────────────────────────────────
  if (eventType === 'payment.captured') {
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment) {
      logger.warn({ msg: 'Webhook: no payment found for order', razorpayOrderId });
      return;
    }
    if (payment.status === 'SUCCESS') return; // already handled via verify endpoint

    await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          razorpayPaymentId: razorpayPaymentId ?? payment.razorpayPaymentId,
          providerResponse: payload?.payment?.entity ?? payload,
        },
      });
      await recordStatusHistory(tx, p.id, payment.status, 'SUCCESS', 'Webhook: payment.captured');
      await enqueueOutboxEvent(tx, p.id, 'payment.success', {
        paymentId: p.id,
        orderId: p.orderId,
        userId: p.userId,
        amount: p.amount,
        currency: p.currency,
        razorpayOrderId,
        razorpayPaymentId,
      });
    });
  }

  // ── payment.failed → FAILED ───────────────────────────────────────────────
  else if (eventType === 'payment.failed') {
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    if (!payment || ['FAILED', 'CANCELLED'].includes(payment.status)) return;

    await prisma.$transaction(async (tx) => {
      const errorDesc = payload?.payment?.entity?.error_description ?? 'Payment failed';
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: errorDesc,
          providerResponse: payload?.payment?.entity ?? payload,
        },
      });
      await recordStatusHistory(tx, p.id, payment.status, 'FAILED', errorDesc);
      await enqueueOutboxEvent(tx, p.id, 'payment.failed', {
        paymentId: p.id,
        orderId: p.orderId,
        userId: p.userId,
        reason: errorDesc,
      });
    });
  }

  // ── refund.processed → update refund status ───────────────────────────────
  else if (eventType === 'refund.processed' || eventType === 'refund.speed_changed') {
    const razorpayRefundId = result.razorpayRefundId;
    if (!razorpayRefundId) return;

    const refund = await prisma.refund.findUnique({ where: { razorpayRefundId } });
    if (refund && refund.status !== 'SUCCESS') {
      await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'SUCCESS', providerResponse: payload?.refund?.entity ?? payload },
      });
      logger.info({ msg: 'Refund marked SUCCESS via webhook', razorpayRefundId });
    }
  }

  else {
    logger.debug({ msg: 'Webhook event not handled', eventType });
  }
}