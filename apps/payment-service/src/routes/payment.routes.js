import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/payment.controller.js';
import { authenticate, requireRole, internalOnly } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { initiatePaymentSchema, refundSchema, verifyPaymentSchema } from '../utils/schemas.js';

const router = Router();

const userLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'UP' }));

// ─── Webhook — raw body required, register BEFORE express.json routes ─────────
// POST /api/v1/payments/webhooks/razorpay
router.post(
  '/webhooks/razorpay',
  express.raw({ type: 'application/json' }),
  ctrl.razorpayWebhook,
);

// ─── INTERNAL: Initiate Payment ───────────────────────────────────────────────
// POST /api/v1/payments/internal/initiate
router.post(
  '/internal/initiate',
  internalOnly,
  validate(initiatePaymentSchema),
  ctrl.initiatePayment,
);

// ─── INTERNAL: Get Payment by Order ID ────────────────────────────────────────
// GET /api/v1/payments/internal/order/:orderId
router.get(
  '/internal/order/:orderId',
  internalOnly,
  ctrl.getPaymentByOrder,
);

// ─── Verify Payment (frontend calls after Razorpay checkout) ─────────────────
// POST /api/v1/payments/verify
router.post(
  '/verify',
  userLimiter,
  authenticate,
  validate(verifyPaymentSchema),
  ctrl.verifyPayment,
);

// ─── Get Payment by ID ────────────────────────────────────────────────────────
// GET /api/v1/payments/:id
router.get(
  '/:id',
  userLimiter,
  authenticate,
  ctrl.getPayment,
);

// ─── Request Refund ───────────────────────────────────────────────────────────
// POST /api/v1/payments/:paymentId/refund
router.post(
  '/:paymentId/refund',
  userLimiter,
  authenticate,
  requireRole('user', 'admin'),
  validate(refundSchema),
  ctrl.requestRefund,
);

export default router;
