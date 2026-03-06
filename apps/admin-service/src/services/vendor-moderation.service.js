/**
 * vendor-moderation.service.js
 *
 * Orchestrates all admin vendor actions:
 *   1. Calls the Vendor Service's internal/admin API
 *   2. Writes to the central AuditLog
 *   3. Enqueues admin-level outbox events (for notification, etc.)
 *
 * No business logic lives here — the Vendor Service owns the KYC state machine.
 * This service is the governance layer on top.
 */

import { vendorClient }  from '../clients/vendor.client.js';
import { writeAudit }    from './audit.service.js';
import logger            from '../utils/logger.js';

// ─── KYC Workflow ────────────────────────────────────────────────────────────

export async function startVendorReview({ vendorId, adminUser, requestId }) {
  const before = await vendorClient.getVendor(vendorId, { requestId });
  const result = await vendorClient.startReview(vendorId, { requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'VENDOR_REVIEW_STARTED',
    entityType: 'VENDOR',
    entityId:   vendorId,
    before:     before.data,
    after:      result.data,
    requestId,
  });

  logger.info({ msg: 'Admin: vendor review started', vendorId, adminId: adminUser.id });
  return result.data;
}

export async function approveVendorKyc({ vendorId, note, adminUser, requestId }) {
  const before = await vendorClient.getVendor(vendorId, { requestId });
  const result = await vendorClient.approveKyc(vendorId, { note, requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'VENDOR_KYC_APPROVED',
    entityType: 'VENDOR',
    entityId:   vendorId,
    before:     before.data,
    after:      result.data,
    reason:     note ?? 'KYC approved',
    requestId,
  });

  logger.info({ msg: 'Admin: vendor KYC approved', vendorId, adminId: adminUser.id });
  return result.data;
}

export async function rejectVendorKyc({ vendorId, reason, adminUser, requestId }) {
  const before = await vendorClient.getVendor(vendorId, { requestId });
  const result = await vendorClient.rejectKyc(vendorId, { reason, requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'VENDOR_KYC_REJECTED',
    entityType: 'VENDOR',
    entityId:   vendorId,
    before:     before.data,
    after:      result.data,
    reason,
    requestId,
  });

  return result.data;
}

// ─── Suspension ──────────────────────────────────────────────────────────────

export async function suspendVendor({ vendorId, reason, caseId, adminUser, requestId }) {
  const before = await vendorClient.getVendor(vendorId, { requestId });
  const result = await vendorClient.suspendVendor(vendorId, { reason, requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'VENDOR_SUSPENDED',
    entityType: 'VENDOR',
    entityId:   vendorId,
    before:     before.data,
    after:      result.data,
    reason,
    caseId:     caseId ?? null,
    requestId,
  });

  return result.data;
}

export async function unsuspendVendor({ vendorId, adminUser, requestId }) {
  const before = await vendorClient.getVendor(vendorId, { requestId });
  const result = await vendorClient.unsuspendVendor(vendorId, { requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'VENDOR_UNSUSPENDED',
    entityType: 'VENDOR',
    entityId:   vendorId,
    before:     before.data,
    after:      result.data,
    requestId,
  });

  return result.data;
}

// ─── Blacklist ───────────────────────────────────────────────────────────────

export async function blacklistVendor({ vendorId, reason, caseId, adminUser, requestId }) {
  const before = await vendorClient.getVendor(vendorId, { requestId });
  const result = await vendorClient.blacklistVendor(vendorId, { reason, requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'VENDOR_BLACKLISTED',
    entityType: 'VENDOR',
    entityId:   vendorId,
    before:     before.data,
    after:      result.data,
    reason,
    caseId:     caseId ?? null,
    requestId,
  });

  return result.data;
}

// ─── Document Review ─────────────────────────────────────────────────────────

export async function reviewDocument({ documentId, vendorId, status, note, adminUser, requestId }) {
  const result = await vendorClient.reviewDocument(documentId, { status, note, requestId });
  const action = status === 'APPROVED' ? 'VENDOR_DOCUMENT_APPROVED' : 'VENDOR_DOCUMENT_REJECTED';

  await writeAudit({
    adminId:    adminUser.id,
    action,
    entityType: 'VENDOR',
    entityId:   vendorId,
    after:      result.data,
    reason:     note ?? null,
    requestId,
    metadata:   { documentId },
  });

  return result.data;
}

// ─── Blacklist Management ─────────────────────────────────────────────────────

export async function addIdentifierToBlacklist({ type, value, reason, adminUser, requestId }) {
  const result = await vendorClient.addToBlacklist({ type, value, reason, requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'IDENTIFIER_BLACKLISTED',
    entityType: 'VENDOR',
    entityId:   result.data?.id ?? `${type}:${value}`,
    reason,
    requestId,
    metadata:   { type, value },
  });

  return result.data;
}

export async function removeIdentifierFromBlacklist({ type, value, adminUser, requestId }) {
  const result = await vendorClient.removeFromBlacklist({ type, value, requestId });

  await writeAudit({
    adminId:    adminUser.id,
    action:     'IDENTIFIER_UNBLACKLISTED',
    entityType: 'VENDOR',
    entityId:   `${type}:${value}`,
    requestId,
    metadata:   { type, value },
  });

  return result;
}

// ─── Read-through queries ─────────────────────────────────────────────────────

export const listVendors   = (params) => vendorClient.listVendors(params).then((r) => r);
export const getVendor     = (id, ctx) => vendorClient.getVendor(id, ctx).then((r) => r.data);
export const listBlacklist = (params) => vendorClient.listBlacklist(params).then((r) => r);
