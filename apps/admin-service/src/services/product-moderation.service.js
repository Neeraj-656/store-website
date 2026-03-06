/**
 * product-moderation.service.js
 *
 * Admin product moderation: suspend fraudulent/policy-violating listings,
 * restore them when disputes are resolved, or archive permanently.
 * All actions are proxied to the Catalog Service and audit-logged here.
 */

import { catalogClient } from '../clients/catalog.client.js';
import { writeAudit }    from './audit.service.js';
import logger            from '../utils/logger.js';

export async function suspendProduct({ productId, vendorId, expectedVersion, reason, caseId, adminUser, requestId }) {
  const before = await catalogClient.getProduct(productId, { requestId }).catch(() => null);
  const result = await catalogClient.suspendProduct(productId, {
    vendorId, expectedVersion, reason, requestId,
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'PRODUCT_SUSPENDED',
    entityType: 'PRODUCT',
    entityId:   productId,
    before:     before?.data ?? null,
    after:      result.data ?? result,
    reason,
    caseId:     caseId ?? null,
    requestId,
    metadata:   { vendorId },
  });

  logger.info({ msg: 'Admin: product suspended', productId, vendorId, adminId: adminUser.id });
  return result.data ?? result;
}

export async function restoreProduct({ productId, vendorId, expectedVersion, targetStatus, reason, caseId, adminUser, requestId }) {
  const before = await catalogClient.getProduct(productId, { requestId }).catch(() => null);
  const result = await catalogClient.restoreProduct(productId, {
    vendorId, expectedVersion, targetStatus, reason, requestId,
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'PRODUCT_RESTORED',
    entityType: 'PRODUCT',
    entityId:   productId,
    before:     before?.data ?? null,
    after:      result.data ?? result,
    reason,
    caseId:     caseId ?? null,
    requestId,
    metadata:   { vendorId, targetStatus },
  });

  return result.data ?? result;
}

export async function archiveProduct({ productId, vendorId, expectedVersion, reason, caseId, adminUser, requestId }) {
  const before = await catalogClient.getProduct(productId, { requestId }).catch(() => null);
  const result = await catalogClient.archiveProduct(productId, {
    vendorId, expectedVersion, reason, requestId,
  });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'PRODUCT_ARCHIVED',
    entityType: 'PRODUCT',
    entityId:   productId,
    before:     before?.data ?? null,
    after:      result.data ?? result,
    reason,
    caseId:     caseId ?? null,
    requestId,
    metadata:   { vendorId },
  });

  return result.data ?? result;
}

export const getProduct = (productId, ctx) => catalogClient.getProduct(productId, ctx).then((r) => r.data ?? r);
