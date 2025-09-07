ALTER TABLE "transaction"
  ADD COLUMN balance_after_minor INTEGER NOT NULL DEFAULT 0;

-- Backfill balance_after_minor using existing account balances
WITH tx AS (
  SELECT
    t.id,
    t.account_id,
    t.booked_at,
    t.direction,
    t.amount_minor,
    SUM(CASE WHEN t.direction = 'credit' THEN t.amount_minor ELSE -t.amount_minor END)
      OVER (PARTITION BY t.account_id ORDER BY t.booked_at DESC, t.id DESC) AS running_after,
    CASE WHEN t.direction = 'credit' THEN t.amount_minor ELSE -t.amount_minor END AS delta
  FROM "transaction" t
)
UPDATE "transaction" AS t
SET balance_after_minor = a.balance_minor - (tx.running_after - tx.delta)
FROM tx
JOIN account a ON a.id = tx.account_id
WHERE t.id = tx.id;
