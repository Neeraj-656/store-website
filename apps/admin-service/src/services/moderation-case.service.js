/**
 * moderation-case.service.js
 *
 * Formal case management system for reports, disputes, and flagged entities.
 * Cases link admin actions to a business context (who reported what and why).
 *
 * Lifecycle: OPEN → IN_REVIEW → RESOLVED | DISMISSED
 */

import prisma from '../../prisma/client.js';
import { writeAudit }    from './audit.service.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';
import logger from '../utils/logger.js';

// ─── Case number generator: CASE-2026-0001 ──────────────────────────────────

async function generateCaseNumber() {
  const year  = new Date().getFullYear();
  const count = await prisma.moderationCase.count({
    where: { caseNumber: { startsWith: `CASE-${year}-` } },
  });
  const seq = String(count + 1).padStart(4, '0');
  return `CASE-${year}-${seq}`;
}

// ─── Open a new case ─────────────────────────────────────────────────────────

export async function openCase({
  entityType, entityId, category, priority, title, description,
  reportedBy, adminUser, entitySnapshot, requestId,
}) {
  const caseNumber = await generateCaseNumber();

  const newCase = await prisma.$transaction(async (tx) => {
    const c = await tx.moderationCase.create({
      data: {
        caseNumber,
        entityType,
        entityId,
        category,
        priority:    priority ?? 'MEDIUM',
        status:      'OPEN',
        title,
        description,
        reportedBy:  reportedBy ?? null,
        openedById:  adminUser.id,
        entitySnapshot: entitySnapshot ?? undefined,
      },
    });

    await tx.adminOutboxEvent.create({
      data: {
        caseId:    c.id,
        eventType: 'admin.case.opened',
        payload:   { caseId: c.id, caseNumber, entityType, entityId, category, priority: c.priority },
      },
    });

    return c;
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'CASE_OPENED',
    entityType,
    entityId,
    reason:     `Case opened: ${title}`,
    caseId:     newCase.id,
    requestId,
    metadata:   { caseNumber, category, priority },
  });

  logger.info({ msg: 'Moderation case opened', caseNumber, entityType, entityId, adminId: adminUser.id });
  return newCase;
}

// ─── Assign a case to an admin ───────────────────────────────────────────────

export async function assignCase({ caseId, assignToAdminId, adminUser, requestId }) {
  const existingCase = await prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!existingCase) throw new NotFoundError('ModerationCase');
  if (existingCase.status === 'RESOLVED' || existingCase.status === 'DISMISSED') {
    throw new ConflictError(`Cannot assign a ${existingCase.status.toLowerCase()} case`);
  }

  // Verify the target admin exists
  const targetAdmin = await prisma.adminUser.findUnique({ where: { id: assignToAdminId } });
  if (!targetAdmin || !targetAdmin.isActive) throw new NotFoundError('AdminUser');

  const updated = await prisma.moderationCase.update({
    where: { id: caseId },
    data:  { assignedToId: assignToAdminId, status: 'IN_REVIEW' },
    include: { assignedTo: { select: { name: true, email: true } } },
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'CASE_ASSIGNED',
    entityType: existingCase.entityType,
    entityId:   existingCase.entityId,
    caseId,
    requestId,
    metadata:   { assignedToId: assignToAdminId, assignedToName: targetAdmin.name },
  });

  return updated;
}

// ─── Resolve a case ──────────────────────────────────────────────────────────

export async function resolveCase({ caseId, resolution, adminUser, requestId }) {
  const existingCase = await prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!existingCase) throw new NotFoundError('ModerationCase');
  if (existingCase.status === 'RESOLVED') throw new ConflictError('Case already resolved');
  if (existingCase.status === 'DISMISSED') throw new ConflictError('Case already dismissed');

  const updated = await prisma.$transaction(async (tx) => {
    const c = await tx.moderationCase.update({
      where: { id: caseId },
      data:  { status: 'RESOLVED', resolution, resolvedAt: new Date() },
    });

    await tx.adminOutboxEvent.create({
      data: {
        caseId,
        eventType: 'admin.case.resolved',
        payload:   { caseId, caseNumber: existingCase.caseNumber, resolution },
      },
    });

    return c;
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'CASE_RESOLVED',
    entityType: existingCase.entityType,
    entityId:   existingCase.entityId,
    reason:     resolution,
    caseId,
    requestId,
  });

  return updated;
}

// ─── Dismiss a case ──────────────────────────────────────────────────────────

export async function dismissCase({ caseId, resolution, adminUser, requestId }) {
  const existingCase = await prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!existingCase) throw new NotFoundError('ModerationCase');
  if (['RESOLVED', 'DISMISSED'].includes(existingCase.status)) {
    throw new ConflictError(`Case already ${existingCase.status.toLowerCase()}`);
  }

  const updated = await prisma.moderationCase.update({
    where: { id: caseId },
    data:  { status: 'DISMISSED', resolution, resolvedAt: new Date() },
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'CASE_DISMISSED',
    entityType: existingCase.entityType,
    entityId:   existingCase.entityId,
    reason:     resolution,
    caseId,
    requestId,
  });

  return updated;
}

// ─── Add a case note ─────────────────────────────────────────────────────────

export async function addCaseNote({ caseId, body, isInternal, adminUser }) {
  const existingCase = await prisma.moderationCase.findUnique({ where: { id: caseId } });
  if (!existingCase) throw new NotFoundError('ModerationCase');

  return prisma.caseNote.create({
    data: {
      caseId,
      authorId:   adminUser.userId,
      body,
      isInternal: isInternal ?? true,
    },
  });
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getCaseById(caseId) {
  const c = await prisma.moderationCase.findUnique({
    where:   { id: caseId },
    include: {
      notes:      { orderBy: { createdAt: 'asc' } },
      assignedTo: { select: { name: true, email: true, role: true } },
      openedBy:   { select: { name: true, email: true } },
    },
  });
  if (!c) throw new NotFoundError('ModerationCase');
  return c;
}

export async function listCases({ entityType, entityId, status, priority, category, assignedToId, page = 1, limit = 20 }) {
  const where = {
    ...(entityType   && { entityType }),
    ...(entityId     && { entityId }),
    ...(status       && { status }),
    ...(priority     && { priority }),
    ...(category     && { category }),
    ...(assignedToId && { assignedToId }),
  };

  const [cases, total] = await Promise.all([
    prisma.moderationCase.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip:    (page - 1) * limit,
      take:    limit,
      include: {
        assignedTo: { select: { name: true, email: true } },
        openedBy:   { select: { name: true } },
        _count:     { select: { notes: true } },
      },
    }),
    prisma.moderationCase.count({ where }),
  ]);

  return { cases, total, page, limit, pages: Math.ceil(total / limit) };
}
