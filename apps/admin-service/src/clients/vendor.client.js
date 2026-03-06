/**
 * vendor.client.js
 *
 * Typed client for the Vendor Service's admin + internal endpoints.
 * The Admin Service is the only caller of these internal endpoints.
 */

import { internalFetch } from './http.client.js';

const BASE = '/api/v1/vendors';

export const vendorClient = {
  // ── KYC Review ─────────────────────────────────────────────────────────

  startReview: (vendorId, { requestId } = {}) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/${vendorId}/review/start`, { requestId }),

  approveKyc: (vendorId, { note, requestId } = {}) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/${vendorId}/review/approve`, {
      body: { note },
      requestId,
    }),

  rejectKyc: (vendorId, { reason, requestId }) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/${vendorId}/review/reject`, {
      body: { reason },
      requestId,
    }),

  // ── Suspension / Blacklist ──────────────────────────────────────────────

  suspendVendor: (vendorId, { reason, requestId }) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/${vendorId}/suspend`, {
      body: { reason },
      requestId,
    }),

  unsuspendVendor: (vendorId, { requestId } = {}) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/${vendorId}/unsuspend`, { requestId }),

  blacklistVendor: (vendorId, { reason, requestId }) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/${vendorId}/blacklist`, {
      body: { reason },
      requestId,
    }),

  // ── Document Review ─────────────────────────────────────────────────────

  reviewDocument: (documentId, { status, note, requestId }) =>
    internalFetch('vendor', 'PATCH', `${BASE}/admin/documents/${documentId}`, {
      body: { status, note },
      requestId,
    }),

  // ── Queries ─────────────────────────────────────────────────────────────

  getVendor: (vendorId, { requestId } = {}) =>
    internalFetch('vendor', 'GET', `${BASE}/admin/${vendorId}`, { requestId }),

  listVendors: ({ status, flagged, page = 1, limit = 20, requestId } = {}) => {
    const qs = new URLSearchParams({ page, limit });
    if (status) qs.set('status', status);
    if (flagged !== undefined) qs.set('flagged', String(flagged));
    return internalFetch('vendor', 'GET', `${BASE}/admin?${qs}`, { requestId });
  },

  // ── Blacklist Management ─────────────────────────────────────────────────

  addToBlacklist: ({ type, value, reason, requestId }) =>
    internalFetch('vendor', 'POST', `${BASE}/admin/blacklist`, {
      body: { type, value, reason },
      requestId,
    }),

  removeFromBlacklist: ({ type, value, requestId }) =>
    internalFetch('vendor', 'DELETE', `${BASE}/admin/blacklist`, {
      body: { type, value },
      requestId,
    }),

  listBlacklist: ({ type, page = 1, limit = 20, requestId } = {}) => {
    const qs = new URLSearchParams({ page, limit });
    if (type) qs.set('type', type);
    return internalFetch('vendor', 'GET', `${BASE}/admin/blacklist?${qs}`, { requestId });
  },

  // ── Internal Check ──────────────────────────────────────────────────────

  canSell: (vendorId, { requestId } = {}) =>
    internalFetch('vendor', 'GET', `${BASE}/internal/${vendorId}/can-sell`, { requestId }),
};
