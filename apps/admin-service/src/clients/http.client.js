/**
 * http.client.js
 *
 * Thin wrapper around the native fetch API for internal service-to-service calls.
 * All downstream requests carry:
 *   - x-internal-service-token  → service auth
 *   - x-request-id              → distributed tracing
 *   - Content-Type: application/json
 */

import config from '../config/index.js';
import { DownstreamError } from '../utils/errors.js';
import logger from '../utils/logger.js';

export async function internalFetch(service, method, path, { body, requestId } = {}) {
  const baseUrl = config.services[service];
  if (!baseUrl) throw new Error(`Unknown downstream service: ${service}`);

  const url = `${baseUrl}${path}`;
  const headers = {
    'Content-Type':             'application/json',
    'x-internal-service-token': config.internalToken,
    ...(requestId && { 'x-request-id': requestId }),
  };

  logger.debug({ msg: `→ ${service} ${method} ${path}`, requestId });

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (err) {
    logger.error({ msg: `Network error calling ${service}`, path, err });
    throw new DownstreamError(service, 503, `Service unreachable: ${err.message}`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new DownstreamError(service, 502, `Non-JSON response from ${service} (${res.status})`);
  }

  if (!res.ok) {
    const message = data?.error?.message ?? data?.message ?? `HTTP ${res.status}`;
    logger.warn({ msg: `Downstream error from ${service}`, path, status: res.status, message });
    throw new DownstreamError(service, res.status, message);
  }

  return data;
}
