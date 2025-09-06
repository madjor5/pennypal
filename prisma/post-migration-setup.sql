-- Advanced database setup (run AFTER Prisma creates the basic tables)
-- This file should be executed manually after running: npx prisma migrate dev

-- 1. Convert email to CITEXT for case-insensitive email lookups
ALTER TABLE customer_pii
  ALTER COLUMN email TYPE citext USING email::citext;

-- 2. Add generated columns for search_text
ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    coalesce(merchant_name,'') || ' ' ||
    coalesce(description,'')   || ' ' ||
    coalesce(counterparty_name,'')
  ) STORED;

ALTER TABLE receipt_item
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    coalesce(description,'') || ' ' || coalesce(sku,'')
  ) STORED;

-- 3. Add embedding columns (pgvector)
ALTER TABLE "transaction"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE receipt_item
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 4. Create partial UNIQUE constraint for provider_txn_id (only when not NULL)
-- Prisma can't define partial constraints, so we do it here:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'uq_txn_account_provider_notnull'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_txn_account_provider_notnull
             ON "transaction"(account_id, provider_txn_id)
             WHERE provider_txn_id IS NOT NULL';
  END IF;
END$$;

-- 5. Create GIN indexes on JSON (raw) and vector indexes (IVFFLAT)
CREATE INDEX IF NOT EXISTS idx_txn_raw_gin
  ON "transaction" USING GIN (raw);

CREATE INDEX IF NOT EXISTS idx_receipt_raw_gin
  ON receipt_item USING GIN (raw);

-- Vector ANN indexes (choose lists based on dataset size)
CREATE INDEX IF NOT EXISTS idx_txn_embedding_ivfflat
  ON "transaction" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_receipt_embedding_ivfflat
  ON receipt_item USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 6. Enable Row Level Security (RLS)
-- App must set: SET app.current_customer_id = '<uuid>';
ALTER TABLE account       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_item  ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
CREATE POLICY p_account_owner ON account
USING (customer_id = current_setting('app.current_customer_id')::uuid);

CREATE POLICY p_txn_owner ON "transaction"
USING (account_id IN (SELECT id FROM account
                      WHERE customer_id = current_setting('app.current_customer_id')::uuid));

CREATE POLICY p_receipt_owner ON receipt_item
USING (transaction_id IN (
  SELECT t.id FROM "transaction" t
  JOIN account a ON a.id = t.account_id
  WHERE a.customer_id = current_setting('app.current_customer_id')::uuid
));

-- 8. Maintain account balances via triggers
CREATE OR REPLACE FUNCTION update_account_balance() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO account_balance("accountId", "balanceMinor")
    VALUES (NEW."accountId",
            CASE WHEN NEW.direction = 'credit' THEN NEW."amountMinor" ELSE -NEW."amountMinor" END)
    ON CONFLICT ("accountId") DO UPDATE
      SET "balanceMinor" = account_balance."balanceMinor" +
        (CASE WHEN NEW.direction = 'credit' THEN NEW."amountMinor" ELSE -NEW."amountMinor" END);
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE account_balance
      SET "balanceMinor" = "balanceMinor" -
        (CASE WHEN OLD.direction = 'credit' THEN OLD."amountMinor" ELSE -OLD."amountMinor" END)
      WHERE "accountId" = OLD."accountId";
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    UPDATE account_balance
      SET "balanceMinor" = "balanceMinor" -
        (CASE WHEN OLD.direction = 'credit' THEN OLD."amountMinor" ELSE -OLD."amountMinor" END)
      WHERE "accountId" = OLD."accountId";
    INSERT INTO account_balance("accountId", "balanceMinor")
    VALUES (NEW."accountId",
            CASE WHEN NEW.direction = 'credit' THEN NEW."amountMinor" ELSE -NEW."amountMinor" END)
    ON CONFLICT ("accountId") DO UPDATE
      SET "balanceMinor" = account_balance."balanceMinor" +
        (CASE WHEN NEW.direction = 'credit' THEN NEW."amountMinor" ELSE -NEW."amountMinor" END);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_account_balance ON "transaction";

CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON "transaction"
FOR EACH ROW EXECUTE FUNCTION update_account_balance();
