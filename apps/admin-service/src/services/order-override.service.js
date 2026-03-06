/**
 * order-override.service.js
 *
 * Admin order intervention: force-cancel, force-refund, or correct order status.
 * Every override is:
 *   1. Persisted to OrderOverride table (financial audit / reconciliation)
 *   2. Written to the central AuditLog
 *   3. Proxied to the Order Service internal API
 *
 * The Order Service owns the actual state transition; this service owns the governance record.
 */

import prisma            from '../../prisma/client.js';
import { orderClient }   from '../clients/order.client.js';
import { writeAudit }    from './audit.service.js';
import { NotFoundError } from '../utils/errors.js';
import logger            from '../utils/logger.js';

async function persistOverride({ orderId, adminUser, type, fromStatus, toStatus, reason, caseId, success, serviceResponse, failureReason }) {
  return prisma.orderOverride.create({
    data: {
      orderId,
      adminId:         adminUser.id,
      type,
      fromStatus,
      toStatus,
      reason,
      caseId:          caseId ?? null,
      success,
      serviceResponse: serviceResponse ?? undefined,
      failureReason:   failureReason ?? null,
    },
  });
}

export async function forceCancel({ orderId, reason, caseId, adminUser, requestId }) {
  const order = await orderClient.getOrder(orderId, { requestId });
  if (!order?.data) throw new NotFoundError('Order');

  const fromStatus = order.data.status;
  let serviceResponse, success, failureReason;

  try {
    serviceResponse = await orderClient.forceCancel(orderId, {
      reason, adminId: adminUser.userId, requestId,
    });
    success = true;
  } catch (err) {
    success = false;
    failureReason = err.message;
    serviceResponse = { error: err.message };
  }

  await persistOverride({
    orderId, adminUser, type: 'FORCE_CANCEL',
    fromStatus, toStatus: 'CANCELLED', reason, caseId,
    success, serviceResponse, failureReason,
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'ORDER_FORCE_CANCELLED',
    entityType: 'ORDER',
    entityId:   orderId,
    before:     { status: fromStatus },
    after:      success ? { status: 'CANCELLED' } : null,
    reason,
    caseId:     caseId ?? null,
    requestId,
    metadata:   { success, failureReason },
  });

  if (!success) throw new Error(`Order Service rejected force-cancel: ${failureReason}`);

  logger.info({ msg: 'Admin: order force-cancelled', orderId, adminId: adminUser.id });
  return serviceResponse?.data ?? serviceResponse;
}

export async function forceRefund({ orderId, reason, caseId, adminUser, requestId }) {
  const order = await orderClient.getOrder(orderId, { requestId });
  if (!order?.data) throw new NotFoundError('Order');

  const fromStatus = order.data.status;
  let serviceResponse, success, failureReason;

  try {
    serviceResponse = await orderClient.forceRefund(orderId, {
      reason, adminId: adminUser.userId, requestId,
    });
    success = true;
  } catch (err) {
    success = false;
    failureReason = err.message;
    serviceResponse = { error: err.message };
  }

  await persistOverride({
    orderId, adminUser, type: 'FORCE_REFUND',
    fromStatus, toStatus: 'REFUNDED', reason, caseId,
    success, serviceResponse, failureReason,
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'ORDER_FORCE_REFUNDED',
    entityType: 'ORDER',
    entityId:   orderId,
    before:     { status: fromStatus },
    after:      success ? { status: 'REFUNDED' } : null,
    reason,
    caseId:     caseId ?? null,
    requestId,
    metadata:   { success, failureReason },
  });

  if (!success) throw new Error(`Order Service rejected force-refund: ${failureReason}`);

  return serviceResponse?.data ?? serviceResponse;
}

export async function overrideOrderStatus({ orderId, targetStatus, reason, caseId, adminUser, requestId }) {
  const order = await orderClient.getOrder(orderId, { requestId });
  if (!order?.data) throw new NotFoundError('Order');

  const fromStatus = order.data.status;
  let serviceResponse, success, failureReason;

  try {
    serviceResponse = await orderClient.overrideStatus(orderId, {
      targetStatus, reason, adminId: adminUser.userId, requestId,
    });
    success = true;
  } catch (err) {
    success = false;
    failureReason = err.message;
    serviceResponse = { error: err.message };
  }

  await persistOverride({
    orderId, adminUser, type: 'STATUS_CORRECTION',
    fromStatus, toStatus: targetStatus, reason, caseId,
    success, serviceResponse, failureReason,
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'ORDER_STATUS_OVERRIDDEN',
    entityType: 'ORDER',
    entityId:   orderId,
    before:     { status: fromStatus },
    after:      success ? { status: targetStatus } : null,
    reason,
    caseId:     caseId ?? null,
    requestId,
  });

  if (!success) throw new Error(`Order Service rejected status override: ${failureReason}`);

  return serviceResponse?.data ?? serviceResponse;
}

export async function listOrderOverrides({ orderId, adminId, type, page = 1, limit = 20 }) {
  const where = {
    ...(orderId && { orderId }),
    ...(adminId && { adminId }),
    ...(type    && { type }),
  };

  const [overrides, total] = await Promise.all([
    prisma.orderOverride.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.orderOverride.count({ where }),
  ]);

  return { overrides, total, page, limit, pages: Math.ceil(total / limit) };
}
