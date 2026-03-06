/**
 * catalog.client.js
 *
 * Client for Catalog Service product moderation.
 *
 * Note: The Catalog Service uses x-vendor-id header for vendor identity on its
 * vendor-scoped routes. For admin actions, we pass the product's vendorId as that header.
 * The internal service token authorises the call regardless.
 */

import config from '../config/index.js';
import { DownstreamError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const BASE = '/api/v1/products';

async function catalogFetch(method, path, { body, vendorId, requestId } = {}) {
  const url = `${config.services.catalog}${path}`;
  const headers = {
    'Content-Type':             'application/json',
    'x-internal-service-token': config.internalToken,
    ...(vendorId   && { 'x-vendor-id':   vendorId }),
    ...(requestId  && { 'x-request-id':  requestId }),
  };

  logger.debug({ msg: `→ catalog ${method} ${path}`, requestId });

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (err) {
    throw new DownstreamError('catalog', 503, `Service unreachable: ${err.message}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new DownstreamError('catalog', 502, `Non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    throw new DownstreamError('catalog', res.status, data?.error?.message ?? `HTTP ${res.status}`);
  }

  return data;
}

export const catalogClient = {
  // Admin suspends a fraudulent/policy-violating listing
  suspendProduct: (productId, { vendorId, expectedVersion, reason, requestId }) =>
    catalogFetch('PATCH', `${BASE}/vendor/${productId}/status`, {
      body: { newStatus: 'SUSPENDED', expectedVersion, reason },
      vendorId,
      requestId,
    }),

  // Admin restores a previously suspended listing
  restoreProduct: (productId, { vendorId, expectedVersion, targetStatus = 'ACTIVE', reason, requestId }) =>
    catalogFetch('PATCH', `${BASE}/vendor/${productId}/status`, {
      body: { newStatus: targetStatus, expectedVersion, reason },
      vendorId,
      requestId,
    }),

  // Admin permanently archives a listing
  archiveProduct: (productId, { vendorId, expectedVersion, reason, requestId }) =>
    catalogFetch('PATCH', `${BASE}/vendor/${productId}/status`, {
      body: { newStatus: 'ARCHIVED', expectedVersion, reason },
      vendorId,
      requestId,
    }),

  // Get public product details (for moderation review)
  getProduct: (productId, { requestId } = {}) =>
    catalogFetch('GET', `${BASE}/public/${productId}`, { requestId }),
};
