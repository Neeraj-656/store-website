import * as kycService from '../services/kyc.service.js';
import * as documentService from '../services/document.service.js';
import * as blacklistService from '../services/blacklist.service.js';
import { decrypt } from '../utils/crypto.js';
import logger from '../utils/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

// Strip sensitive encrypted fields before sending to client
function sanitizeVendor(vendor) {
  const { bankDetailsEncrypted, bankDetailsIv, bankDetailsTag, ...safe } = vendor;
  return safe;
}

// ─── Vendor Registration ──────────────────────────────────────────────────

export async function registerVendor(req, res, next) {
  try {
    const { businessName, businessType, businessEmail } = req.body;
    const userId = req.user.id;

    const vendor = await kycService.registerVendor({ userId, businessName, businessType, businessEmail });

    return res.status(201).json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── Get My Vendor Profile ─────────────────────────────────────────────────

export async function getMyProfile(req, res, next) {
  try {
    const vendor = await kycService.getVendorByUserId(req.user.id);
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── Submit KYC ───────────────────────────────────────────────────────────

export async function submitKyc(req, res, next) {
  try {
    const vendor = await kycService.getVendorByUserId(req.user.id);
    const { pan, businessPan, gstin, bankDetails } = req.body;

    const result = await kycService.submitKyc({
      vendorId: vendor.id,
      pan,
      businessPan,
      gstin,
      bankDetails,
    });

    logger.info({ msg: 'KYC submitted', vendorId: vendor.id, requestId: req.requestId });
    return res.json({ success: true, data: sanitizeVendor(result.vendor), meta: { fraudScore: result.fraudScore, isFlagged: result.isFlagged } });
  } catch (err) {
    next(err);
  }
}

// ─── Upload Document ──────────────────────────────────────────────────────

export async function uploadDocument(req, res, next) {
  try {
    const vendor = await kycService.getVendorByUserId(req.user.id);
    const { type } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const doc = await documentService.uploadDocument({ vendorId: vendor.id, type, file: req.file });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

// ─── List My Documents ────────────────────────────────────────────────────

export async function listMyDocuments(req, res, next) {
  try {
    const vendor = await kycService.getVendorByUserId(req.user.id);
    const docs = await documentService.listDocuments(vendor.id);
    return res.json({ success: true, data: docs });
  } catch (err) {
    next(err);
  }
}

// ─── Get Bank Details (vendor sees their own, decrypted) ──────────────────

export async function getMyBankDetails(req, res, next) {
  try {
    const vendor = await kycService.getVendorByUserId(req.user.id);

    if (!vendor.bankDetailsEncrypted) {
      return res.json({ success: true, data: null });
    }

    const bankDetails = decrypt(
      vendor.bankDetailsEncrypted,
      vendor.bankDetailsIv,
      vendor.bankDetailsTag,
    );

    // Mask the account number — show only last 4 digits
    const masked = {
      ...bankDetails,
      accountNumber: `${'*'.repeat(bankDetails.accountNumber.length - 4)}${bankDetails.accountNumber.slice(-4)}`,
    };

    return res.json({ success: true, data: masked });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: List Vendors ───────────────────────────────────────────────────

export async function listVendors(req, res, next) {
  try {
    const { status, flagged, page, limit } = req.query;
    const isFlagged = flagged === 'true' ? true : flagged === 'false' ? false : undefined;

    const result = await kycService.listVendors({
      status,
      isFlagged,
      page: parseInt(page ?? '1', 10),
      limit: parseInt(limit ?? '20', 10),
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Get Vendor by ID ───────────────────────────────────────────────

export async function getVendorById(req, res, next) {
  try {
    const vendor = await kycService.getVendorById(req.params.vendorId);
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Start Review ──────────────────────────────────────────────────

export async function startReview(req, res, next) {
  try {
    const vendor = await kycService.startReview({ vendorId: req.params.vendorId, adminId: req.user.id });
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Approve KYC ───────────────────────────────────────────────────

export async function approveKyc(req, res, next) {
  try {
    const vendor = await kycService.approveKyc({
      vendorId: req.params.vendorId,
      adminId: req.user.id,
      note: req.body.note,
    });
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Reject KYC ────────────────────────────────────────────────────

export async function rejectKyc(req, res, next) {
  try {
    const vendor = await kycService.rejectKyc({
      vendorId: req.params.vendorId,
      adminId: req.user.id,
      reason: req.body.reason,
    });
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Suspend Vendor ────────────────────────────────────────────────

export async function suspendVendor(req, res, next) {
  try {
    const vendor = await kycService.suspendVendor({
      vendorId: req.params.vendorId,
      adminId: req.user.id,
      reason: req.body.reason,
    });
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Unsuspend Vendor ──────────────────────────────────────────────

export async function unsuspendVendor(req, res, next) {
  try {
    const vendor = await kycService.unsuspendVendor({ vendorId: req.params.vendorId, adminId: req.user.id });
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Blacklist Vendor ──────────────────────────────────────────────

export async function blacklistVendor(req, res, next) {
  try {
    const vendor = await kycService.blacklistVendor({
      vendorId: req.params.vendorId,
      adminId: req.user.id,
      reason: req.body.reason,
    });
    return res.json({ success: true, data: sanitizeVendor(vendor) });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Review Document ───────────────────────────────────────────────

export async function reviewDocument(req, res, next) {
  try {
    const { status, note } = req.body;
    const doc = await documentService.reviewDocument({
      documentId: req.params.documentId,
      status,
      note,
      adminId: req.user.id,
    });
    return res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
}

// ─── ADMIN: Blacklist management ──────────────────────────────────────────

export async function addToBlacklist(req, res, next) {
  try {
    const { type, value, reason } = req.body;
    const entry = await blacklistService.addToBlacklist({ type, value, reason, adminId: req.user.id });
    return res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
}

export async function removeFromBlacklist(req, res, next) {
  try {
    const { type, value } = req.body;
    await blacklistService.removeFromBlacklist({ type, value, adminId: req.user.id });
    return res.json({ success: true, message: 'Removed from blacklist' });
  } catch (err) {
    next(err);
  }
}

export async function listBlacklist(req, res, next) {
  try {
    const result = await blacklistService.listBlacklist({
      type: req.query.type,
      page: parseInt(req.query.page ?? '1', 10),
      limit: parseInt(req.query.limit ?? '20', 10),
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ─── INTERNAL: Check if vendor can sell ───────────────────────────────────

export async function checkVendorCanSell(req, res, next) {
  try {
    const result = await kycService.checkVendorCanSell(req.params.vendorId);
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
