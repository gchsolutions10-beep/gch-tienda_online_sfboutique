-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "igtfBaseUsd" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "igtfBase" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "buyerEmail" TEXT,
ADD COLUMN     "concept" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "igtfBaseVes" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "lines" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX "invoices_orderId_idx" ON "invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_controlNumber_key" ON "invoices"("tenantId", "controlNumber");

