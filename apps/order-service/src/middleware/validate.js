import { z } from 'zod';

export function validate({ body, params, query } = {}) {
  return (req, res, next) => {
    const errors = [];

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        errors.push(...result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message, in: 'body' })));
      } else {
        req.body = result.data;
      }
    }

    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        errors.push(...result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message, in: 'params' })));
      }
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        errors.push(...result.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message, in: 'query' })));
      } else {
        req.query = result.data;
      }
    }

    if (errors.length > 0) return res.status(400).json({ errors });

    next();
  };
}

const UUIDParam = z.object({
  id: z.string().uuid('Must be a valid UUID'),
});

const CustomerUUIDParam = z.object({
  customerId: z.string().uuid('Must be a valid UUID'),
});

const PaginationQuery = z.object({
  page:  z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const OrderItemSchema = z.object({
  productId: z.string().uuid('productId must be a valid UUID'),
  quantity:  z.number().int().min(1, 'quantity must be at least 1'),
});

const CreateOrderSchema = z.object({
  customerId:     z.string().uuid('customerId must be a valid UUID'),
  idempotencyKey: z.string().uuid('idempotencyKey must be a UUID').optional(),
  items: z
    .array(OrderItemSchema)
    .min(1, 'items must contain at least one product')
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      { message: 'Duplicate productIds are not allowed — adjust the quantity instead' }
    ),
}).strict();

const CancelOrderSchema = z.object({
  reason: z.string().trim().min(1, 'reason cannot be blank').max(255, 'reason must be 255 characters or fewer').optional(),
}).strict();

export const schemas = {
  UUIDParam, CustomerUUIDParam, PaginationQuery,
  CreateOrderSchema, CancelOrderSchema,
};
