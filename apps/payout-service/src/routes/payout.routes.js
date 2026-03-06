import { Router }   from 'express';
import express       from 'express';
import rateLimit     from 'express-rate-limit';
import * as ctrl     from '../controllers/payout.controller.js';
import { authenticate, requireRole, internalOnly } from '../middlewares/auth.middleware.js';
import { validate }  from '../middlewares/validate.middleware.js';
import { requestPayoutSchema, createCommissionRuleSchema } from '../utils/schemas.js';

const router = Router();

const vendorLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const adminLimiter  = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'UP', service: 'payout-service' }));

// ─── Webhook — raw body ───────────────────────────────────────────────────────
// POST /api/v1/payouts/webhooks/razorpayx
router.post(
  '/webhooks/razorpayx',
  express.raw({ type: 'application/json' }),
  ctrl.razorpayXWebhook,
);

// ─── Vendor: wallet balance ───────────────────────────────────────────────────
// GET /api/v1/payouts/wallet
router.get('/wallet', vendorLimiter, authenticate, requireRole('vendor', 'admin'), ctrl.getWallet);

// ─── Vendor: ledger history ───────────────────────────────────────────────────
// GET /api/v1/payouts/ledger
router.get('/ledger', vendorLimiter, authenticate, requireRole('vendor', 'admin'), ctrl.getLedger);

// ─── Vendor: request payout ───────────────────────────────────────────────────
// POST /api/v1/payouts/request
router.post(
  '/request',
  vendorLimiter,
  authenticate,
  requireRole('vendor'),
  validate(requestPayoutSchema),
  ctrl.requestPayout,
);

// ─── Vendor: list own payouts ─────────────────────────────────────────────────
// GET /api/v1/payouts
router.get('/', vendorLimiter, authenticate, requireRole('vendor', 'admin'), ctrl.listPayouts);

// ─── Vendor/Admin: get payout by ID ──────────────────────────────────────────
// GET /api/v1/payouts/:id
router.get('/:id', vendorLimiter, authenticate, requireRole('vendor', 'admin'), ctrl.getPayoutById);

// ─── ADMIN: commission rules ──────────────────────────────────────────────────
// GET    /api/v1/payouts/admin/commission-rules
// POST   /api/v1/payouts/admin/commission-rules
// DELETE /api/v1/payouts/admin/commission-rules/:id
router.get('/admin/commission-rules',           adminLimiter, authenticate, requireRole('admin'), ctrl.listRules);
router.post('/admin/commission-rules',          adminLimiter, authenticate, requireRole('admin'), validate(createCommissionRuleSchema), ctrl.createOrUpdateRule);
router.delete('/admin/commission-rules/:id',    adminLimiter, authenticate, requireRole('admin'), ctrl.deactivateRule);

// ─── ADMIN: wallet for any vendor ────────────────────────────────────────────
// GET /api/v1/payouts/admin/vendors/:vendorId/wallet
router.get('/admin/vendors/:vendorId/wallet',   adminLimiter, authenticate, requireRole('admin'), ctrl.getWallet);
router.get('/admin/vendors/:vendorId/ledger',   adminLimiter, authenticate, requireRole('admin'), ctrl.getLedger);
router.get('/admin/vendors/:vendorId/payouts',  adminLimiter, authenticate, requireRole('admin'), ctrl.listPayouts);

// ─── INTERNAL: trigger escrow release ────────────────────────────────────────
// POST /api/v1/payouts/internal/release-escrow
router.post('/internal/release-escrow', internalOnly, ctrl.releaseEscrow);

export default router;
