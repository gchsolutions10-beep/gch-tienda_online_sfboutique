-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CreditApplicationStatus" AS ENUM ('WAITING_GUARANTOR', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CreditPlanStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "creditEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditGraceDays" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "creditLateFeeUsd" DECIMAL(12,2) NOT NULL DEFAULT 5,
ADD COLUMN     "creditMaxLevel1Usd" DECIMAL(12,2) NOT NULL DEFAULT 100,
ADD COLUMN     "creditMaxLevel2Usd" DECIMAL(12,2) NOT NULL DEFAULT 250,
ADD COLUMN     "creditMaxLevel3Usd" DECIMAL(12,2) NOT NULL DEFAULT 500,
ADD COLUMN     "creditOneOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "creditUpgradeAfter" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "creditVipAfter" INTEGER NOT NULL DEFAULT 6;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "accountCreatedAt" TIMESTAMP(3),
ADD COLUMN     "creditLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "creditLevelManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creditLevelNote" TEXT,
ADD COLUMN     "creditStatus" "CreditStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "isCredit" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_applications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CreditApplicationStatus" NOT NULL DEFAULT 'WAITING_GUARANTOR',
    "fullName" TEXT NOT NULL,
    "idType" "IdType" NOT NULL,
    "idNumber" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "idPhotoKey" TEXT,
    "guarantorName" TEXT NOT NULL,
    "guarantorIdType" "IdType" NOT NULL,
    "guarantorIdNumber" TEXT NOT NULL,
    "guarantorPhone" TEXT NOT NULL,
    "guarantorPhotoKey" TEXT,
    "guarantorToken" TEXT NOT NULL,
    "guarantorAcceptedAt" TIMESTAMP(3),
    "guarantorIp" TEXT,
    "guarantorUserAgent" TEXT,
    "contractVersion" TEXT NOT NULL,
    "contractHash" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "acceptIp" TEXT,
    "acceptUserAgent" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_plans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "applicationId" TEXT,
    "level" INTEGER NOT NULL,
    "downPaymentUsd" DECIMAL(12,2) NOT NULL,
    "financedUsd" DECIMAL(12,2) NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "status" "CreditPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "wentLate" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_installments" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountUsd" DECIMAL(12,2) NOT NULL,
    "lateFeeUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lateFeeAt" TIMESTAMP(3),
    "paidUsd" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "remindedBeforeAt" TIMESTAMP(3),
    "remindedDueAt" TIMESTAMP(3),
    "remindedLateAt" TIMESTAMP(3),

    CONSTRAINT "credit_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_tokenHash_key" ON "customer_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "customer_sessions_customerId_idx" ON "customer_sessions"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_applications_guarantorToken_key" ON "credit_applications"("guarantorToken");

-- CreateIndex
CREATE INDEX "credit_applications_tenantId_status_createdAt_idx" ON "credit_applications"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "credit_applications_customerId_idx" ON "credit_applications"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_plans_orderId_key" ON "credit_plans"("orderId");

-- CreateIndex
CREATE INDEX "credit_plans_tenantId_status_idx" ON "credit_plans"("tenantId", "status");

-- CreateIndex
CREATE INDEX "credit_plans_customerId_idx" ON "credit_plans"("customerId");

-- CreateIndex
CREATE INDEX "credit_installments_dueDate_idx" ON "credit_installments"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "credit_installments_planId_number_key" ON "credit_installments"("planId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_tenantId_customerId_idx" ON "push_subscriptions"("tenantId", "customerId");

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_plans" ADD CONSTRAINT "credit_plans_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_plans" ADD CONSTRAINT "credit_plans_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_plans" ADD CONSTRAINT "credit_plans_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "credit_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "credit_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

