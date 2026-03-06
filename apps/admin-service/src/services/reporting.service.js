/**
 * reporting.service.js
 *
 * Platform-level reporting and dashboard data aggregations.
 * Queries the Admin Service's own DB for audit logs, cases, and overrides.
 * Cross-service aggregate stats are populated via event consumers.
 */

import prisma from '../../prisma/client.js';

// ─── Dashboard summary ───────────────────────────────────────────────────────

export async function getDashboardSummary() {
  const [
    openCases,
    criticalCases,
    vendorSuspensions,
    productSuspensions,
    orderOverrides,
    recentAudit,
  ] = await Promise.all([
    prisma.moderationCase.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    prisma.moderationCase.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] }, priority: 'CRITICAL' } }),

    prisma.auditLog.count({
      where: {
        action:   { in: ['VENDOR_SUSPENDED', 'VENDOR_BLACKLISTED'] },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30d
      },
    }),

    prisma.auditLog.count({
      where: {
        action:    'PRODUCT_SUSPENDED',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),

    prisma.orderOverride.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        success:   true,
      },
    }),

    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take:    10,
      include: { admin: { select: { name: true } } },
    }),
  ]);

  return {
    cases: { open: openCases, critical: criticalCases },
    last30Days: { vendorSuspensions, productSuspensions, orderOverrides },
    recentActions: recentAudit,
  };
}

// ─── Vendor moderation stats ─────────────────────────────────────────────────

export async function getVendorModerationStats({ from, to }) {
  const dateFilter = buildDateFilter(from, to);

  const [approved, rejected, suspended, blacklisted, flagged] = await Promise.all([
    prisma.auditLog.count({ where: { action: 'VENDOR_KYC_APPROVED',  ...dateFilter } }),
    prisma.auditLog.count({ where: { action: 'VENDOR_KYC_REJECTED',  ...dateFilter } }),
    prisma.auditLog.count({ where: { action: 'VENDOR_SUSPENDED',     ...dateFilter } }),
    prisma.auditLog.count({ where: { action: 'VENDOR_BLACKLISTED',   ...dateFilter } }),
    prisma.moderationCase.count({
      where: { entityType: 'VENDOR', status: { in: ['OPEN', 'IN_REVIEW'] }, ...extractDateFilter(dateFilter) },
    }),
  ]);

  return { approved, rejected, suspended, blacklisted, flaggedOpen: flagged };
}

// ─── Product moderation stats ────────────────────────────────────────────────

export async function getProductModerationStats({ from, to }) {
  const dateFilter = buildDateFilter(from, to);

  const [suspended, restored, archived] = await Promise.all([
    prisma.auditLog.count({ where: { action: 'PRODUCT_SUSPENDED', ...dateFilter } }),
    prisma.auditLog.count({ where: { action: 'PRODUCT_RESTORED',  ...dateFilter } }),
    prisma.auditLog.count({ where: { action: 'PRODUCT_ARCHIVED',  ...dateFilter } }),
  ]);

  return { suspended, restored, archived };
}

// ─── Order override stats ─────────────────────────────────────────────────────

export async function getOrderOverrideStats({ from, to, page = 1, limit = 20 }) {
  const where = {
    ...(from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      },
    },
  };

  const [overrides, total, successCount, failCount] = await Promise.all([
    prisma.orderOverride.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.orderOverride.count({ where }),
    prisma.orderOverride.count({ where: { ...where, success: true } }),
    prisma.orderOverride.count({ where: { ...where, success: false } }),
  ]);

  return {
    overrides, total, page, limit,
    pages:   Math.ceil(total / limit),
    summary: { success: successCount, failed: failCount },
  };
}

// ─── Audit log report ────────────────────────────────────────────────────────

export async function getAuditReport({ adminId, entityType, action, from, to, page = 1, limit = 20 }) {
  const where = {
    ...(adminId    && { adminId }),
    ...(entityType && { entityType }),
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
      include: { admin: { select: { name: true, email: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Case report ─────────────────────────────────────────────────────────────

export async function getCaseReport({ from, to, status, category, page = 1, limit = 20 }) {
  const where = {
    ...(status   && { status }),
    ...(category && { category }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: new Date(from) }),
        ...(to   && { lte: new Date(to) }),
      },
    }),
  };

  const [cases, total] = await Promise.all([
    prisma.moderationCase.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        assignedTo: { select: { name: true } },
        openedBy:   { select: { name: true } },
      },
    }),
    prisma.moderationCase.count({ where }),
  ]);

  return { cases, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDateFilter(from, to) {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from && { gte: new Date(from) }),
      ...(to   && { lte: new Date(to) }),
    },
  };
}

function extractDateFilter(auditFilter) {
  return auditFilter.createdAt ? { createdAt: auditFilter.createdAt } : {};
}
