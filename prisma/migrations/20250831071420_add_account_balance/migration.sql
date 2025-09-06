-- AlterTable
ALTER TABLE "account" ADD COLUMN "balanceMinor" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing balances
UPDATE "account" a
SET "balanceMinor" = COALESCE((
  SELECT SUM(
    CASE WHEN t."direction" = 'credit' THEN t."amountMinor" ELSE -t."amountMinor" END
  )
  FROM "transaction" t
  WHERE t."accountId" = a."id"
), 0);

-- Function to maintain account balance on changes
CREATE OR REPLACE FUNCTION update_account_balance() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "account"
    SET "balanceMinor" = "balanceMinor" + CASE WHEN NEW."direction" = 'credit' THEN NEW."amountMinor" ELSE -NEW."amountMinor" END
    WHERE "id" = NEW."accountId";
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE "account"
    SET "balanceMinor" = "balanceMinor"
      + CASE WHEN NEW."direction" = 'credit' THEN NEW."amountMinor" ELSE -NEW."amountMinor" END
      - CASE WHEN OLD."direction" = 'credit' THEN OLD."amountMinor" ELSE -OLD."amountMinor" END
    WHERE "id" = NEW."accountId";
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "account"
    SET "balanceMinor" = "balanceMinor" - CASE WHEN OLD."direction" = 'credit' THEN OLD."amountMinor" ELSE -OLD."amountMinor" END
    WHERE "id" = OLD."accountId";
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to keep account balance up to date
DROP TRIGGER IF EXISTS trg_update_account_balance ON "transaction";

CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON "transaction"
FOR EACH ROW EXECUTE FUNCTION update_account_balance();

