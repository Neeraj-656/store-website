/**
 * razorpayx.provider.js
 *
 * Abstraction over the Razorpay X Payouts API.
 * Razorpay X is separate from the Payment (Razorpay Orders) API.
 * Docs: https://razorpay.com/docs/razorpay-x/payouts/
 *
 * In production, inject a real Razorpay X SDK call.
 * The stub below lets the service run without live credentials.
 */

import crypto from 'crypto';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

class RazorpayXProvider {
  // ── Initiate bank transfer ───────────────────────────────────────────────

  async initiateTransfer({ amount, accountNumber, ifscCode, referenceId }) {
    logger.info({ msg: 'RazorpayX: initiating transfer', amount, referenceId });

    // ── STUB: replace with real SDK call ───────────────────────────────────
    // const Razorpay = (await import('razorpay')).default;
    // const rzpx = new Razorpay({ key_id: config.razorpayX.keyId, key_secret: config.razorpayX.keySecret });
    //
    // const payout = await rzpx.payouts.create({
    //   account_number: '<your_business_account>',
    //   fund_account: { account_type: 'bank_account', bank_account: { name: 'Vendor', ifsc: ifscCode, account_number: accountNumber } },
    //   amount,
    //   currency: 'INR',
    //   mode: 'IMPS',
    //   purpose: 'vendor_settlement',
    //   reference_id: referenceId,
    // });
    //
    // return { status: 'processing', razorpayPayoutId: payout.id, providerResponse: payout };

    // ── STUB response ─────────────────────────────────────────────────────
    return {
      status:           'processing',
      razorpayPayoutId: `pout_stub_${Date.now()}`,
      providerResponse: { stub: true, referenceId },
      failureReason:    null,
    };
  }

  // ── Verify webhook signature ─────────────────────────────────────────────

  verifyWebhook(rawBody, signature) {
    try {
      const secret = config.razorpayX.keySecret;
      const body   = rawBody instanceof Buffer ? rawBody.toString('utf8') : rawBody;
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSig) {
        return { valid: false };
      }

      const payload  = JSON.parse(body);
      const eventType = payload.event;   // e.g. 'payout.processed', 'payout.reversed'
      const entity   = payload.payload?.payout?.entity ?? {};

      return {
        valid:            true,
        eventType,
        razorpayPayoutId: entity.id,
        utr:              entity.utr ?? null,
        payload:          entity,
      };
    } catch (err) {
      logger.error({ msg: 'RazorpayX webhook parse error', err });
      return { valid: false };
    }
  }
}

export const razorpayXProvider = new RazorpayXProvider();
