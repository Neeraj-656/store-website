/**
 * commission.service.js
 *
 * CRUD for CommissionRule.
 * Platform admins can set a default rule (vendorId = null) or
 * per-vendor overrides (vendorId = specific UUID).
 */

import prisma from '../../prisma/client.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';

export async function createOrUpdateRule({ vendorId = null, commissionRate, paymentFeeRate, settlementCycle }) {
  const existing = await prisma.commissionRule.findFirst({
    where: { vendorId: vendorId ?? null },
  });

  if (existing) {
    return prisma.commissionRule.update({
      where: { id: existing.id },
      data: { commissionRate, paymentFeeRate, settlementCycle, isActive: true },
    });
  }

  return prisma.commissionRule.create({
    data: { vendorId, commissionRate, paymentFeeRate, settlementCycle },
  });
}

export async function getRuleForVendor(vendorId) {
  const rule = await prisma.commissionRule.findFirst({
    where: {
      isActive: true,
      OR: [{ vendorId }, { vendorId: null }],
    },
    orderBy: [{ vendorId: 'desc' }],
  });

  if (!rule) throw new NotFoundError('CommissionRule');
  return rule;
}

export async function listRules() {
  return prisma.commissionRule.findMany({
    orderBy: [{ vendorId: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function deactivateRule(id) {
  const rule = await prisma.commissionRule.findUnique({ where: { id } });
  if (!rule) throw new NotFoundError('CommissionRule');

  return prisma.commissionRule.update({
    where: { id },
    data: { isActive: false },
  });
}
