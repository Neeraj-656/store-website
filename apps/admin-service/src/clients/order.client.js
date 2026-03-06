/**
 * order.client.js
 *
 * Client for Order Service admin override endpoints.
 * The Order Service exposes internal endpoints for force-cancel and
 * status correction (added in that service's admin extension).
 */

import { internalFetch } from './http.client.js';

const BASE = '/api/v1/orders';

export const orderClient = {
  getOrder: (orderId, { requestId } = {}) =>
    internalFetch('order', 'GET', `${BASE}/internal/${orderId}`, { requestId }),

  forceCancel: (orderId, { reason, adminId, requestId }) =>
    internalFetch('order', 'POST', `${BASE}/internal/${orderId}/force-cancel`, {
      body: { reason, adminId },
      requestId,
    }),

  forceRefund: (orderId, { reason, adminId, requestId }) =>
    internalFetch('order', 'POST', `${BASE}/internal/${orderId}/force-refund`, {
      body: { reason, adminId },
      requestId,
    }),

  overrideStatus: (orderId, { targetStatus, reason, adminId, requestId }) =>
    internalFetch('order', 'PATCH', `${BASE}/internal/${orderId}/status`, {
      body: { targetStatus, reason, adminId },
      requestId,
    }),

  listOrders: ({ customerId, vendorId, status, page = 1, limit = 20, requestId } = {}) => {
    const qs = new URLSearchParams({ page, limit });
    if (customerId) qs.set('customerId', customerId);
    if (vendorId)   qs.set('vendorId',   vendorId);
    if (status)     qs.set('status',     status);
    return internalFetch('order', 'GET', `${BASE}/internal?${qs}`, { requestId });
  },
};
