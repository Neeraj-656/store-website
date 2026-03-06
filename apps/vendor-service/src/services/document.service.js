// document.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Manages KYC document upload, storage metadata, and admin review.
// Only stores file metadata in the DB — the actual file is on disk (or S3).
// storagePath is never returned to the client — only the document ID and status.
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import fs from 'fs/promises';
import prisma from '../../prisma/client.js';
import logger from '../utils/logger.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';
import config from '../config/index.js';

// MIME types we accept for KYC documents
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export function isAllowedMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

// ─── Upload Document ──────────────────────────────────────────────────────
//
// Saves document metadata to DB after multer has written the file to disk.
// Uses upsert so re-uploading a document type replaces the old entry.

export async function uploadDocument({ vendorId, type, file }) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) throw new NotFoundError('Vendor');

  if (vendor.status === 'BLACKLISTED') {
    throw new ForbiddenError('Blacklisted vendors cannot upload documents');
  }
  if (vendor.status === 'KYC_APPROVED') {
    throw new ConflictError('KYC is already approved. Contact support to update documents.');
  }
  if (vendor.status === 'KYC_IN_REVIEW') {
    throw new ConflictError('Documents cannot be changed while KYC is under review');
  }

  if (!isAllowedMimeType(file.mimetype)) {
    // Delete the already-written file since we're rejecting it
    await fs.unlink(file.path).catch(() => {});
    throw new Error(`File type ${file.mimetype} is not allowed`);
  }

  // Upsert — one document per type per vendor
  const doc = await prisma.kycDocument.upsert({
    where: { vendorId_type: { vendorId, type } },
    create: {
      vendorId,
      type,
      status: 'PENDING',
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: file.path,
    },
    update: {
      status: 'PENDING',
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      storagePath: file.path,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
    },
  });

  logger.info({ msg: 'Document uploaded', vendorId, type, docId: doc.id });

  // Strip server-side path before returning
  const { storagePath: _, ...safeDoc } = doc;
  return safeDoc;
}

// ─── List Documents for a Vendor ─────────────────────────────────────────

export async function listDocuments(vendorId) {
  const docs = await prisma.kycDocument.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'asc' },
  });

  // Never return storagePath
  return docs.map(({ storagePath: _, ...d }) => d);
}

// ─── Admin: Review Document ───────────────────────────────────────────────

export async function reviewDocument({ documentId, status, note, adminId }) {
  const doc = await prisma.kycDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new NotFoundError('Document');

  const updated = await prisma.kycDocument.update({
    where: { id: documentId },
    data: {
      status,
      reviewNote: note ?? null,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    },
  });

  logger.info({ msg: 'Document reviewed', documentId, status, adminId });

  const { storagePath: _, ...safeDoc } = updated;
  return safeDoc;
}
