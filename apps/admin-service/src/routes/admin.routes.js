/**
 * admin.routes.js
 *
 * Full admin API surface. Every route requires:
 *   1. authenticate()   — valid JWT
 *   2. requireAdmin()   — role === 'admin' in JWT
 *   3. attachAdminUser()— active AdminUser record in this DB
 *
 * Sensitive actions (suspend, blacklist, override) additionally require
 * requireAdminRole() for fine-grained role enforcement.
 */

import { Router }    from 'express';
import rateLimit     from 'express-rate-limit';
import * as ctrl     from '../controllers/admin.controller.js';
import {
  authenticate,
  requireAdmin,
  attachAdminUser,
  requireAdminRole,
} from '../middlewares/auth.middleware.js';
import { validate }  from '../middlewares/validate.middleware.js';
import {
  approveKycSchema,
  rejectKycSchema,
  vendorActionSchema,
  reviewDocumentSchema,
  blacklistIdentifierSchema,
  suspendProductSchema,
  restoreProductSchema,
  orderOverrideSchema,
  createCaseSchema,
  assignCaseSchema,
  resolveCaseSchema,
  addCaseNoteSchema,
  createAdminSchema,
  updateAdminRoleSchema,
} from '../utils/schemas.js';

const router = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────
const std     = rateLimit({ windowMs: 60_000, max: 60,  standardHeaders: true, legacyHeaders: false });
const strict  = rateLimit({ windowMs: 60_000, max: 10,  standardHeaders: true, legacyHeaders: false });

// ─── Base middleware chain (applied to all admin routes) ─────────────────────
const admin = [authenticate, requireAdmin, attachAdminUser];

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'UP', service: 'admin-service' }));

// ─── Dashboard ────────────────────────────────────────────────────────────────
// GET /api/v1/admin/dashboard
router.get('/dashboard', std, ...admin, ctrl.getDashboard);

// ═════════════════════════════════════════════════════════════════════════════
// VENDOR MODERATION
// ═════════════════════════════════════════════════════════════════════════════

// GET  /api/v1/admin/vendors
router.get('/vendors', std, ...admin, ctrl.listVendors);

// GET  /api/v1/admin/vendors/:vendorId
router.get('/vendors/:vendorId', std, ...admin, ctrl.getVendor);

// POST /api/v1/admin/vendors/:vendorId/review/start
router.post('/vendors/:vendorId/review/start',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  ctrl.startVendorReview,
);

// POST /api/v1/admin/vendors/:vendorId/review/approve
router.post('/vendors/:vendorId/review/approve',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(approveKycSchema),
  ctrl.approveVendorKyc,
);

// POST /api/v1/admin/vendors/:vendorId/review/reject
router.post('/vendors/:vendorId/review/reject',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(rejectKycSchema),
  ctrl.rejectVendorKyc,
);

// POST /api/v1/admin/vendors/:vendorId/suspend
router.post('/vendors/:vendorId/suspend',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(vendorActionSchema),
  ctrl.suspendVendor,
);

// POST /api/v1/admin/vendors/:vendorId/unsuspend
router.post('/vendors/:vendorId/unsuspend',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  ctrl.unsuspendVendor,
);

// POST /api/v1/admin/vendors/:vendorId/blacklist  ← most destructive, SUPER_ADMIN only
router.post('/vendors/:vendorId/blacklist',
  strict, ...admin, requireAdminRole('SUPER_ADMIN'),
  validate(vendorActionSchema),
  ctrl.blacklistVendor,
);

// PATCH /api/v1/admin/vendors/documents/:documentId
router.patch('/vendors/documents/:documentId',
  std, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(reviewDocumentSchema),
  ctrl.reviewDocument,
);

// POST   /api/v1/admin/vendors/blacklist-identifiers
// DELETE /api/v1/admin/vendors/blacklist-identifiers
// GET    /api/v1/admin/vendors/blacklist-identifiers
router.post('/vendors/blacklist-identifiers',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(blacklistIdentifierSchema),
  ctrl.addIdentifierToBlacklist,
);
router.delete('/vendors/blacklist-identifiers',
  strict, ...admin, requireAdminRole('SUPER_ADMIN'),
  ctrl.removeIdentifierFromBlacklist,
);
router.get('/vendors/blacklist-identifiers', std, ...admin, ctrl.listBlacklist);

// ═════════════════════════════════════════════════════════════════════════════
// PRODUCT MODERATION
// ═════════════════════════════════════════════════════════════════════════════

// GET  /api/v1/admin/products/:productId
router.get('/products/:productId', std, ...admin, ctrl.getProduct);

// POST /api/v1/admin/products/:productId/suspend
router.post('/products/:productId/suspend',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(suspendProductSchema),
  ctrl.suspendProduct,
);

// POST /api/v1/admin/products/:productId/restore
router.post('/products/:productId/restore',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(restoreProductSchema),
  ctrl.restoreProduct,
);

// POST /api/v1/admin/products/:productId/archive
router.post('/products/:productId/archive',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(suspendProductSchema),
  ctrl.archiveProduct,
);

// ═════════════════════════════════════════════════════════════════════════════
// ORDER OVERRIDES
// ═════════════════════════════════════════════════════════════════════════════

// GET  /api/v1/admin/orders/overrides
router.get('/orders/overrides', std, ...admin, ctrl.listOrderOverrides);

// POST /api/v1/admin/orders/:orderId/force-cancel
router.post('/orders/:orderId/force-cancel',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'SUPPORT'),
  validate(orderOverrideSchema),
  ctrl.forceCancel,
);

// POST /api/v1/admin/orders/:orderId/force-refund
router.post('/orders/:orderId/force-refund',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
  validate(orderOverrideSchema),
  ctrl.forceRefund,
);

// PATCH /api/v1/admin/orders/:orderId/status
router.patch('/orders/:orderId/status',
  strict, ...admin, requireAdminRole('SUPER_ADMIN'),
  validate(orderOverrideSchema),
  ctrl.overrideOrderStatus,
);

// ═════════════════════════════════════════════════════════════════════════════
// MODERATION CASES
// ═════════════════════════════════════════════════════════════════════════════

// GET  /api/v1/admin/cases
// POST /api/v1/admin/cases
router.get('/cases',  std,    ...admin, ctrl.listCases);
router.post('/cases', strict, ...admin, validate(createCaseSchema), ctrl.createCase);

// GET  /api/v1/admin/cases/:caseId
router.get('/cases/:caseId', std, ...admin, ctrl.getCaseById);

// POST /api/v1/admin/cases/:caseId/assign
router.post('/cases/:caseId/assign',
  strict, ...admin, requireAdminRole('SUPER_ADMIN', 'MODERATOR'),
  validate(assignCaseSchema),
  ctrl.assignCase,
);

// POST /api/v1/admin/cases/:caseId/resolve
router.post('/cases/:caseId/resolve',
  strict, ...admin,
  validate(resolveCaseSchema),
  ctrl.resolveCase,
);

// POST /api/v1/admin/cases/:caseId/dismiss
router.post('/cases/:caseId/dismiss',
  strict, ...admin,
  validate(resolveCaseSchema),
  ctrl.dismissCase,
);

// POST /api/v1/admin/cases/:caseId/notes
router.post('/cases/:caseId/notes',
  std, ...admin,
  validate(addCaseNoteSchema),
  ctrl.addCaseNote,
);

// ═════════════════════════════════════════════════════════════════════════════
// REPORTING
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/v1/admin/reports/vendors
router.get('/reports/vendors', std, ...admin, ctrl.getVendorStats);

// GET /api/v1/admin/reports/products
router.get('/reports/products', std, ...admin, ctrl.getProductStats);

// GET /api/v1/admin/reports/order-overrides
router.get('/reports/order-overrides', std, ...admin,
  requireAdminRole('SUPER_ADMIN', 'FINANCE_ADMIN'),
  ctrl.getOrderOverrideReport,
);

// GET /api/v1/admin/reports/audit
router.get('/reports/audit', std, ...admin, ctrl.getAuditReport);

// GET /api/v1/admin/reports/cases
router.get('/reports/cases', std, ...admin, ctrl.getCaseReport);

// GET /api/v1/admin/audit/:entityType/:entityId
router.get('/audit/:entityType/:entityId', std, ...admin, ctrl.getAuditLogForEntity);

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN USER MANAGEMENT  (SUPER_ADMIN only)
// ═════════════════════════════════════════════════════════════════════════════

// GET  /api/v1/admin/team
// POST /api/v1/admin/team
router.get('/team',  std,    ...admin, requireAdminRole('SUPER_ADMIN'), ctrl.listAdminUsers);
router.post('/team', strict, ...admin, requireAdminRole('SUPER_ADMIN'), validate(createAdminSchema), ctrl.createAdminUser);

// PATCH  /api/v1/admin/team/:adminId/role
// DELETE /api/v1/admin/team/:adminId
router.patch('/team/:adminId/role',
  strict, ...admin, requireAdminRole('SUPER_ADMIN'),
  validate(updateAdminRoleSchema),
  ctrl.updateAdminRole,
);
router.delete('/team/:adminId',
  strict, ...admin, requireAdminRole('SUPER_ADMIN'),
  ctrl.deactivateAdmin,
);

export default router;
