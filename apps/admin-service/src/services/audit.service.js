/**
 * audit.service.js
 *
 * Central audit log for every admin action across the platform.
 * Written AFTER a downstream call succeeds — captures both before/after state.
 * The audit log is append-only; never updated or deleted.
 */

import prisma from '../../prisma/client.js';
import logger from '../utils/logger.js';

// ─── Write an audit entry ────────────────────────────────────────────────────

export async function writeAudit({
  adminId,
  action,
  entityType,
  entityId,
  before  = null,
  after   = null,
  reason  = null,
  caseId  = null,
  requestId = null,
  metadata  = null,
}) {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        adminId,
        action,
        entityType,
        entityId,
        before:    before   ?? undefined,
        after:     after    ?? undefined,
        reason:    reason   ?? null,
        caseId:    caseId   ?? null,
        requestId: requestId ?? null,
        metadata:  metadata  ?? undefined,
      },
    });

    logger.info({ msg: 'Audit entry written', action, entityType, entityId, auditId: entry.id });
    return entry;
  } catch (err) {
    // Audit failures must never break the primary operation
    logger.error({ msg: 'CRITICAL: Failed to write audit log', action, entityType, entityId, err });
    return null;
  }
}

// ─── Query audit log ─────────────────────────────────────────────────────────

export async function getAuditLog({ entityType, entityId, adminId, action, from, to, page = 1, limit = 20 }) {
  const where = {
    ...(entityType && { entityType }),
    ...(entityId   && { entityId }),
    ...(adminId    && { adminId }),
    ...(action     && { action }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      },
    }),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        admin: { select: { name: true, email: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, limit, pages: Math.ceil(total / limit) };
}
