import { z } from 'zod';

const baseSku = z.string().trim().min(1);

export const adjustSchema = z.object({
  sku: baseSku,
  increment: z.number().int().refine(n => n !== 0, {
    message: 'Increment cannot be zero'
  }),
  reason: z.enum(['RESTOCK', 'ADJUSTMENT']),
  source: z.string().default('manual-api')
});

export const reserveSchema = z.object({
  eventId: z.string().uuid(),
  sku: baseSku,
  orderId: z.string().uuid('Valid Order ID required'),
  quantity: z.number().int().positive(),
  expiresAt: z.string().datetime().optional()
});

export const orderActionSchema = z.object({
  eventId: z.string().uuid(),
  action: z.enum(['DEDUCT', 'RELEASE']),
  sku: baseSku,
  orderId: z.string().uuid('Valid Order ID required'),
  quantity: z.number().int().positive()
});

export const getSkuSchema = z.object({
  sku: baseSku
});