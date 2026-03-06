/**
 * admin-user.service.js
 *
 * Manage platform admin accounts: create, role change, deactivate.
 * Only SUPER_ADMIN can promote or deactivate other admins.
 */

import prisma from '../../prisma/client.js';
import { writeAudit }    from './audit.service.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function createAdminUser({ userId, email, name, role, adminUser, requestId }) {
  // Only SUPER_ADMIN can create admins
  if (adminUser.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only SUPER_ADMIN can create admin accounts');
  }

  const existing = await prisma.adminUser.findFirst({
    where: { OR: [{ userId }, { email }] },
  });
  if (existing) throw new ConflictError('An admin account already exists for this user or email');

  const newAdmin = await prisma.adminUser.create({
    data: { userId, email, name, role },
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'ADMIN_CREATED',
    entityType: 'VENDOR',  // use VENDOR as closest proxy; no ADMIN entity type in enum
    entityId:   newAdmin.id,
    after:      { userId, email, name, role },
    requestId,
  });

  logger.info({ msg: 'Admin user created', newAdminId: newAdmin.id, role, createdBy: adminUser.id });
  return newAdmin;
}

export async function updateAdminRole({ targetAdminId, role, adminUser, requestId }) {
  if (adminUser.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only SUPER_ADMIN can change admin roles');
  }
  if (targetAdminId === adminUser.id) {
    throw new ConflictError('Cannot change your own role');
  }

  const target = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
  if (!target) throw new NotFoundError('AdminUser');

  const updated = await prisma.adminUser.update({
    where: { id: targetAdminId },
    data:  { role },
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'ADMIN_ROLE_CHANGED',
    entityType: 'VENDOR',
    entityId:   targetAdminId,
    before:     { role: target.role },
    after:      { role },
    requestId,
  });

  return updated;
}

export async function deactivateAdmin({ targetAdminId, adminUser, requestId }) {
  if (adminUser.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only SUPER_ADMIN can deactivate admin accounts');
  }
  if (targetAdminId === adminUser.id) {
    throw new ConflictError('Cannot deactivate your own account');
  }

  const target = await prisma.adminUser.findUnique({ where: { id: targetAdminId } });
  if (!target) throw new NotFoundError('AdminUser');

  const updated = await prisma.adminUser.update({
    where: { id: targetAdminId },
    data:  { isActive: false },
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'ADMIN_DEACTIVATED',
    entityType: 'VENDOR',
    entityId:   targetAdminId,
    requestId,
  });

  return updated;
}

export async function listAdminUsers({ role, isActive, page = 1, limit = 20 }) {
  const where = {
    ...(role !== undefined     && { role }),
    ...(isActive !== undefined && { isActive }),
  };

  const [admins, total] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.adminUser.count({ where }),
  ]);

  return { admins, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getAdminUser(id) {
  const admin = await prisma.adminUser.findUnique({ where: { id } });
  if (!admin) throw new NotFoundError('AdminUser');
  return admin;
}
