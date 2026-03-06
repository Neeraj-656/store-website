import Razorpay from 'razorpay';
import crypto from 'crypto';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

class RazorpayProvider {
  constructor() {
    this.client = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }

  /**
   * STEP 1 — Create a Razorpay Order.
   *
   * Razorpay's server-to-server flow:
   *   1. Backend creates an Order → gets razorpay_order_id
   *   2. Frontend uses razorpay_order_id + key_id to open the Razorpay checkout widget
   *   3. Customer pays → Razorpay sends payment.captured webhook
   *   4. Backend verifies signature and marks payment SUCCESS
   *
   * @param {{ idempotencyKey, amount, currency, orderId, userId }} input
   * @returns {{ razorpayOrderId, status, providerResponse, failureReason }}
   */
  async createOrder({ idempotencyKey, amount, currency = 'INR', orderId, userId }) {
    try {
      const order = await this.client.orders.create({
        amount,                          // paise
        currency: currency.toUpperCase(),
        receipt: orderId.slice(0, 40),   // max 40 chars
        notes: {
          orderId,
          userId,
          idempotencyKey,
        },
      });

      logger.debug({ msg: 'Razorpay order created', razorpayOrderId: order.id });

      return {
        razorpayOrderId: order.id,
        status: 'processing',            // waiting for frontend + webhook
        providerResponse: order,
        failureReason: null,
      };
    } catch (err) {
      logger.error({ msg: 'Razorpay createOrder failed', err });
      return {
        razorpayOrderId: null,
        status: 'failed',
        providerResponse: {},
        failureReason: err.message,
      };
    }
  }

  /**
   * STEP 2 — Verify payment signature (called after the frontend completes payment).
   *
   * Razorpay docs: HMAC-SHA256 of "razorpay_order_id|razorpay_payment_id"
   * signed with key_secret.
   *
   * @param {{ razorpayOrderId, razorpayPaymentId, razorpaySignature }} input
   * @returns {boolean}
   */
  verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expected = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(body)
      .digest('hex');
    return expected === razorpaySignature;
  }

  /**
   * Fetch full payment details from Razorpay.
   *
   * @param {string} razorpayPaymentId
   */
  async fetchPayment(razorpayPaymentId) {
    return this.client.payments.fetch(razorpayPaymentId);
  }

  /**
   * Issue a refund.
   *
   * @param {{ razorpayPaymentId, amount?, reason? }} input
   * @returns {{ razorpayRefundId, status, providerResponse, failureReason }}
   */
  async refund({ razorpayPaymentId, amount, reason }) {
    try {
      const refund = await this.client.payments.refund(razorpayPaymentId, {
        ...(amount ? { amount } : {}),
        notes: { reason: reason ?? 'customer_request' },
      });

      logger.debug({ msg: 'Razorpay refund created', razorpayRefundId: refund.id });

      const status = refund.status === 'processed' ? 'success' : 'processing';

      return {
        razorpayRefundId: refund.id,
        status,
        providerResponse: refund,
        failureReason: null,
      };
    } catch (err) {
      logger.error({ msg: 'Razorpay refund failed', err });
      return {
        razorpayRefundId: null,
        status: 'failed',
        providerResponse: {},
        failureReason: err.message,
      };
    }
  }

  /**
   * Verify Razorpay webhook signature.
   * HMAC-SHA256 of raw body using webhookSecret.
   *
   * @param {Buffer} rawBody
   * @param {string} signature  — value of x-razorpay-signature header
   * @returns {{ valid, eventType, razorpayOrderId, razorpayPaymentId, payload }}
   */
  verifyWebhook(rawBody, signature) {
    try {
      const expected = crypto
        .createHmac('sha256', config.razorpay.webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expected !== signature) {
        logger.warn({ msg: 'Razorpay webhook signature mismatch' });
        return { valid: false };
      }

      const body = JSON.parse(rawBody.toString());
      const { event, payload } = body;

      let razorpayOrderId = null;
      let razorpayPaymentId = null;
      let razorpayRefundId = null;

      if (payload?.payment?.entity) {
        razorpayPaymentId = payload.payment.entity.id;
        razorpayOrderId = payload.payment.entity.order_id;
      }
      if (payload?.refund?.entity) {
        razorpayRefundId = payload.refund.entity.id;
        razorpayPaymentId = payload.refund.entity.payment_id;
      }

      return {
        valid: true,
        eventType: event,
        razorpayOrderId,
        razorpayPaymentId,
        razorpayRefundId,
        payload,
      };
    } catch (err) {
      logger.warn({ msg: 'Razorpay webhook parse error', err });
      return { valid: false };
    }
  }
}

export default RazorpayProvider;