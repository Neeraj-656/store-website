import { z } from 'zod';

// ─── Indian Compliance Format Validators ─────────────────────────────────
//
// PAN format: 5 letters + 4 digits + 1 letter  e.g. ABCDE1234F
// Business PAN: same format — differs only in the 4th character (which is P for personal)
// GSTIN: 15-character alphanumeric  e.g. 22AAAAA0000A1Z5

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function isValidPan(pan) {
  return PAN_REGEX.test(pan?.toUpperCase());
}

export function isValidGstin(gstin) {
  return GSTIN_REGEX.test(gstin?.toUpperCase());
}

export function isValidIfsc(ifsc) {
  return IFSC_REGEX.test(ifsc?.toUpperCase());
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────

export const registerVendorSchema = z.object({
  businessName: z.string().min(2).max(200),
  businessType: z.enum(['SOLE_PROPRIETOR', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'LLP']),
  businessEmail: z.string().email(),
});

export const submitKycSchema = z.object({
  pan: z.string()
    .transform((v) => v.toUpperCase())
    .refine(isValidPan, { message: 'Invalid PAN format. Expected: ABCDE1234F' }),

  businessPan: z.string()
    .transform((v) => v.toUpperCase())
    .refine(isValidPan, { message: 'Invalid Business PAN format' })
    .optional(),

  gstin: z.string()
    .transform((v) => v.toUpperCase())
    .refine(isValidGstin, { message: 'Invalid GSTIN format. Expected: 22AAAAA0000A1Z5' }),

  bankDetails: z.object({
    accountNumber: z.string().min(9).max(18).regex(/^\d+$/, 'Account number must be numeric'),
    ifsc: z.string()
      .transform((v) => v.toUpperCase())
      .refine(isValidIfsc, { message: 'Invalid IFSC code. Expected: ABCD0123456' }),
    accountName: z.string().min(2).max(100),
    bankName: z.string().min(2).max(100),
  }),
});

export const approveKycSchema = z.object({
  note: z.string().max(500).optional(),
});

export const rejectKycSchema = z.object({
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters').max(500),
});

export const suspendVendorSchema = z.object({
  reason: z.string().min(10).max(500),
});

export const blacklistSchema = z.object({
  reason: z.string().min(10).max(500),
});

export const documentReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(500).optional(),
});

export const addBlacklistSchema = z.object({
  type: z.enum(['PAN', 'GSTIN', 'BANK_ACCOUNT']),
  value: z.string().min(1),
  reason: z.string().min(5).max(500),
});
