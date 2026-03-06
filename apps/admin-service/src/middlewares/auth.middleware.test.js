/**
 * auth.middleware.test.js
 *
 * Unit tests for adminService/src/middlewares/auth.middleware.js
 *
 * Run with: npm test
 * Requires: vitest (or jest with ESM support)
 *   npm install -D vitest
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock dependencies before importing the module under test ─────────────────

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: vi.fn(),
  },
}));

vi.mock('../../prisma/client.js', () => ({
  default: {
    adminUser: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../config/index.js', () => ({
  default: {
    auth: {
      jwtSecret: 'test-secret',
      audience:  '',
      issuer:    'auth-service',
    },
    internalToken: 'valid-internal-token-that-is-long-enough',
  },
}));

import jwt    from 'jsonwebtoken';
import prisma from '../../prisma/client.js';
import {
  correlationId,
  authenticate,
  requireAdmin,
  requireAdminRole,
  attachAdminUser,
  internalOnly,
} from '../middlewares/auth.middleware.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockReqRes(overrides = {}) {
  const req = {
    headers:   {},
    requestId: 'test-req-id',
    ...overrides,
  };
  const res = {
    setHeader: vi.fn(),
    status:    vi.fn().mockReturnThis(),
    json:      vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

// ─── correlationId ────────────────────────────────────────────────────────────

describe('correlationId', () => {
  it('uses existing x-request-id header if present', () => {
    const { req, res, next } = mockReqRes({ headers: { 'x-request-id': 'abc123' } });
    correlationId(req, res, next);
    expect(req.requestId).toBe('abc123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'abc123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('generates a UUID when no x-request-id header is present', () => {
    const { req, res, next } = mockReqRes();
    correlationId(req, res, next);
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls next with UnauthorizedError when Authorization header is missing', () => {
    const { req, res, next } = mockReqRes({ headers: {} });
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('calls next with UnauthorizedError when header does not start with Bearer', () => {
    const { req, res, next } = mockReqRes({ headers: { authorization: 'Basic abc' } });
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('attaches decoded token to req.user on valid JWT', () => {
    const payload = { id: 'user-1', role: 'admin' };
    jwt.verify.mockReturnValueOnce(payload);

    const { req, res, next } = mockReqRes({ headers: { authorization: 'Bearer valid.token' } });
    authenticate(req, res, next);

    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledWith(); // no error arg
  });

  it('calls next with UnauthorizedError when JWT verification throws', () => {
    jwt.verify.mockImplementationOnce(() => { throw new Error('expired'); });
    const { req, res, next } = mockReqRes({ headers: { authorization: 'Bearer bad.token' } });
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
  it('passes when user has role=admin', () => {
    const { req, res, next } = mockReqRes();
    req.user = { id: 'u1', role: 'admin' };
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with ForbiddenError when role is not admin', () => {
    const { req, res, next } = mockReqRes();
    req.user = { id: 'u1', role: 'vendor' };
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('rejects with UnauthorizedError when req.user is not set', () => {
    const { req, res, next } = mockReqRes();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

// ─── requireAdminRole ─────────────────────────────────────────────────────────

describe('requireAdminRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches adminUser and passes when role matches', async () => {
    const adminUser = { id: 'a1', role: 'SUPER_ADMIN', isActive: true };
    prisma.adminUser.findUnique.mockResolvedValueOnce(adminUser);

    const { req, res, next } = mockReqRes();
    req.user = { id: 'user-1' };

    const mw = requireAdminRole('SUPER_ADMIN', 'MODERATOR');
    await mw(req, res, next);

    expect(req.adminUser).toEqual(adminUser);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with ForbiddenError when role does not match', async () => {
    prisma.adminUser.findUnique.mockResolvedValueOnce({
      id: 'a1', role: 'SUPPORT', isActive: true,
    });

    const { req, res, next } = mockReqRes();
    req.user = { id: 'user-1' };

    const mw = requireAdminRole('SUPER_ADMIN');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('rejects when adminUser is inactive', async () => {
    prisma.adminUser.findUnique.mockResolvedValueOnce({
      id: 'a1', role: 'SUPER_ADMIN', isActive: false,
    });

    const { req, res, next } = mockReqRes();
    req.user = { id: 'user-1' };

    const mw = requireAdminRole('SUPER_ADMIN');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('rejects when adminUser record not found', async () => {
    prisma.adminUser.findUnique.mockResolvedValueOnce(null);

    const { req, res, next } = mockReqRes();
    req.user = { id: 'user-1' };

    const mw = requireAdminRole('SUPER_ADMIN');
    await mw(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('skips DB call if req.adminUser already populated', async () => {
    const { req, res, next } = mockReqRes();
    req.user      = { id: 'user-1' };
    req.adminUser = { id: 'a1', role: 'SUPER_ADMIN', isActive: true };

    const mw = requireAdminRole('SUPER_ADMIN');
    await mw(req, res, next);

    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });
});

// ─── internalOnly ─────────────────────────────────────────────────────────────

describe('internalOnly', () => {
  it('passes when token matches', () => {
    const { req, res, next } = mockReqRes({
      headers: { 'x-internal-service-token': 'valid-internal-token-that-is-long-enough' },
    });
    internalOnly(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with UnauthorizedError when token is wrong', () => {
    const { req, res, next } = mockReqRes({
      headers: { 'x-internal-service-token': 'wrong-token-that-is-exactly-same-len1' },
    });
    internalOnly(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('rejects when token header is missing', () => {
    const { req, res, next } = mockReqRes({ headers: {} });
    internalOnly(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
