-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('DRAFT', 'OPEN', 'IN_PROCESS', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRequestStatus" AS ENUM ('PENDING_REVIEW', 'REJECTED', 'QUOTED', 'ACCEPTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "importCommissionPct" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "importDepositPct" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "importsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "importDepositUsd" DECIMAL(12,2),
ADD COLUMN     "isImport" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "estimatedArrival" TIMESTAMP(3),
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sourceStore" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "imageUrl" TEXT,
    "estimatedPriceUsd" DECIMAL(12,2),
    "sizes" TEXT,
    "colors" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "batchId" TEXT,
    "productId" TEXT,
    "status" "ImportRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "sourceUrl" TEXT NOT NULL,
    "sourceStore" TEXT NOT NULL,
    "title" TEXT,
    "photoKey" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "unitCostUsd" DECIMAL(12,2),
    "freightUsd" DECIMAL(12,2),
    "commissionUsd" DECIMAL(12,2),
    "totalUsd" DECIMAL(12,2),
    "depositUsd" DECIMAL(12,2),
    "quoteNote" TEXT,
    "quotedAt" TIMESTAMP(3),
    "quotedByName" TEXT,
    "rejectReason" TEXT,
    "adminNote" TEXT,
    "orderId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_tenantId_status_idx" ON "import_batches"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_tenantId_slug_key" ON "import_batches"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "import_products_tenantId_batchId_isPublished_idx" ON "import_products"("tenantId", "batchId", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "import_requests_orderId_key" ON "import_requests"("orderId");

-- CreateIndex
CREATE INDEX "import_requests_tenantId_status_createdAt_idx" ON "import_requests"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "import_requests_customerId_idx" ON "import_requests"("customerId");

-- CreateIndex
CREATE INDEX "import_requests_productId_idx" ON "import_requests"("productId");

-- CreateIndex
CREATE INDEX "import_reviews_tenantId_isApproved_idx" ON "import_reviews"("tenantId", "isApproved");

-- CreateIndex
CREATE UNIQUE INDEX "import_reviews_batchId_customerId_key" ON "import_reviews"("batchId", "customerId");

-- AddForeignKey
ALTER TABLE "import_products" ADD CONSTRAINT "import_products_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_requests" ADD CONSTRAINT "import_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_requests" ADD CONSTRAINT "import_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_requests" ADD CONSTRAINT "import_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "import_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_requests" ADD CONSTRAINT "import_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_reviews" ADD CONSTRAINT "import_reviews_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_reviews" ADD CONSTRAINT "import_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

