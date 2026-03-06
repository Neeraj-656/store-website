-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM (
  'PENDING_KYC', 'KYC_SUBMITTED', 'KYC_IN_REVIEW',
  'KYC_APPROVED', 'KYC_REJECTED', 'SUSPENDED', 'BLACKLISTED'
);
CREATE TYPE "DocumentType" AS ENUM (
  'PAN_CARD', 'BUSINESS_PAN', 'GST_CERTIFICATE', 'AADHAAR',
  'BANK_STATEMENT', 'CANCELLED_CHEQUE', 'INCORPORATION_CERTIFICATE', 'ADDRESS_PROOF'
);
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "KycEventType" AS ENUM (
  'SUBMITTED', 'REVIEW_STARTED', 'APPROVED', 'REJECTED',
  'RESUBMITTED', 'SUSPENDED', 'UNSUSPENDED', 'BLACKLISTED'
);

-- Vendor
CREATE TABLE "Vendor" (
  "id"                     TEXT           NOT NULL,
  "userId"                 TEXT           NOT NULL,
  "businessName"           TEXT           NOT NULL,
  "businessType"           TEXT           NOT NULL,
  "businessEmail"          TEXT           NOT NULL,
  "pan"                    TEXT,
  "businessPan"            TEXT,
  "gstin"                  TEXT,
  "bankDetailsEncrypted"   TEXT,
  "bankDetailsIv"          TEXT,
  "bankDetailsTag"         TEXT,
  "status"                 "VendorStatus" NOT NULL DEFAULT 'PENDING_KYC',
  "isActive"               BOOLEAN        NOT NULL DEFAULT false,
  "isIdentityVerified"     BOOLEAN        NOT NULL DEFAULT false,
  "fraudScore"             INTEGER        NOT NULL DEFAULT 0,
  "isFlaggedForReview"     BOOLEAN        NOT NULL DEFAULT false,
  "blacklistReason"        TEXT,
  "suspendedReason"        TEXT,
  "suspendedAt"            TIMESTAMP(3),
  "reviewedBy"             TEXT,
  "reviewedAt"             TIMESTAMP(3),
  "rejectionReason"        TEXT,
  "createdAt"              TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- KycDocument
CREATE TABLE "KycDocument" (
  "id"           TEXT             NOT NULL,
  "vendorId"     TEXT             NOT NULL,
  "type"         "DocumentType"   NOT NULL,
  "status"       "DocumentStatus" NOT NULL DEFAULT 'PENDING',
  "originalName" TEXT             NOT NULL,
  "mimeType"     TEXT             NOT NULL,
  "sizeBytes"    INTEGER          NOT NULL,
  "storagePath"  TEXT             NOT NULL,
  "reviewNote"   TEXT,
  "reviewedBy"   TEXT,
  "reviewedAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)     NOT NULL,
  CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- KycAuditLog
CREATE TABLE "KycAuditLog" (
  "id"          TEXT           NOT NULL,
  "vendorId"    TEXT           NOT NULL,
  "event"       "KycEventType" NOT NULL,
  "fromStatus"  "VendorStatus",
  "toStatus"    "VendorStatus",
  "performedBy" TEXT           NOT NULL,
  "reason"      TEXT,
  "metadata"    JSONB,
  "createdAt"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KycAuditLog_pkey" PRIMARY KEY ("id")
);

-- VendorOutboxEvent
CREATE TABLE "VendorOutboxEvent" (
  "id"          TEXT         NOT NULL,
  "vendorId"    TEXT         NOT NULL,
  "eventType"   TEXT         NOT NULL,
  "payload"     JSONB        NOT NULL,
  "published"   BOOLEAN      NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VendorOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- BlacklistedIdentifier
CREATE TABLE "BlacklistedIdentifier" (
  "id"        TEXT         NOT NULL,
  "type"      TEXT         NOT NULL,
  "value"     TEXT         NOT NULL,
  "reason"    TEXT         NOT NULL,
  "addedBy"   TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlacklistedIdentifier_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "Vendor_userId_key"              ON "Vendor"("userId");
CREATE UNIQUE INDEX "KycDocument_vendorId_type_key"  ON "KycDocument"("vendorId", "type");
CREATE UNIQUE INDEX "BlacklistedIdentifier_type_value_key" ON "BlacklistedIdentifier"("type", "value");

-- Indexes
CREATE INDEX "Vendor_pan_idx"              ON "Vendor"("pan");
CREATE INDEX "Vendor_businessPan_idx"      ON "Vendor"("businessPan");
CREATE INDEX "Vendor_gstin_idx"            ON "Vendor"("gstin");
CREATE INDEX "Vendor_status_idx"           ON "Vendor"("status");
CREATE INDEX "Vendor_isActive_idx"         ON "Vendor"("isActive");
CREATE INDEX "KycDocument_vendorId_idx"    ON "KycDocument"("vendorId");
CREATE INDEX "KycDocument_status_idx"      ON "KycDocument"("status");
CREATE INDEX "KycAuditLog_vendorId_idx"    ON "KycAuditLog"("vendorId");
CREATE INDEX "KycAuditLog_event_idx"       ON "KycAuditLog"("event");
CREATE INDEX "VendorOutboxEvent_published_idx" ON "VendorOutboxEvent"("published");
CREATE INDEX "VendorOutboxEvent_vendorId_idx"  ON "VendorOutboxEvent"("vendorId");
CREATE INDEX "BlacklistedIdentifier_type_idx"  ON "BlacklistedIdentifier"("type");

-- Foreign keys
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KycAuditLog" ADD CONSTRAINT "KycAuditLog_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorOutboxEvent" ADD CONSTRAINT "VendorOutboxEvent_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
