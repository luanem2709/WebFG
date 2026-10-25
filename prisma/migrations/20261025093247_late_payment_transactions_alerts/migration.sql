-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentReceivedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "paymentTransactionId" TEXT;
ALTER TABLE "Order" ADD COLUMN "refundDaysDeducted" INTEGER;
ALTER TABLE "Order" ADD COLUMN "refundedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "reviewReason" TEXT;
ALTER TABLE "Order" ADD COLUMN "revokeAckAt" DATETIME;

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gatewayName" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderCode" TEXT,
    "amount" INTEGER NOT NULL,
    "rawContentHash" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL DEFAULT 'received'
);

-- CreateTable
CREATE TABLE "AlertState" (
    "type" TEXT NOT NULL PRIMARY KEY,
    "lastSentAt" DATETIME NOT NULL,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "pendingSummary" TEXT
);

-- CreateIndex
CREATE INDEX "PaymentTransaction_orderId_idx" ON "PaymentTransaction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_gatewayName_transactionId_key" ON "PaymentTransaction"("gatewayName", "transactionId");
