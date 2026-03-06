/*
  Warnings:

  - The primary key for the `Stock` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Stock` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `Stock` table. All the data in the column will be lost.
  - You are about to drop the column `stockId` on the `StockHistory` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `StockHistory` table. All the data in the column will be lost.
  - Added the required column `quantityAfter` to the `StockHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sku` to the `StockHistory` table without a default value. This is not possible if the table is not empty.
  - Made the column `reason` on table `StockHistory` required. This step will fail if there are existing NULL values in that column.
  - Made the column `source` on table `StockHistory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "StockHistory" DROP CONSTRAINT "StockHistory_stockId_fkey";

-- DropIndex
DROP INDEX "Stock_productId_idx";

-- DropIndex
DROP INDEX "Stock_sku_key";

-- DropIndex
DROP INDEX "StockHistory_stockId_createdAt_idx";

-- AlterTable
ALTER TABLE "Stock" DROP CONSTRAINT "Stock_pkey",
DROP COLUMN "id",
DROP COLUMN "productId",
ADD CONSTRAINT "Stock_pkey" PRIMARY KEY ("sku");

-- AlterTable
ALTER TABLE "StockHistory" DROP COLUMN "stockId",
DROP COLUMN "type",
ADD COLUMN     "quantityAfter" INTEGER NOT NULL,
ADD COLUMN     "reservedAfter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sku" TEXT NOT NULL,
ADD COLUMN     "stockSku" TEXT,
ALTER COLUMN "reason" SET NOT NULL,
ALTER COLUMN "source" SET NOT NULL;

-- CreateTable
CREATE TABLE "ReservationLock" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "processingStartedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processingStartedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationLock_status_expiresAt_processingStartedAt_idx" ON "ReservationLock"("status", "expiresAt", "processingStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationLock_orderId_sku_key" ON "ReservationLock"("orderId", "sku");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_processingStartedAt_idx" ON "OutboxEvent"("status", "createdAt", "processingStartedAt");

-- AddForeignKey
ALTER TABLE "ReservationLock" ADD CONSTRAINT "ReservationLock_sku_fkey" FOREIGN KEY ("sku") REFERENCES "Stock"("sku") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_stockSku_fkey" FOREIGN KEY ("stockSku") REFERENCES "Stock"("sku") ON DELETE SET NULL ON UPDATE CASCADE;
