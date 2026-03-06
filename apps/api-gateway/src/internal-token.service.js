/**
 * internal-token.service.js — API Gateway
 *
 * Issue 5 fix — Static internal service token anti-pattern
 *
 * The problem with a single shared static INTERNAL_SERVICE_TOKEN:
 *   - If ANY downstream service is compromised, the attacker extracts the
 *     token and can call admin-service, payment-service, etc. directly,
 *     bypassing the gateway entirely.
 *   - The token never expires, so the blast radius lasts forever.
 *   - There is no per-caller identity — the payment-service cannot tell
 *     whether a request came from the gateway or a rogue vendor-service.
 *
 * Fix — short-lived, asymmetrically signed service JWTs:
 *   - The gateway holds a private key (INTERNAL_SIGNING_KEY_PRIVATE) and
 *     signs a JWT with: iss=api-gateway, aud=<target-service>, exp=60s.
 *   - Each downstream service holds only the corresponding PUBLIC key
 *     (INTERNAL_SIGNING_KEY_PUBLIC). It can verify the JWT but not mint one.
 *   - If a service is compromised the attacker gets the public key, which
 *     is useless for forging tokens.
 *   - Each token is scoped to a specific audience (admin-service, etc.) so
 *     a stolen in-flight token can only be replayed to one target.
 *   - Tokens expire in 60 seconds, limiting the replay window.
 *
 * Key generation (run once, store in secrets manager):
 *   node -e "
 *     const { generateKeyPairSync } = require('crypto');
 *     const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
 *     console.log('PRIVATE:', privateKey.export({ type:'pkcs8', format:'pem' }));
 *     console.log('PUBLIC:',  publicKey.export({ type:'spki',  format:'pem' }));
 *   "
 *
 * Required package: jsonwebtoken (already in package.json)
 */

import jwt from 'jsonwebtoken';
import logger from './utils/logger.js';

// Loaded once at startup from the env / secrets manager.
const PRIVATE_KEY    = process.env.INTERNAL_SIGNING_KEY_PRIVATE ?? '';
const ISSUER         = 'api-gateway';
const TOKEN_TTL_SECS = 60; // short-lived to limit replay window

// Cache tokens per audience for their remaining TTL to avoid signing a new
// token on every single proxied request (adds ~1 ms per call otherwise).
const tokenCache = new Map(); // audienceServiceName → { token, expiresAt }

/**
 * Returns a short-lived signed JWT for service-to-service calls.
 * The token is cached until 5 seconds before it expires.
 *
 * @param {string} audience - Target service name, e.g. 'admin-service'
 * @returns {string} Signed JWT
 */
export function getServiceToken(audience) {
  if (!PRIVATE_KEY) {
    // Graceful fallback for local dev without keys configured.
    // In production the gateway config validates INTERNAL_SIGNING_KEY_PRIVATE is set.
    logger.warn({ msg: 'INTERNAL_SIGNING_KEY_PRIVATE not set — skipping service token injection', audience });
    return '';
  }

  const cached = tokenCache.get(audience);
  const now    = Math.floor(Date.now() / 1000);

  // Reuse the cached token if it expires more than 5 s in the future.
  if (cached && cached.expiresAt > now + 5) {
    return cached.token;
  }

  const token = jwt.sign(
    { iss: ISSUER, aud: audience },
    PRIVATE_KEY,
    {
      algorithm: 'ES256',
      expiresIn: TOKEN_TTL_SECS,
    },
  );

  tokenCache.set(audience, { token, expiresAt: now + TOKEN_TTL_SECS });
  return token;
}
