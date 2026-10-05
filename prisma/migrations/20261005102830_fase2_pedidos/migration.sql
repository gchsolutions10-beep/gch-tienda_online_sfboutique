-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "localDeliveryArea" TEXT,
ADD COLUMN     "localDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "localDeliveryUsd" DECIMAL(12,2) DEFAULT 3,
ADD COLUMN     "nationalShippingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "nationalShippingUsd" DECIMAL(12,2),
ADD COLUMN     "nextOrderNumber" INTEGER NOT NULL DEFAULT 1001,
ADD COLUMN     "pickupEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pickupInfo" TEXT;

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_events_orderId_createdAt_idx" ON "order_events"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
