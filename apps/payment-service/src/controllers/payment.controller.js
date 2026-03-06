import * as paymentService from '../services/payment.service.js';
import logger from '../utils/logger.js';

// Strip raw providerResponse from non-admin API responses
function sanitize(payment) {
  if (!payment) return payment;
  const { providerResponse, ...safe } = payment;
  return safe;
}

// ─── INTERNAL: Initiate Payment ───────────────────────────────────────────────
// Called by Order Service to create a Razorpay Order.
// Returns razorpayOrderId so the frontend can open the checkout widget.

export async function initiatePayment(req, res, next) {
  try {
    const { orderId, userId, amount, currency, idempotencyKey } = req.body;
    const payment = await paymentService.initiatePayment({ orderId, userId, amount, currency, idempotencyKey });

    logger.info({ msg: 'Payment initiated', paymentId: payment.id, requestId: req.requestId });
    return res.status(201).json({ success: true, data: sanitize(payment) });
  } catch (err) {
    next(err);
  }
}

// ─── Verify Payment ───────────────────────────────────────────────────────────
// Called by the frontend after the Razorpay checkout widget completes.
// Verifies the HMAC signature and marks the payment SUCCESS.

export async function verifyPayment(req, res, next) {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const payment = await paymentService.verifyPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature });

    logger.info({ msg: 'Payment verified', paymentId: payment.id, requestId: req.requestId });
    return res.json({ success: true, data: sanitize(payment) });
  } catch (err) {
    next(err);
  }
}

// ─── Get Payment by ID ────────────────────────────────────────────────────────

export async function getPayment(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.role === 'admin' ? undefined : req.user.id;
    const payment = await paymentService.getPaymentById(id, userId);

    return res.json({ success: true, data: sanitize(payment) });
  } catch (err) {
    next(err);
  }
}

// ─── INTERNAL: Get Payment by Order ID ───────────────────────────────────────

export async function getPaymentByOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const payment = await paymentService.getPaymentByOrderId(orderId);

    return res.json({ success: true, data: sanitize(payment) });
  } catch (err) {
    next(err);
  }
}

// ─── Request Refund ───────────────────────────────────────────────────────────

export async function requestRefund(req, res, next) {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;
    const requestedBy = req.user.id;

    const result = await paymentService.requestRefund({ paymentId, amount, reason, requestedBy });

    logger.info({ msg: 'Refund processed', refundId: result.refund.id, paymentId, requestId: req.requestId });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Razorpay Webhook ─────────────────────────────────────────────────────────
// express.raw() is applied on this route so req.body is a raw Buffer.

export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    await paymentService.handleWebhook(req.body, signature);
    return res.json({ received: true });
  } catch (err) {
    next(err);
  }
}