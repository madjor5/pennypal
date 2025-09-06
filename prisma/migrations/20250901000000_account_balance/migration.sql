-- CreateTable
CREATE TABLE "account_balance" (
    "accountId" TEXT NOT NULL,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "account_balance_pkey" PRIMARY KEY ("accountId"),
    CONSTRAINT "account_balance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
