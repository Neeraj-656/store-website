import { z } from 'zod';

export const createReviewSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  orderId: z.string().uuid('orderId must be a valid UUID'),
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  title: z.string().max(120, 'Title cannot exceed 120 characters').optional(),
  body: z.string().max(5000, 'Body cannot exceed 5000 characters').optional(),
});

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(5000).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided to update' },
);

export const listReviewsSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest', 'helpful']).optional().default('newest'),
});

export const voteSchema = z.object({
  helpful: z.boolean(),
});

// Used internally when receiving delivered order events from RabbitMQ
export const deliveredOrderEventSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  productIds: z.array(z.string()).min(1),
  deliveredAt: z.string().datetime(),
});