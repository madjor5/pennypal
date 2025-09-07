ALTER TABLE "transaction"
  ADD COLUMN balance_after_minor INTEGER NOT NULL DEFAULT 0;

-- Backfill balance_after_minor using existing account balances
WITH tx AS (
  SELECT
    t.id,
    t."accountId",
    t."bookedAt",
    t.direction,
    t."amountMinor",
    SUM(CASE WHEN t.direction = 'credit' THEN t."amountMinor" ELSE -t."amountMinor" END)
      OVER (PARTITION BY t."accountId" ORDER BY t."bookedAt" DESC, t.id DESC) AS running_after,
    CASE WHEN t.direction = 'credit' THEN t."amountMinor" ELSE -t."amountMinor" END AS delta
  FROM "transaction" t
)
UPDATE "transaction" AS t
SET balance_after_minor = a."balanceMinor" - (tx.running_after - tx.delta)
FROM tx
JOIN account a ON a.id = tx."accountId"
WHERE t.id = tx.id;
