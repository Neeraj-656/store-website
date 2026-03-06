/**
 * admin.controller.js
 *
 * All admin action handlers in one file — keeps routing simple.
 * Each handler extracts params, delegates to a service, returns a clean response.
 *
 * Issue 13 fix: added parsePagination() helper that caps the limit at
 * config.pagination.maxLimit (100). Previously, passing ?limit=999999 would
 * trigger a full-table scan on every paginated endpoint.
 */

import * as vendorMod   from '../services/vendor-moderation.service.js';
import * as productMod  from '../services/product-moderation.service.js';
import * as orderOvr    from '../services/order-override.service.js';
import * as caseService from '../services/moderation-case.service.js';
import * as reporting   from '../services/reporting.service.js';
import * as adminUsers  from '../services/admin-user.service.js';
import { getAuditLog }  from '../services/audit.service.js';
import config  from '../config/index.js';
import logger  from '../utils/logger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ctx = (req) => ({ adminUser: req.adminUser, requestId: req.requestId });

/**
 * Safely parse page/limit query params, enforcing the configured maximum.
 * Callers can no longer trigger a full-table scan with ?limit=999999.
 */
const parsePagination = (q) => ({
  page:  Math.max(1, +q.page  || 1),
  limit: Math.min(+q.limit || config.pagination.defaultLimit, config.pagination.maxLimit),
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboard(req, res, next) {
  try {
    const summary = await reporting.getDashboardSummary();
    return res.json({ success: true, data: summary });
  } catch (err) { next(err); }
}

// ─── VENDOR MODERATION ────────────────────────────────────────────────────────

export async function listVendors(req, res, next) {
  try {
    const { status, flagged } = req.query;
    const result = await vendorMod.listVendors({
      status,
      flagged: flagged === 'true' ? true : flagged === 'false' ? false : undefined,
      ...parsePagination(req.query),
      requestId: req.requestId,
    });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getVendor(req, res, next) {
  try {
    const vendor = await vendorMod.getVendor(req.params.vendorId, { requestId: req.requestId });
    return res.json({ success: true, data: vendor });
  } catch (err) { next(err); }
}

export async function startVendorReview(req, res, next) {
  try {
    const data = await vendorMod.startVendorReview({ vendorId: req.params.vendorId, ...ctx(req) });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function approveVendorKyc(req, res, next) {
  try {
    const data = await vendorMod.approveVendorKyc({ vendorId: req.params.vendorId, note: req.body.note, ...ctx(req) });
    logger.info({ msg: 'KYC approved', vendorId: req.params.vendorId, requestId: req.requestId });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function rejectVendorKyc(req, res, next) {
  try {
    const data = await vendorMod.rejectVendorKyc({ vendorId: req.params.vendorId, reason: req.body.reason, ...ctx(req) });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function suspendVendor(req, res, next) {
  try {
    const data = await vendorMod.suspendVendor({
      vendorId: req.params.vendorId, reason: req.body.reason, caseId: req.body.caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function unsuspendVendor(req, res, next) {
  try {
    const data = await vendorMod.unsuspendVendor({ vendorId: req.params.vendorId, ...ctx(req) });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function blacklistVendor(req, res, next) {
  try {
    const data = await vendorMod.blacklistVendor({
      vendorId: req.params.vendorId, reason: req.body.reason, caseId: req.body.caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function reviewDocument(req, res, next) {
  try {
    const { status, note } = req.body;
    const data = await vendorMod.reviewDocument({
      documentId: req.params.documentId,
      vendorId:   req.body.vendorId,
      status, note, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function addIdentifierToBlacklist(req, res, next) {
  try {
    const data = await vendorMod.addIdentifierToBlacklist({ ...req.body, ...ctx(req) });
    return res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function removeIdentifierFromBlacklist(req, res, next) {
  try {
    await vendorMod.removeIdentifierFromBlacklist({ ...req.body, ...ctx(req) });
    return res.json({ success: true, message: 'Removed from blacklist' });
  } catch (err) { next(err); }
}

export async function listBlacklist(req, res, next) {
  try {
    const result = await vendorMod.listBlacklist({ ...req.query, requestId: req.requestId });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

// ─── PRODUCT MODERATION ───────────────────────────────────────────────────────

export async function getProduct(req, res, next) {
  try {
    const data = await productMod.getProduct(req.params.productId, { requestId: req.requestId });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function suspendProduct(req, res, next) {
  try {
    const { vendorId, expectedVersion, reason, caseId } = req.body;
    const data = await productMod.suspendProduct({
      productId: req.params.productId, vendorId, expectedVersion, reason, caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function restoreProduct(req, res, next) {
  try {
    const { vendorId, expectedVersion, targetStatus, reason, caseId } = req.body;
    const data = await productMod.restoreProduct({
      productId: req.params.productId, vendorId, expectedVersion, targetStatus, reason, caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function archiveProduct(req, res, next) {
  try {
    const { vendorId, expectedVersion, reason, caseId } = req.body;
    const data = await productMod.archiveProduct({
      productId: req.params.productId, vendorId, expectedVersion, reason, caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── ORDER OVERRIDES ──────────────────────────────────────────────────────────

export async function forceCancel(req, res, next) {
  try {
    const data = await orderOvr.forceCancel({
      orderId: req.params.orderId, reason: req.body.reason, caseId: req.body.caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function forceRefund(req, res, next) {
  try {
    const data = await orderOvr.forceRefund({
      orderId: req.params.orderId, reason: req.body.reason, caseId: req.body.caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function overrideOrderStatus(req, res, next) {
  try {
    const { targetStatus, reason, caseId } = req.body;
    const data = await orderOvr.overrideOrderStatus({
      orderId: req.params.orderId, targetStatus, reason, caseId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function listOrderOverrides(req, res, next) {
  try {
    const { orderId, type } = req.query;
    const result = await orderOvr.listOrderOverrides({
      orderId, adminId: undefined, type, ...parsePagination(req.query),
    });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

// ─── MODERATION CASES ─────────────────────────────────────────────────────────

export async function listCases(req, res, next) {
  try {
    const { entityType, entityId, status, priority, category, assignedToId } = req.query;
    const result = await caseService.listCases({
      entityType, entityId, status, priority, category, assignedToId,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createCase(req, res, next) {
  try {
    const newCase = await caseService.openCase({ ...req.body, adminUser: req.adminUser, requestId: req.requestId });
    return res.status(201).json({ success: true, data: newCase });
  } catch (err) { next(err); }
}

export async function getCaseById(req, res, next) {
  try {
    const data = await caseService.getCaseById(req.params.caseId);
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function assignCase(req, res, next) {
  try {
    const data = await caseService.assignCase({
      caseId: req.params.caseId, assignToAdminId: req.body.adminId, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function resolveCase(req, res, next) {
  try {
    const data = await caseService.resolveCase({
      caseId: req.params.caseId, resolution: req.body.resolution, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function dismissCase(req, res, next) {
  try {
    const data = await caseService.dismissCase({
      caseId: req.params.caseId, resolution: req.body.resolution, ...ctx(req),
    });
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function addCaseNote(req, res, next) {
  try {
    const data = await caseService.addCaseNote({
      caseId: req.params.caseId, ...req.body, adminUser: req.adminUser,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

// ─── REPORTING ────────────────────────────────────────────────────────────────

export async function getVendorStats(req, res, next) {
  try {
    const data = await reporting.getVendorModerationStats(req.query);
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getProductStats(req, res, next) {
  try {
    const data = await reporting.getProductModerationStats(req.query);
    return res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getOrderOverrideReport(req, res, next) {
  try {
    const data = await reporting.getOrderOverrideStats(req.query);
    return res.json({ success: true, ...data });
  } catch (err) { next(err); }
}

export async function getAuditReport(req, res, next) {
  try {
    const { adminId, entityType, action, from, to } = req.query;
    const result = await reporting.getAuditReport({
      adminId, entityType, action, from, to,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getCaseReport(req, res, next) {
  try {
    const result = await reporting.getCaseReport(req.query);
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getAuditLogForEntity(req, res, next) {
  try {
    const { entityType, entityId } = req.params;
    const result = await getAuditLog({ entityType, entityId, ...parsePagination(req.query) });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

// ─── ADMIN USER MANAGEMENT ────────────────────────────────────────────────────

export async function listAdminUsers(req, res, next) {
  try {
    const { role, isActive } = req.query;
    const result = await adminUsers.listAdminUsers({
      role,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      ...parsePagination(req.query),
    });
    return res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createAdminUser(req, res, next) {
  try {
    const admin = await adminUsers.createAdminUser({ ...req.body, ...ctx(req) });
    return res.status(201).json({ success: true, data: admin });
  } catch (err) { next(err); }
}

export async function updateAdminRole(req, res, next) {
  try {
    const admin = await adminUsers.updateAdminRole({
      targetAdminId: req.params.adminId, role: req.body.role, ...ctx(req),
    });
    return res.json({ success: true, data: admin });
  } catch (err) { next(err); }
}

export async function deactivateAdmin(req, res, next) {
  try {
    const admin = await adminUsers.deactivateAdmin({ targetAdminId: req.params.adminId, ...ctx(req) });
    return res.json({ success: true, data: admin });
  } catch (err) { next(err); }
}
