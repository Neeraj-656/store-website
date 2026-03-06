-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'MODERATOR', 'FINANCE_ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('VENDOR_REVIEW_STARTED', 'VENDOR_KYC_APPROVED', 'VENDOR_KYC_REJECTED', 'VENDOR_SUSPENDED', 'VENDOR_UNSUSPENDED', 'VENDOR_BLACKLISTED', 'VENDOR_DOCUMENT_APPROVED', 'VENDOR_DOCUMENT_REJECTED', 'IDENTIFIER_BLACKLISTED', 'IDENTIFIER_UNBLACKLISTED', 'PRODUCT_SUSPENDED', 'PRODUCT_RESTORED', 'PRODUCT_ARCHIVED', 'ORDER_FORCE_CANCELLED', 'ORDER_FORCE_REFUNDED', 'ORDER_STATUS_OVERRIDDEN', 'REVIEW_REJECTED', 'REVIEW_RESTORED', 'CASE_OPENED', 'CASE_ASSIGNED', 'CASE_RESOLVED', 'CASE_DISMISSED', 'ADMIN_CREATED', 'ADMIN_ROLE_CHANGED', 'ADMIN_DEACTIVATED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('VENDOR', 'PRODUCT', 'ORDER', 'REVIEW', 'PAYOUT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CaseCategory" AS ENUM ('FRAUD_REPORT', 'POLICY_VIOLATION', 'COUNTERFEIT_LISTING', 'MISLEADING_DESCRIPTION', 'PROHIBITED_ITEM', 'PAYMENT_DISPUTE', 'REVIEW_MANIPULATION', 'VENDOR_COMPLAINT', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderOverrideType" AS ENUM ('FORCE_CANCEL', 'FORCE_REFUND', 'STATUS_CORRECTION');

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'MODERATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "metadata" JSONB,
    "caseId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entitySnapshot" JSONB,
    "category" "CaseCategory" NOT NULL,
    "priority" "CasePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedBy" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedToId" TEXT,
    "openedById" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderOverride" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "type" "OrderOverrideType" NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "caseId" TEXT,
    "success" BOOLEAN NOT NULL,
    "serviceResponse" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminOutboxEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedMessage" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_userId_key" ON "AdminUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_userId_idx" ON "AdminUser"("userId");

-- CreateIndex
CREATE INDEX "AdminUser_role_idx" ON "AdminUser"("role");

-- CreateIndex
CREATE INDEX "AdminUser_isActive_idx" ON "AdminUser"("isActive");

-- CreateIndex
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_caseId_idx" ON "AuditLog"("caseId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModerationCase_caseNumber_key" ON "ModerationCase"("caseNumber");

-- CreateIndex
CREATE INDEX "ModerationCase_entityType_entityId_idx" ON "ModerationCase"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ModerationCase_status_idx" ON "ModerationCase"("status");

-- CreateIndex
CREATE INDEX "ModerationCase_priority_status_idx" ON "ModerationCase"("priority", "status");

-- CreateIndex
CREATE INDEX "ModerationCase_assignedToId_idx" ON "ModerationCase"("assignedToId");

-- CreateIndex
CREATE INDEX "ModerationCase_createdAt_idx" ON "ModerationCase"("createdAt");

-- CreateIndex
CREATE INDEX "CaseNote_caseId_idx" ON "CaseNote"("caseId");

-- CreateIndex
CREATE INDEX "OrderOverride_orderId_idx" ON "OrderOverride"("orderId");

-- CreateIndex
CREATE INDEX "OrderOverride_adminId_idx" ON "OrderOverride"("adminId");

-- CreateIndex
CREATE INDEX "OrderOverride_type_idx" ON "OrderOverride"("type");

-- CreateIndex
CREATE INDEX "AdminOutboxEvent_published_idx" ON "AdminOutboxEvent"("published");

-- CreateIndex
CREATE INDEX "AdminOutboxEvent_caseId_idx" ON "AdminOutboxEvent"("caseId");

-- CreateIndex
CREATE INDEX "AdminOutboxEvent_publishedAt_idx" ON "AdminOutboxEvent"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedMessage_messageId_key" ON "ProcessedMessage"("messageId");

-- CreateIndex
CREATE INDEX "ProcessedMessage_processedAt_idx" ON "ProcessedMessage"("processedAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseNote" ADD CONSTRAINT "CaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminOutboxEvent" ADD CONSTRAINT "AdminOutboxEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
