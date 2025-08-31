-- Complete database setup migration
-- This migration installs extensions, creates tables, and sets up advanced features

-- 1. Install required extensions (run once per database)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

-- 2. Create the schema (Prisma will handle this automatically)
-- The tables will be created by Prisma based on your schema.prisma

-- 3. After tables are created, set up advanced features
-- Note: These commands will run after Prisma creates the basic table structure

-- Convert email to CITEXT for case-insensitive email lookups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_pii') THEN
    ALTER TABLE customer_pii
      ALTER COLUMN email TYPE citext USING email::citext;
  END IF;
END$$;

-- Add generated columns for search_text
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    ALTER TABLE "transaction"
      ADD COLUMN IF NOT EXISTS search_text text
      GENERATED ALWAYS AS (
        coalesce(merchant_name,'') || ' ' ||
        coalesce(description,'')   || ' ' ||
        coalesce(counterparty_name,'')
      ) STORED;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_item') THEN
    ALTER TABLE receipt_item
      ADD COLUMN IF NOT EXISTS search_text text
      GENERATED ALWAYS AS (
        coalesce(description,'') || ' ' || coalesce(sku,'')
      ) STORED;
  END IF;
END$$;

-- Add embedding columns (pgvector)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    ALTER TABLE "transaction"
      ADD COLUMN IF NOT EXISTS embedding vector(1536);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_item') THEN
    ALTER TABLE receipt_item
      ADD COLUMN IF NOT EXISTS embedding vector(1536);
  END IF;
END$$;

-- Create partial UNIQUE constraint for provider_txn_id (only when not NULL)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'uq_txn_account_provider_notnull'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX uq_txn_account_provider_notnull
               ON "transaction"(account_id, provider_txn_id)
               WHERE provider_txn_id IS NOT NULL';
    END IF;
  END IF;
END$$;

-- Create GIN indexes on JSON (raw) and vector indexes (IVFFLAT)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    CREATE INDEX IF NOT EXISTS idx_txn_raw_gin
      ON "transaction" USING GIN (raw);
    
    CREATE INDEX IF NOT EXISTS idx_txn_embedding_ivfflat
      ON "transaction" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_item') THEN
    CREATE INDEX IF NOT EXISTS idx_receipt_raw_gin
      ON receipt_item USING GIN (raw);
    
    CREATE INDEX IF NOT EXISTS idx_receipt_embedding_ivfflat
      ON receipt_item USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  END IF;
END$$;

-- Enable Row Level Security (RLS)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account') THEN
    ALTER TABLE account ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    ALTER TABLE "transaction" ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_item') THEN
    ALTER TABLE receipt_item ENABLE ROW LEVEL SECURITY;
  END IF;
END$$;

-- Create RLS policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'account') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'p_account_owner') THEN
      CREATE POLICY p_account_owner ON account
      USING (customer_id = current_setting('app.current_customer_id')::uuid);
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transaction') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'p_txn_owner') THEN
      CREATE POLICY p_txn_owner ON "transaction"
      USING (account_id IN (SELECT id FROM account
                            WHERE customer_id = current_setting('app.current_customer_id')::uuid));
    END IF;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'receipt_item') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'p_receipt_owner') THEN
      CREATE POLICY p_receipt_owner ON receipt_item
      USING (transaction_id IN (
        SELECT t.id FROM "transaction" t
        JOIN account a ON a.id = t.account_id
        WHERE a.customer_id = current_setting('app.current_customer_id')::uuid
      ));
    END IF;
  END IF;
END$$;
