/**
 * payout.controller.js
 */

import * as payoutService      from '../services/payout.service.js';
import * as earningsService    from '../services/earnings.service.js';
import * as commissionService  from '../services/commission.service.js';
import logger from '../utils/logger.js';

// ─── Wallet ──────────────────────────────────────────────────────────────────

export async function getWallet(req, res, next) {
  try {
    // Vendor can only see their own; admin can query any
    const vendorId = req.user.role === 'admin'
      ? (req.params.vendorId ?? req.user.vendorId)
      : req.user.vendorId;

    const wallet = await earningsService.getVendorWallet(vendorId);
    return res.json({ success: true, data: wallet });
  } catch (err) { next(err); }
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

export async function getLedger(req, res, next) {
  try {
    const vendorId = req.user.role === 'admin'
      ? (req.params.vendorId ?? req.user.vendorId)
      : req.user.vendorId;

    const { from, to, type, page = 1, limit = 20 } = req.query;
    const result = await earningsService.getLedgerEntries({ vendorId, from, to, type, page: +page, limit: +limit });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

export async function requestPayout(req, res, next) {
  try {
    const vendorId = req.user.vendorId;
    const { amount, bankAccountId, ifscCode, accountNumber } = req.body;

    const payout = await payoutService.requestPayout({ vendorId, amount, bankAccountId, ifscCode, accountNumber });

    logger.info({ msg: 'Payout requested', payoutId: payout.id, requestId: req.requestId });
    return res.status(201).json({ success: true, data: payout });
  } catch (err) { next(err); }
}

export async function getPayoutById(req, res, next) {
  try {
    const vendorId = req.user.role === 'admin' ? undefined : req.user.vendorId;
    const payout = await payoutService.getPayoutById(req.params.id, vendorId);
    return res.json({ success: true, data: payout });
  } catch (err) { next(err); }
}

export async function listPayouts(req, res, next) {
  try {
    const vendorId = req.user.role === 'admin'
      ? (req.params.vendorId ?? req.user.vendorId)
      : req.user.vendorId;

    const { status, page = 1, limit = 20 } = req.query;
    const result = await payoutService.listPayouts({ vendorId, status, page: +page, limit: +limit });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

// ─── Razorpay X Webhook ──────────────────────────────────────────────────────

export async function razorpayXWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    await payoutService.handlePayoutWebhook(req.body, signature);
    return res.json({ received: true });
  } catch (err) { next(err); }
}

// ─── Commission Rules (admin only) ───────────────────────────────────────────

export async function createOrUpdateRule(req, res, next) {
  try {
    const rule = await commissionService.createOrUpdateRule(req.body);
    return res.status(201).json({ success: true, data: rule });
  } catch (err) { next(err); }
}

export async function listRules(req, res, next) {
  try {
    const rules = await commissionService.listRules();
    return res.json({ success: true, data: rules });
  } catch (err) { next(err); }
}

export async function deactivateRule(req, res, next) {
  try {
    const rule = await commissionService.deactivateRule(req.params.id);
    return res.json({ success: true, data: rule });
  } catch (err) { next(err); }
}

// ─── INTERNAL: trigger manual escrow release (admin tooling) ────────────────

export async function releaseEscrow(req, res, next) {
  try {
    const { releaseMaturedEscrowHolds } = await import('../services/earnings.service.js');
    const count = await releaseMaturedEscrowHolds(200);
    return res.json({ success: true, data: { released: count } });
  } catch (err) { next(err); }
}
