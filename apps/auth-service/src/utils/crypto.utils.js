/**
 * crypto.utils.js
 *
 * All cryptographic primitives used by the auth service.
 * Centralised here so algorithms are never scattered across the codebase.
 */

import crypto from 'crypto';
import bcrypt  from 'bcryptjs';
import config  from '../config/index.js';

// ─── Password hashing ────────────────────────────────────────────────────────

export async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcrypt.rounds);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ─── OTP generation + hashing ────────────────────────────────────────────────
// Raw 6-digit code is sent to user; only the bcrypt hash is persisted.

export function generateOtp() {
  // Cryptographically secure random 6-digit code
  const bytes = crypto.randomBytes(3);
  const num   = (bytes.readUIntBE(0, 3) % 1_000_000);
  return String(num).padStart(6, '0');
}

export async function hashOtp(raw) {
  // bcrypt with low rounds (8) — OTP is short-lived, latency matters
  return bcrypt.hash(raw, 8);
}

export async function verifyOtp(raw, hash) {
  return bcrypt.compare(raw, hash);
}

// ─── Token hashing ───────────────────────────────────────────────────────────
// Refresh tokens are random bytes; store only their SHA-256 hash.

export function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ─── JTI (JWT ID) ────────────────────────────────────────────────────────────
// Unique identifier embedded in every access token for denylist lookups.

export function generateJti() {
  return crypto.randomUUID();
}

// ─── Family ID ───────────────────────────────────────────────────────────────
// Groups refresh tokens from a single login session for theft detection.

export function generateFamily() {
  return crypto.randomUUID();
}
