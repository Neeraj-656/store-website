-- CreateEnum
CREATE TYPE "StockChangeType" AS ENUM ('RESTOCK', 'SALE', 'ADJUSTMENT', 'RESERVE', 'RELEASE');

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHistory" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "type" "StockChangeType" NOT NULL,
    "reason" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stock_sku_key" ON "Stock"("sku");

-- CreateIndex
CREATE INDEX "Stock_productId_idx" ON "Stock"("productId");

-- CreateIndex
CREATE INDEX "Stock_sku_idx" ON "Stock"("sku");

-- CreateIndex
CREATE INDEX "StockHistory_stockId_createdAt_idx" ON "StockHistory"("stockId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockHistory" ADD CONSTRAINT "StockHistory_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stock"
ADD CONSTRAINT stock_quantity_non_negative
CHECK (quantity >= 0);

ALTER TABLE "Stock"
ADD CONSTRAINT stock_reserved_non_negative
CHECK (reserved >= 0);

ALTER TABLE "Stock"
ADD CONSTRAINT stock_reserved_not_exceed_quantity
CHECK (reserved <= quantity);