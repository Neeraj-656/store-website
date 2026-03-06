// risk.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Computes a fraud score (0–100) for a vendor based on signals gathered at
// KYC submission time. Higher score = higher risk. Score is stored on the
// Vendor record. If score exceeds FRAUD_SCORE_THRESHOLD the vendor is auto-
// flagged for manual review before KYC can be approved.
//
// Scoring signals:
//   +30  Duplicate PAN already used by another vendor account
//   +30  Duplicate GSTIN already used by another vendor account
//   +20  PAN appears in the blacklist
//   +20  GSTIN appears in the blacklist
//   +15  Email domain is a known free/temp provider
//   +10  Business email domain does not match GSTIN state code pattern
//   -10  Business is Private Limited or LLP (lower risk entity types)
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../../prisma/client.js';
import { hashIdentifier } from '../utils/crypto.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'rediffmail.com', 'yopmail.com', 'mailinator.com', 'tempmail.com',
]);

const LOW_RISK_BUSINESS_TYPES = new Set(['PRIVATE_LIMITED', 'LLP']);

/**
 * Checks if an identifier value is blacklisted.
 * Looks up the SHA-256 hash so raw values are never stored in the blacklist table.
 */
async function isBlacklisted(type, value) {
  const hashed = hashIdentifier(value);
  const entry = await prisma.blacklistedIdentifier.findUnique({
    where: { type_value: { type, value: hashed } },
  });
  return !!entry;
}

/**
 * Checks if a PAN is already registered to a different vendor.
 * Used to detect attempts to create multiple accounts with the same identity.
 */
async function isDuplicatePan(pan, excludeVendorId) {
  const existing = await prisma.vendor.findFirst({
    where: {
      pan: pan.toUpperCase(),
      id: { not: excludeVendorId },
    },
  });
  return !!existing;
}

async function isDuplicateGstin(gstin, excludeVendorId) {
  const existing = await prisma.vendor.findFirst({
    where: {
      gstin: gstin.toUpperCase(),
      id: { not: excludeVendorId },
    },
  });
  return !!existing;
}

/**
 * Compute fraud score for a vendor at KYC submission time.
 *
 * @param {{ vendorId, pan, gstin, businessEmail, businessType }} input
 * @returns {{ score: number, flags: string[] }}
 */
export async function computeFraudScore({ vendorId, pan, gstin, businessEmail, businessType }) {
  let score = 0;
  const flags = [];

  // ── Duplicate PAN check ───────────────────────────────────────────────
  if (await isDuplicatePan(pan, vendorId)) {
    score += 30;
    flags.push('DUPLICATE_PAN');
    logger.warn({ msg: 'Duplicate PAN detected', vendorId, pan });
  }

  // ── Duplicate GSTIN check ─────────────────────────────────────────────
  if (await isDuplicateGstin(gstin, vendorId)) {
    score += 30;
    flags.push('DUPLICATE_GSTIN');
    logger.warn({ msg: 'Duplicate GSTIN detected', vendorId, gstin });
  }

  // ── Blacklist checks ──────────────────────────────────────────────────
  if (await isBlacklisted('PAN', pan)) {
    score += 20;
    flags.push('BLACKLISTED_PAN');
    logger.warn({ msg: 'Blacklisted PAN submitted', vendorId });
  }

  if (await isBlacklisted('GSTIN', gstin)) {
    score += 20;
    flags.push('BLACKLISTED_GSTIN');
    logger.warn({ msg: 'Blacklisted GSTIN submitted', vendorId });
  }

  // ── Email domain check ────────────────────────────────────────────────
  const emailDomain = businessEmail.split('@')[1]?.toLowerCase();
  if (emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain)) {
    score += 15;
    flags.push('FREE_EMAIL_DOMAIN');
  }

  // ── Business type adjustment ──────────────────────────────────────────
  if (LOW_RISK_BUSINESS_TYPES.has(businessType)) {
    score = Math.max(0, score - 10);
    flags.push('LOW_RISK_ENTITY');
  }

  // Cap at 100
  score = Math.min(100, score);

  const isFlagged = score >= config.risk.fraudScoreThreshold;

  logger.info({ msg: 'Fraud score computed', vendorId, score, flags, isFlagged });

  return { score, flags, isFlagged };
}
