import { z } from 'zod';

// ─── Registration ────────────────────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8,  'Password must be at least 8 characters')
  .max(72, 'Password must not exceed 72 characters') // bcrypt limit
  .regex(/[A-Z]/,       'Password must contain at least one uppercase letter')
  .regex(/[a-z]/,       'Password must contain at least one lowercase letter')
  .regex(/[0-9]/,       'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const registerCustomerSchema = z.object({
  email:    z.string().email('Invalid email address').toLowerCase(),
  password: passwordSchema,
  phone:    z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number').optional(),
});

export const registerVendorSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: passwordSchema,
  phone:    z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
});

export const registerAdminSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: passwordSchema,
  phone:    z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
  // Admin registration requires the internal token (checked in middleware, not here)
});

// ─── Authentication ───────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email:    z.string().email().toLowerCase(),
  password: z.string().min(1),
});

// ─── Token Refresh ────────────────────────────────────────────────────────────

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ─── Password Reset ───────────────────────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  email:       z.string().email().toLowerCase(),
  otp:         z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
  newPassword: passwordSchema,
});

// ─── Verification ─────────────────────────────────────────────────────────────

export const verifyEmailSchema = z.object({
  otp: z.string().length(6).regex(/^\d+$/),
});

export const verifyPhoneSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
  otp:   z.string().length(6).regex(/^\d+$/),
});

export const sendPhoneOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
});

// ─── Password Change (authenticated) ─────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     passwordSchema,
});
