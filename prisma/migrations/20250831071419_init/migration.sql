-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('checking', 'savings', 'credit_card', 'loan', 'budget', 'investment');

-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('pending', 'booked', 'cancelled', 'reversed');

-- CreateEnum
CREATE TYPE "TxnDirection" AS ENUM ('debit', 'credit');

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_pii" (
    "customer_id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "city" TEXT,
    "consentJson" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pii_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT,
    "providerAccountId" TEXT,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "iban" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "bookedAt" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "direction" "TxnDirection" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currencyCode" CHAR(3) NOT NULL,
    "description" TEXT,
    "merchantName" TEXT,
    "merchantMcc" INTEGER,
    "counterpartyIban" TEXT,
    "counterpartyName" TEXT,
    "categoryId" TEXT,
    "status" "TxnStatus" NOT NULL DEFAULT 'booked',
    "isInternalTransfer" BOOLEAN NOT NULL DEFAULT false,
    "transferGroup" TEXT,
    "providerTxnId" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "search_text" TEXT,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_item" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "sku" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unitPriceMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "vatRate" DECIMAL(5,2),
    "categoryId" TEXT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "search_text" TEXT,

    CONSTRAINT "receipt_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_pii_email_key" ON "customer_pii"("email");

-- CreateIndex
CREATE INDEX "account_customerId_idx" ON "account"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "account_customerId_provider_providerAccountId_key" ON "account"("customerId", "provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "transaction_accountId_bookedAt_idx" ON "transaction"("accountId", "bookedAt" DESC);

-- CreateIndex
CREATE INDEX "transaction_status_idx" ON "transaction"("status");

-- CreateIndex
CREATE INDEX "receipt_item_transactionId_idx" ON "receipt_item"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_item_transactionId_lineNo_key" ON "receipt_item"("transactionId", "lineNo");

-- AddForeignKey
ALTER TABLE "customer_pii" ADD CONSTRAINT "customer_pii_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_item" ADD CONSTRAINT "receipt_item_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
