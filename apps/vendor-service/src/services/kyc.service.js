// kyc.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Owns the full KYC state machine:
//
//   PENDING_KYC → KYC_SUBMITTED → KYC_IN_REVIEW → KYC_APPROVED
//                                               → KYC_REJECTED → (resubmit)
//   KYC_APPROVED → SUSPENDED → KYC_APPROVED (unsuspend)
//   Any → BLACKLISTED
//
// State changes are always written atomically with an audit log entry and
// an outbox event in a single DB transaction.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from '../../prisma/client.js';
import { encrypt } from '../utils/crypto.js';
import { computeFraudScore } from './risk.service.js';
import logger from '../utils/logger.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';

// ─── Internal helpers ─────────────────────────────────────────────────────

async function auditLog(tx, vendorId, event, fromStatus, toStatus, performedBy, reason, metadata) {
  await tx.kycAuditLog.create({
    data: {
      vendorId,
      event,
      fromStatus: fromStatus ?? undefined,
      toStatus: toStatus ?? undefined,
      performedBy,
      reason: reason ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

async function enqueueEvent(tx, vendorId, eventType, payload) {
  await tx.vendorOutboxEvent.create({
    data: { vendorId, eventType, payload },
  });
}

// ─── Register Vendor ──────────────────────────────────────────────────────
//
// Called once per vendor after they sign up in Auth Service.
// Creates the Vendor profile in PENDING_KYC state.

export async function registerVendor({ userId, businessName, businessType, businessEmail }) {
  const existing = await prisma.vendor.findUnique({ where: { userId } });
  if (existing) throw new ConflictError('A vendor profile already exists for this user');

  const vendor = await prisma.vendor.create({
    data: { userId, businessName, businessType, businessEmail, status: 'PENDING_KYC' },
  });

  logger.info({ msg: 'Vendor registered', vendorId: vendor.id, userId });
  return vendor;
}

// ─── Submit KYC ───────────────────────────────────────────────────────────
//
// Vendor submits their compliance identifiers and bank details.
// 1. Validate PAN/GSTIN format (done at schema level via Zod)
// 2. Encrypt bank details with AES-256-GCM
// 3. Run fraud scoring
// 4. Transition to KYC_SUBMITTED (or flag if score is high)

export async function submitKyc({ vendorId, pan, businessPan, gstin, bankDetails }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');
  if (vendor.status === 'BLACKLISTED') throw new ForbiddenError('This vendor account is blacklisted');
  if (vendor.status === 'KYC_APPROVED') throw new ConflictError('KYC is already approved');
  if (vendor.status === 'KYC_IN_REVIEW') throw new ConflictError('KYC is currently under review');
  if (vendor.status === 'SUSPENDED') throw new ForbiddenError('Account is suspended');

  // Encrypt bank details — never store plaintext
  const { ciphertext, iv, tag } = encrypt(bankDetails);

  // Compute fraud score before persisting
  const { score, flags, isFlagged } = await computeFraudScore({
    vendorId,
    pan,
    gstin,
    businessEmail: vendor.businessEmail,
    businessType: vendor.businessType,
  });

  const fromStatus = vendor.status;

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        pan: pan.toUpperCase(),
        businessPan: businessPan?.toUpperCase() ?? undefined,
        gstin: gstin.toUpperCase(),
        bankDetailsEncrypted: ciphertext,
        bankDetailsIv: iv,
        bankDetailsTag: tag,
        status: 'KYC_SUBMITTED',
        fraudScore: score,
        isFlaggedForReview: isFlagged,
      },
    });

    await auditLog(
      tx, vendorId, 'SUBMITTED', fromStatus, 'KYC_SUBMITTED',
      vendorId, null,
      { fraudScore: score, flags, isFlagged },
    );

    return v;
  });

  logger.info({ msg: 'KYC submitted', vendorId, fraudScore: score, isFlagged });
  return { vendor: updated, fraudScore: score, flags, isFlagged };
}

// ─── Start Review ─────────────────────────────────────────────────────────
//
// Admin picks up a submission for review.
// Prevents two admins reviewing the same vendor simultaneously.

export async function startReview({ vendorId, adminId }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');
  if (vendor.status !== 'KYC_SUBMITTED') {
    throw new ConflictError(`Vendor is in status ${vendor.status}, expected KYC_SUBMITTED`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: { status: 'KYC_IN_REVIEW', reviewedBy: adminId },
    });

    await auditLog(tx, vendorId, 'REVIEW_STARTED', 'KYC_SUBMITTED', 'KYC_IN_REVIEW', adminId);

    return v;
  });

  logger.info({ msg: 'KYC review started', vendorId, adminId });
  return updated;
}

// ─── Approve KYC ─────────────────────────────────────────────────────────
//
// Admin approves after verifying all documents and identifiers.
// Sets isActive = true and isIdentityVerified = true.
// Publishes vendor.kyc.approved event.

export async function approveKyc({ vendorId, adminId, note }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');

  if (!['KYC_IN_REVIEW', 'KYC_SUBMITTED'].includes(vendor.status)) {
    throw new ConflictError(`Cannot approve vendor in status: ${vendor.status}`);
  }

  // All documents must be approved before KYC can be approved
  const pendingDocs = await prisma.kycDocument.count({
    where: { vendorId, status: 'PENDING' },
  });
  if (pendingDocs > 0) {
    throw new AppError(400, `${pendingDocs} document(s) are still pending review`, 'DOCUMENTS_PENDING');
  }

  const fromStatus = vendor.status;

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: 'KYC_APPROVED',
        isActive: true,
        isIdentityVerified: true,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: null,
      },
    });

    await auditLog(tx, vendorId, 'APPROVED', fromStatus, 'KYC_APPROVED', adminId, note);

    await enqueueEvent(tx, vendorId, 'vendor.kyc.approved', {
      vendorId,
      userId: v.userId,
      businessName: v.businessName,
      businessType: v.businessType,
      gstin: v.gstin,
      approvedBy: adminId,
      approvedAt: new Date().toISOString(),
    });

    return v;
  });

  logger.info({ msg: 'KYC approved', vendorId, adminId });
  return updated;
}

// ─── Reject KYC ──────────────────────────────────────────────────────────
//
// Admin rejects with a mandatory reason.
// Vendor can resubmit after addressing the issues.
// Publishes vendor.kyc.rejected event.

export async function rejectKyc({ vendorId, adminId, reason }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');

  if (!['KYC_IN_REVIEW', 'KYC_SUBMITTED'].includes(vendor.status)) {
    throw new ConflictError(`Cannot reject vendor in status: ${vendor.status}`);
  }

  const fromStatus = vendor.status;

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: 'KYC_REJECTED',
        isActive: false,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await auditLog(tx, vendorId, 'REJECTED', fromStatus, 'KYC_REJECTED', adminId, reason);

    await enqueueEvent(tx, vendorId, 'vendor.kyc.rejected', {
      vendorId,
      userId: v.userId,
      businessName: v.businessName,
      reason,
      rejectedBy: adminId,
      rejectedAt: new Date().toISOString(),
    });

    return v;
  });

  logger.info({ msg: 'KYC rejected', vendorId, adminId, reason });
  return updated;
}

// ─── Suspend Vendor ───────────────────────────────────────────────────────
//
// Suspends an active vendor. They cannot sell but are not permanently banned.
// Publishes vendor.suspended event.

export async function suspendVendor({ vendorId, adminId, reason }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');
  if (vendor.status === 'SUSPENDED') throw new ConflictError('Vendor is already suspended');
  if (vendor.status === 'BLACKLISTED') throw new ConflictError('Vendor is blacklisted, not suspended');

  const fromStatus = vendor.status;

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: 'SUSPENDED',
        isActive: false,
        suspendedReason: reason,
        suspendedAt: new Date(),
      },
    });

    await auditLog(tx, vendorId, 'SUSPENDED', fromStatus, 'SUSPENDED', adminId, reason);

    await enqueueEvent(tx, vendorId, 'vendor.suspended', {
      vendorId,
      userId: v.userId,
      businessName: v.businessName,
      reason,
      suspendedBy: adminId,
      suspendedAt: new Date().toISOString(),
    });

    return v;
  });

  logger.info({ msg: 'Vendor suspended', vendorId, adminId, reason });
  return updated;
}

// ─── Unsuspend Vendor ─────────────────────────────────────────────────────

export async function unsuspendVendor({ vendorId, adminId }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');
  if (vendor.status !== 'SUSPENDED') throw new ConflictError('Vendor is not currently suspended');

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: 'KYC_APPROVED',
        isActive: true,
        suspendedReason: null,
        suspendedAt: null,
      },
    });

    await auditLog(tx, vendorId, 'UNSUSPENDED', 'SUSPENDED', 'KYC_APPROVED', adminId);

    return v;
  });

  logger.info({ msg: 'Vendor unsuspended', vendorId, adminId });
  return updated;
}

// ─── Blacklist Vendor ─────────────────────────────────────────────────────
//
// Permanent ban. Cannot be reversed via API — requires DB intervention.
// Publishes vendor.suspended (reuses same consumer channel — notifies all downstream).

export async function blacklistVendor({ vendorId, adminId, reason }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');
  if (vendor.status === 'BLACKLISTED') throw new ConflictError('Vendor is already blacklisted');

  const fromStatus = vendor.status;

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id: vendorId },
      data: {
        status: 'BLACKLISTED',
        isActive: false,
        isIdentityVerified: false,
        blacklistReason: reason,
      },
    });

    await auditLog(tx, vendorId, 'BLACKLISTED', fromStatus, 'BLACKLISTED', adminId, reason);

    await enqueueEvent(tx, vendorId, 'vendor.suspended', {
      vendorId,
      userId: v.userId,
      businessName: v.businessName,
      reason,
      blacklisted: true,
      blacklistedBy: adminId,
      blacklistedAt: new Date().toISOString(),
    });

    return v;
  });

  logger.info({ msg: 'Vendor blacklisted', vendorId, adminId, reason });
  return updated;
}

// ─── Get Vendor ───────────────────────────────────────────────────────────

export async function getVendorById(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      documents: true,
      auditLog: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!vendor) throw new NotFoundError('Vendor');
  return vendor;
}

export async function getVendorByUserId(userId) {
  const vendor = await prisma.vendor.findUnique({
    where: { userId },
    include: { documents: true },
  });
  if (!vendor) throw new NotFoundError('Vendor');
  return vendor;
}

// ─── List Vendors (Admin) ─────────────────────────────────────────────────

export async function listVendors({ status, isFlagged, page = 1, limit = 20 }) {
  const where = {
    ...(status ? { status } : {}),
    ...(isFlagged !== undefined ? { isFlaggedForReview: isFlagged } : {}),
  };

  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { documents: { select: { type: true, status: true } } },
    }),
    prisma.vendor.count({ where }),
  ]);

  return { data: vendors, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
}

// ─── Check if vendor can sell ─────────────────────────────────────────────
//
// Used by Catalog/Order services via internal endpoint.
// Vendor can sell only if KYC_APPROVED AND isActive AND isIdentityVerified.

export async function checkVendorCanSell(vendorId) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { status: true, isActive: true, isIdentityVerified: true },
  });

  if (!vendor) return { canSell: false, reason: 'Vendor not found' };

  const canSell = vendor.status === 'KYC_APPROVED' && vendor.isActive && vendor.isIdentityVerified;

  return {
    canSell,
    reason: canSell ? null : `Vendor status: ${vendor.status}, active: ${vendor.isActive}`,
  };
}
