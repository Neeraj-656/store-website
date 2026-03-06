/**
 * rate-limit.middleware.js
 *
 * Tiered rate limiters for the auth service.
 *
 * The auth service needs stricter limits than business services because
 * login and password-reset endpoints are primary brute-force targets.
 *
 * Tiers:
 *  - global:     1000 req/15min per IP  — baseline DDoS protection
 *  - auth:        20  req/15min per IP  — login, signup, refresh
 *  - strict:       5  req/15min per IP  — OTP issue, password reset request
 *  - otp:         10  req/10min per IP  — OTP verification (slightly looser)
 */

import rateLimit from 'express-rate-limit';
import config    from '../config/index.js';

function limiter(max, windowMs, message) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
      success: false,
      error:   { code: 'TOO_MANY_REQUESTS', message },
    },
    // Skip rate-limiting for internal service calls
    skip: (req) => !!req.headers['x-internal-service-token'],
  });
}

// 1000 req per 15 min — applies to entire /api/v1/auth prefix
export const globalLimit = limiter(
  1000,
  15 * 60 * 1000,
  'Too many requests from this IP',
);

// 20 req per 15 min — login, signup, token refresh
export const authLimit = limiter(
  config.security.ipLoginMax,
  config.security.ipLoginWindowMs,
  'Too many authentication attempts. Please wait before trying again.',
);

// 5 req per 15 min — password reset request, resend OTP
export const strictLimit = limiter(
  5,
  15 * 60 * 1000,
  'Too many requests. Please wait 15 minutes before trying again.',
);

// 10 req per 10 min — OTP verification
export const otpLimit = limiter(
  10,
  10 * 60 * 1000,
  'Too many OTP verification attempts.',
);
