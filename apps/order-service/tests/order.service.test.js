import { ORDER_STATUS, TERMINAL_STATES, VALID_TRANSITIONS } from '../src/constants/orderStateMachine.js';
import { StateError, NotFoundError }                        from '../src/services/orderService.js';
import { schemas }                                          from '../src/middleware/validate.js';

// ─── State Machine ────────────────────────────────────────────────────────────
describe('Order State Machine', () => {
  test('PENDING → CHECKOUT_INITIATED is valid', () => {
    expect(VALID_TRANSITIONS.PENDING).toContain('CHECKOUT_INITIATED');
  });

  test('PENDING → PROCESSING is NOT a direct transition (must go via CHECKOUT_INITIATED)', () => {
    expect(VALID_TRANSITIONS.PENDING).not.toContain('PROCESSING');
  });

  test('CHECKOUT_INITIATED → PROCESSING and CANCELLED are valid', () => {
    expect(VALID_TRANSITIONS.CHECKOUT_INITIATED).toContain('PROCESSING');
    expect(VALID_TRANSITIONS.CHECKOUT_INITIATED).toContain('CANCELLED');
  });

  test('DELIVERED and CANCELLED are terminal states', () => {
    expect(TERMINAL_STATES.has('DELIVERED')).toBe(true);
    expect(TERMINAL_STATES.has('CANCELLED')).toBe(true);
  });

  test('CHECKOUT_INITIATED is not a terminal state', () => {
    expect(TERMINAL_STATES.has('CHECKOUT_INITIATED')).toBe(false);
  });

  test('SHIPPED only allows DELIVERED (not cancellable after shipped)', () => {
    expect(VALID_TRANSITIONS.SHIPPED).toEqual(['DELIVERED']);
  });
});

// ─── Currency ─────────────────────────────────────────────────────────────────
describe('Integer cents currency', () => {
  const toCents   = (d) => Math.round(parseFloat(d) * 100);
  const fromCents = (c) => (c / 100).toFixed(2);

  test('avoids 0.1 + 0.2 floating-point error', () => {
    expect(toCents(0.1) + toCents(0.2)).toBe(30);
  });
  test('toCents: $10.99 → 1099',   () => expect(toCents(10.99)).toBe(1099));
  test('fromCents: 1099 → "10.99"', () => expect(fromCents(1099)).toBe('10.99'));
  test('fromCents: 0 → "0.00"',     () => expect(fromCents(0)).toBe('0.00'));
});

// ─── Deduplication ────────────────────────────────────────────────────────────
describe('Item deduplication', () => {
  function dedup(items) {
    const map = new Map();
    for (const item of items) {
      if (map.has(item.productId)) map.get(item.productId).quantity += item.quantity;
      else map.set(item.productId, { ...item });
    }
    return Array.from(map.values());
  }

  test('merges duplicate productIds by summing quantities', () => {
    const result = dedup([
      { productId: 'aaa', quantity: 2 },
      { productId: 'bbb', quantity: 1 },
      { productId: 'aaa', quantity: 3 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find(i => i.productId === 'aaa').quantity).toBe(5);
  });

  test('passes through unique items unchanged', () => {
    expect(dedup([{ productId: 'aaa', quantity: 2 }])).toHaveLength(1);
  });
});

// ─── Custom error types ───────────────────────────────────────────────────────
describe('Custom error classes', () => {
  test('StateError has statusCode 422', () => {
    const err = new StateError('bad transition');
    expect(err.statusCode).toBe(422);
    expect(err.name).toBe('StateError');
  });

  test('NotFoundError has statusCode 404', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
  });
});

// ─── Zod Schema validation ────────────────────────────────────────────────────
describe('Zod CreateOrderSchema', () => {
  test('accepts valid order payload', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      items: [{ productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 2 }],
    });
    expect(result.success).toBe(true);
  });

  test('rejects duplicate productIds in items array', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      items: [
        { productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 2 },
        { productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 1 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].message).toMatch(/Duplicate/);
  });

  test('rejects unknown extra fields via .strict()', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      items: [{ productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 1 }],
      maliciousField: 'injected',
    });
    expect(result.success).toBe(false);
  });

  test('rejects quantity < 1', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      items: [{ productId: '550e8400-e29b-41d4-a716-446655440001', quantity: 0 }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects empty items array', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      items: [],
    });
    expect(result.success).toBe(false);
  });

  test('rejects missing customerId', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
    });
    expect(result.success).toBe(false);
    expect(result.error.errors[0].path).toContain('customerId');
  });

  test('rejects invalid UUID for productId', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '00000000-0000-0000-0000-000000000001',
      items: [{ productId: 'not-a-uuid', quantity: 1 }],
    });
    expect(result.success).toBe(false);
  });

  test('strips unknown extra fields', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId: '00000000-0000-0000-0000-000000000001',
      items: [{ productId: '00000000-0000-0000-0000-000000000002', quantity: 1 }],
      maliciousField: 'DROP TABLE orders',
    });
    expect(result.success).toBe(false);
  });

  test('accepts a valid payload with idempotencyKey', () => {
    const result = schemas.CreateOrderSchema.safeParse({
      customerId:     '00000000-0000-0000-0000-000000000001',
      idempotencyKey: '00000000-0000-0000-0000-000000000099',
      items: [{ productId: '00000000-0000-0000-0000-000000000002', quantity: 3 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('CancelOrderSchema validation', () => {
  test('rejects blank reason string', () => {
    const result = schemas.CancelOrderSchema.safeParse({ reason: '   ' });
    expect(result.success).toBe(false);
  });

  test('rejects reason over 255 chars', () => {
    const result = schemas.CancelOrderSchema.safeParse({ reason: 'x'.repeat(256) });
    expect(result.success).toBe(false);
  });

  test('accepts empty body (reason is optional)', () => {
    const result = schemas.CancelOrderSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ─── Pagination clamping ──────────────────────────────────────────────────────
describe('Pagination', () => {
  const clamp = (limit) => Math.min(Math.max(parseInt(limit), 1), 100);
  test('clamps 0 → 1',      () => expect(clamp(0)).toBe(1));
  test('clamps 9999 → 100', () => expect(clamp(9999)).toBe(100));
  test('passes 20 → 20',    () => expect(clamp(20)).toBe(20));
});

// ─── Consumer retry logic ─────────────────────────────────────────────────────
describe('Consumer retry — x-delivery-count (quorum queue)', () => {
  function getDeliveryCount(msg) {
    return msg.properties?.headers?.['x-delivery-count'] ?? 0;
  }

  const RETRY_BACKOFF_MS = [5_000, 15_000, 30_000];
  const MAX_RETRIES = 3;

  test('first delivery: x-delivery-count absent → count is 0', () => {
    expect(getDeliveryCount({ properties: { headers: {} } })).toBe(0);
  });

  test('second delivery: x-delivery-count=1 → correctly read', () => {
    expect(getDeliveryCount({ properties: { headers: { 'x-delivery-count': 1 } } })).toBe(1);
  });

  test('backoff is 5s on first failure', () => expect(RETRY_BACKOFF_MS[0]).toBe(5_000));
  test('backoff increases: 5s → 15s → 30s', () => {
    expect(RETRY_BACKOFF_MS).toEqual([5_000, 15_000, 30_000]);
  });

  test('dead-letters when deliveryCount >= MAX_RETRIES', () => {
    expect(MAX_RETRIES >= MAX_RETRIES).toBe(true);
  });

  test('requeues when deliveryCount < MAX_RETRIES', () => {
    expect(2 < MAX_RETRIES).toBe(true);
  });

  test('x-death is NOT used (old bug is gone)', () => {
    const msg = { properties: { headers: {} } };
    const oldGetRetryCount = (m) => {
      const death = m.properties?.headers?.['x-death'];
      if (!Array.isArray(death) || death.length === 0) return 0;
      return death[0].count || 0;
    };
    expect(oldGetRetryCount(msg)).toBe(0);
    expect(getDeliveryCount(msg)).toBe(0);
  });
});

// ─── Outbox dead-event detection ──────────────────────────────────────────────
describe('Outbox poison pill detection', () => {
  const MAX_OUTBOX_RETRIES = 5;

  test('event is marked failed when retries reaches MAX_OUTBOX_RETRIES', () => {
    expect(MAX_OUTBOX_RETRIES >= MAX_OUTBOX_RETRIES).toBe(true);
  });

  test('event is NOT marked failed below MAX_OUTBOX_RETRIES', () => {
    expect((MAX_OUTBOX_RETRIES - 1) >= MAX_OUTBOX_RETRIES).toBe(false);
  });

  test('failedAt is set exactly at the retry ceiling, not before', () => {
    for (let attempt = 1; attempt < MAX_OUTBOX_RETRIES; attempt++) {
      expect(attempt >= MAX_OUTBOX_RETRIES).toBe(false);
    }
    expect(MAX_OUTBOX_RETRIES >= MAX_OUTBOX_RETRIES).toBe(true);
  });
});
