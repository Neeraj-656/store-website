import { z } from 'zod';

export const initiatePaymentSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  amount: z.number().int().positive(),         // paise  e.g. 50000 = ₹500
  currency: z.string().length(3).optional(),   // default INR
  idempotencyKey: z.string().min(1).max(255).optional(),
});

export const refundSchema = z.object({
  amount: z.number().int().positive().optional(), // omit for full refund
  reason: z.string().max(500).optional(),
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});