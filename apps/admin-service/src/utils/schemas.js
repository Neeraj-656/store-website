import { z } from 'zod';

// ─── Vendor Moderation ───────────────────────────────────────────────────────

export const vendorActionSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});

export const approveKycSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const rejectKycSchema = z.object({
  reason: z.string().min(10).max(1000),
});

export const reviewDocumentSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  note:   z.string().max(500).optional(),
});

export const blacklistIdentifierSchema = z.object({
  type:   z.enum(['PAN', 'GSTIN', 'BANK_ACCOUNT']),
  value:  z.string().min(1).max(30),
  reason: z.string().min(10).max(500),
});

// ─── Product Moderation ──────────────────────────────────────────────────────

export const suspendProductSchema = z.object({
  reason:          z.string().min(10).max(1000),
  expectedVersion: z.number().int().positive(),
  vendorId:        z.string().uuid(),
});

export const restoreProductSchema = z.object({
  reason:          z.string().min(10).max(500),
  expectedVersion: z.number().int().positive(),
  vendorId:        z.string().uuid(),
  targetStatus:    z.enum(['ACTIVE', 'DRAFT']).default('ACTIVE'),
});

// ─── Order Override ──────────────────────────────────────────────────────────

export const orderOverrideSchema = z.object({
  type:   z.enum(['FORCE_CANCEL', 'FORCE_REFUND', 'STATUS_CORRECTION']),
  reason: z.string().min(10).max(1000),
  targetStatus: z.string().optional(), // for STATUS_CORRECTION
  caseId: z.string().uuid().optional(),
});

// ─── Moderation Case ─────────────────────────────────────────────────────────

export const createCaseSchema = z.object({
  entityType:  z.enum(['VENDOR', 'PRODUCT', 'ORDER', 'REVIEW', 'PAYOUT']),
  entityId:    z.string().uuid(),
  category:    z.enum([
    'FRAUD_REPORT', 'POLICY_VIOLATION', 'COUNTERFEIT_LISTING',
    'MISLEADING_DESCRIPTION', 'PROHIBITED_ITEM', 'PAYMENT_DISPUTE',
    'REVIEW_MANIPULATION', 'VENDOR_COMPLAINT', 'OTHER',
  ]),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title:       z.string().min(5).max(200),
  description: z.string().min(20).max(5000),
  reportedBy:  z.string().uuid().optional(),
});

export const assignCaseSchema = z.object({
  adminId: z.string().uuid(),
});

export const resolveCaseSchema = z.object({
  resolution: z.string().min(10).max(2000),
});

export const addCaseNoteSchema = z.object({
  body:       z.string().min(1).max(5000),
  isInternal: z.boolean().default(true),
});

// ─── Admin User Management ───────────────────────────────────────────────────

export const createAdminSchema = z.object({
  userId: z.string().uuid(),
  email:  z.string().email(),
  name:   z.string().min(2).max(100),
  role:   z.enum(['SUPER_ADMIN', 'MODERATOR', 'FINANCE_ADMIN', 'SUPPORT']),
});

export const updateAdminRoleSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'MODERATOR', 'FINANCE_ADMIN', 'SUPPORT']),
});

// ─── Reporting & Dashboard ────────────────────────────────────────────────────

export const reportQuerySchema = z.object({
  from:  z.string().datetime().optional(),
  to:    z.string().datetime().optional(),
  page:  z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
