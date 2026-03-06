import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as ctrl from '../controllers/vendor.controller.js';
import { authenticate, requireRole, internalOnly } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { upload } from '../middlewares/upload.middleware.js';
import {
  registerVendorSchema,
  submitKycSchema,
  approveKycSchema,
  rejectKycSchema,
  suspendVendorSchema,
  blacklistSchema,
  documentReviewSchema,
  addBlacklistSchema,
} from '../utils/validators.js';
import { z } from 'zod';

const router = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false });

// ─── Health ───────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'UP' }));

// ─── INTERNAL: Check if vendor can sell ───────────────────────────────────
// GET /api/v1/vendors/internal/:vendorId/can-sell
router.get('/internal/:vendorId/can-sell', internalOnly, ctrl.checkVendorCanSell);

// ─── VENDOR: Register profile ─────────────────────────────────────────────
// POST /api/v1/vendors/register
router.post(
  '/register',
  limiter,
  authenticate,
  requireRole('vendor'),
  validate(registerVendorSchema),
  ctrl.registerVendor,
);

// ─── VENDOR: Get own profile ──────────────────────────────────────────────
// GET /api/v1/vendors/me
router.get('/me', limiter, authenticate, requireRole('vendor'), ctrl.getMyProfile);

// ─── VENDOR: Submit KYC ───────────────────────────────────────────────────
// POST /api/v1/vendors/me/kyc
router.post(
  '/me/kyc',
  strictLimiter,
  authenticate,
  requireRole('vendor'),
  validate(submitKycSchema),
  ctrl.submitKyc,
);

// ─── VENDOR: Upload KYC document ──────────────────────────────────────────
// POST /api/v1/vendors/me/documents
router.post(
  '/me/documents',
  strictLimiter,
  authenticate,
  requireRole('vendor'),
  upload.single('file'),
  validate(z.object({ type: z.enum(['PAN_CARD', 'BUSINESS_PAN', 'GST_CERTIFICATE', 'AADHAAR', 'BANK_STATEMENT', 'CANCELLED_CHEQUE', 'INCORPORATION_CERTIFICATE', 'ADDRESS_PROOF']) })),
  ctrl.uploadDocument,
);

// ─── VENDOR: List own documents ───────────────────────────────────────────
// GET /api/v1/vendors/me/documents
router.get('/me/documents', limiter, authenticate, requireRole('vendor'), ctrl.listMyDocuments);

// ─── VENDOR: Get own bank details (masked) ────────────────────────────────
// GET /api/v1/vendors/me/bank-details
router.get('/me/bank-details', limiter, authenticate, requireRole('vendor'), ctrl.getMyBankDetails);

// ─── ADMIN: List vendors ──────────────────────────────────────────────────
// GET /api/v1/vendors/admin
router.get('/admin', limiter, authenticate, requireRole('admin'), ctrl.listVendors);

// ─── ADMIN: Get vendor by ID ──────────────────────────────────────────────
// GET /api/v1/vendors/admin/:vendorId
router.get('/admin/:vendorId', limiter, authenticate, requireRole('admin'), ctrl.getVendorById);

// ─── ADMIN: Start KYC review ──────────────────────────────────────────────
// POST /api/v1/vendors/admin/:vendorId/review/start
router.post('/admin/:vendorId/review/start', limiter, authenticate, requireRole('admin'), ctrl.startReview);

// ─── ADMIN: Approve KYC ──────────────────────────────────────────────────
// POST /api/v1/vendors/admin/:vendorId/review/approve
router.post(
  '/admin/:vendorId/review/approve',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(approveKycSchema),
  ctrl.approveKyc,
);

// ─── ADMIN: Reject KYC ───────────────────────────────────────────────────
// POST /api/v1/vendors/admin/:vendorId/review/reject
router.post(
  '/admin/:vendorId/review/reject',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(rejectKycSchema),
  ctrl.rejectKyc,
);

// ─── ADMIN: Suspend vendor ────────────────────────────────────────────────
// POST /api/v1/vendors/admin/:vendorId/suspend
router.post(
  '/admin/:vendorId/suspend',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(suspendVendorSchema),
  ctrl.suspendVendor,
);

// ─── ADMIN: Unsuspend vendor ──────────────────────────────────────────────
// POST /api/v1/vendors/admin/:vendorId/unsuspend
router.post('/admin/:vendorId/unsuspend', limiter, authenticate, requireRole('admin'), ctrl.unsuspendVendor);

// ─── ADMIN: Blacklist vendor ──────────────────────────────────────────────
// POST /api/v1/vendors/admin/:vendorId/blacklist
router.post(
  '/admin/:vendorId/blacklist',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(blacklistSchema),
  ctrl.blacklistVendor,
);

// ─── ADMIN: Review a document ─────────────────────────────────────────────
// PATCH /api/v1/vendors/admin/documents/:documentId
router.patch(
  '/admin/documents/:documentId',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(documentReviewSchema),
  ctrl.reviewDocument,
);

// ─── ADMIN: Blacklist management ──────────────────────────────────────────
// POST   /api/v1/vendors/admin/blacklist
// DELETE /api/v1/vendors/admin/blacklist
// GET    /api/v1/vendors/admin/blacklist
router.post(
  '/admin/blacklist',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(addBlacklistSchema),
  ctrl.addToBlacklist,
);

router.delete(
  '/admin/blacklist',
  limiter,
  authenticate,
  requireRole('admin'),
  validate(z.object({ type: z.enum(['PAN', 'GSTIN', 'BANK_ACCOUNT']), value: z.string().min(1) })),
  ctrl.removeFromBlacklist,
);

router.get('/admin/blacklist', limiter, authenticate, requireRole('admin'), ctrl.listBlacklist);

export default router;
