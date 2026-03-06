/**
 * auth.middleware.test.js
 *
 * Unit tests for api-gateway/src/middleware/auth.middleware.js
 *
 * These cover the most security-critical paths:
 *   - blockInternalRoutes: ensures internal paths are never reachable from the public
 *   - stripInternalHeaders: ensures clients cannot forge x-user-id / x-internal headers
 *   - PUBLIC_PATHS / BLOCKED_PATHS snapshot: catches accidental list changes
 *
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../config/index.js', () => ({
  default: {
    authPublicKey: 'test-public-key',
    services: {},
  },
}));

import {
  stripInternalHeaders,
  blockInternalRoutes,
  PUBLIC_PATHS,
  BLOCKED_PATHS,
} from '../middleware/auth.middleware.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(path, headers = {}) {
  return { path, headers: { ...headers } };
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn(),
  };
}

// ─── stripInternalHeaders ─────────────────────────────────────────────────────

describe('stripInternalHeaders', () => {
  it('removes x-internal-service-token from inbound requests', () => {
    const req  = makeReq('/api/v1/orders', { 'x-internal-service-token': 'forged' });
    const next = vi.fn();
    stripInternalHeaders(req, makeRes(), next);
    expect(req.headers['x-internal-service-token']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('removes x-user-id from inbound requests', () => {
    const req  = makeReq('/api/v1/orders', { 'x-user-id': 'forged-user-id' });
    const next = vi.fn();
    stripInternalHeaders(req, makeRes(), next);
    expect(req.headers['x-user-id']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('removes x-user-role from inbound requests', () => {
    const req  = makeReq('/api/v1/orders', { 'x-user-role': 'forged-admin' });
    const next = vi.fn();
    stripInternalHeaders(req, makeRes(), next);
    expect(req.headers['x-user-role']).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not remove legitimate headers', () => {
    const req  = makeReq('/api/v1/orders', {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    });
    const next = vi.fn();
    stripInternalHeaders(req, makeRes(), next);
    expect(req.headers.authorization).toBe('Bearer token');
    expect(req.headers['content-type']).toBe('application/json');
  });
});

// ─── blockInternalRoutes ──────────────────────────────────────────────────────

describe('blockInternalRoutes', () => {
  const blockedPaths = [
    '/api/v1/inventory/adjust',
    '/api/v1/inventory/reserve',
    '/api/v1/inventory/deduct',
    '/api/v1/inventory/release',
    '/api/v1/payments/internal',
    '/api/v1/payments/internal/anything',
    '/api/v1/vendors/internal',
    '/api/v1/payouts/internal/transfer',
    '/api/v1/orders/internal',
  ];

  it.each(blockedPaths)('blocks %s with 403', (path) => {
    const req  = makeReq(path);
    const res  = makeRes();
    const next = vi.fn();
    blockInternalRoutes(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not block a normal order route', () => {
    const req  = makeReq('/api/v1/orders/order-123');
    const res  = makeRes();
    const next = vi.fn();
    blockInternalRoutes(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not block public inventory read', () => {
    const req  = makeReq('/api/v1/inventory/sku-abc');
    const res  = makeRes();
    const next = vi.fn();
    blockInternalRoutes(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ─── PUBLIC_PATHS snapshot ────────────────────────────────────────────────────
// This snapshot test ensures no accidental changes to the PUBLIC_PATHS or
// BLOCKED_PATHS lists sneak in. A wrong entry could expose internal routes or
// accidentally require auth on a public endpoint.

describe('PUBLIC_PATHS / BLOCKED_PATHS — snapshot', () => {
  it('PUBLIC_PATHS matches expected list', () => {
    expect(PUBLIC_PATHS).toMatchSnapshot();
  });

  it('BLOCKED_PATHS matches expected list', () => {
    expect(BLOCKED_PATHS).toMatchSnapshot();
  });
});
