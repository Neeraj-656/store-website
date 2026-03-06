import { z } from 'zod';

export const requestPayoutSchema = z.object({
  amount:        z.number().int().positive('Amount must be a positive integer in paise'),
  bankAccountId: z.string().uuid('bankAccountId must be a valid UUID'),
  ifscCode:      z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code'),
  accountNumber: z.string().min(8).max(18),
});

export const createCommissionRuleSchema = z.object({
  vendorId:        z.string().uuid().optional().nullable(),
  commissionRate:  z.number().min(0).max(1),
  paymentFeeRate:  z.number().min(0).max(1),
  settlementCycle: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'MANUAL']).default('WEEKLY'),
});

export const ledgerQuerySchema = z.object({
  vendorId: z.string().uuid(),
  from:     z.string().datetime().optional(),
  to:       z.string().datetime().optional(),
  type:     z.enum(['CREDIT', 'COMMISSION_FEE', 'PAYMENT_FEE', 'REFUND_DEBIT', 'PAYOUT', 'ADJUSTMENT']).optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});
