/**
 * auth.routes.js
 *
 * Route definitions for the Auth Service.
 *
 * Public routes   — no auth required (login, signup, forgot-password, public-key)
 * Protected routes— require valid JWT + denylist check (/me, /logout, /verify-*)
 * Internal routes — require x-internal-service-token (account suspension)
 */

import { Router } from 'express';
import * as ctrl  from '../controllers/auth.controller.js';
import {
  authenticate,
  checkDenylist,
  internalOnly,
}                 from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  authLimit,
  strictLimit,
  otpLimit,
}                   from '../middlewares/rate-limit.middleware.js';
import {
  registerCustomerSchema,
  registerVendorSchema,
  registerAdminSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyPhoneSchema,
  sendPhoneOtpSchema,
  changePasswordSchema,
}                   from '../utils/schemas.js';
import { z }        from 'zod';

const router = Router();

// Shorthand: authenticated + denylist-checked
const auth = [authenticate, checkDenylist];

// ─── Health ───────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'UP', service: 'auth-service' }));

// ─── Public key ───────────────────────────────────────────────────────────────
// Downstream services can fetch the RS256 public key at startup to verify tokens.
// GET /api/v1/auth/public-key
router.get('/public-key', ctrl.getPublicKey);

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRATION
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/register/customer
router.post(
  '/register/customer',
  authLimit,
  validate(registerCustomerSchema),
  ctrl.registerCustomer,
);

// POST /api/v1/auth/register/vendor
router.post(
  '/register/vendor',
  authLimit,
  validate(registerVendorSchema),
  ctrl.registerVendor,
);

// POST /api/v1/auth/register/admin
// Requires internal service token — admin accounts are created programmatically,
// not through the public API.
router.post(
  '/register/admin',
  internalOnly,
  validate(registerAdminSchema),
  ctrl.registerAdmin,
);

// ═════════════════════════════════════════════════════════════════════════════
// LOGIN + TOKENS
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/login
router.post(
  '/login',
  authLimit,
  validate(loginSchema),
  ctrl.login,
);

// POST /api/v1/auth/refresh
// Rotate refresh token → get new access + refresh token pair
router.post(
  '/refresh',
  authLimit,
  validate(refreshSchema),
  ctrl.refresh,
);

// ═════════════════════════════════════════════════════════════════════════════
// LOGOUT  (protected)
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/logout
// Revokes current session's refresh token and denylists the access token
router.post(
  '/logout',
  ...auth,
  validate(z.object({ refreshToken: z.string().optional() })),
  ctrl.logout,
);

// POST /api/v1/auth/logout-all
// Revokes ALL sessions for this user (stolen device, password change, etc.)
router.post('/logout-all', ...auth, ctrl.logoutAll);

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE  (protected)
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/v1/auth/me
router.get('/me', ...auth, ctrl.getMe);

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL VERIFICATION  (protected)
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/verify-email
router.post(
  '/verify-email',
  otpLimit,
  ...auth,
  validate(verifyEmailSchema),
  ctrl.verifyEmail,
);

// POST /api/v1/auth/resend-email-verification
router.post(
  '/resend-email-verification',
  strictLimit,
  ...auth,
  ctrl.resendEmailVerification,
);

// ═════════════════════════════════════════════════════════════════════════════
// PHONE VERIFICATION  (protected)
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/send-phone-otp
router.post(
  '/send-phone-otp',
  strictLimit,
  ...auth,
  validate(sendPhoneOtpSchema),
  ctrl.sendPhoneOtp,
);

// POST /api/v1/auth/verify-phone
router.post(
  '/verify-phone',
  otpLimit,
  ...auth,
  validate(verifyPhoneSchema),
  ctrl.verifyPhone,
);

// ═════════════════════════════════════════════════════════════════════════════
// PASSWORD RESET  (public — user is not authenticated)
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/forgot-password
router.post(
  '/forgot-password',
  strictLimit,
  validate(forgotPasswordSchema),
  ctrl.forgotPassword,
);

// POST /api/v1/auth/reset-password
router.post(
  '/reset-password',
  otpLimit,
  validate(resetPasswordSchema),
  ctrl.resetPassword,
);

// ═════════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD  (protected — user IS authenticated)
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/change-password
router.post(
  '/change-password',
  strictLimit,
  ...auth,
  validate(changePasswordSchema),
  ctrl.changePassword,
);

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL — called by Admin Service
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/v1/auth/internal/:userId/suspend
router.post(
  '/internal/:userId/suspend',
  internalOnly,
  validate(z.object({ reason: z.string().min(5) })),
  ctrl.suspendAccount,
);

// POST /api/v1/auth/internal/:userId/unsuspend
router.post('/internal/:userId/unsuspend', internalOnly, ctrl.unsuspendAccount);

export default router;
