-- OPTIONAL: run ONCE, only if you connected banks before this update and they appear as separate accounts in Wallet.
-- Run setup.sql first. This moves their transactions and balances into your main account and removes the extra accounts.
DO $$
DECLARE r RECORD; main_id TEXT; acc_bal NUMERIC; acc_name TEXT;
BEGIN
  FOR r IN SELECT "id", "userId", "accountId" FROM "BankConnection" LOOP
    SELECT "id" INTO main_id FROM "Account" WHERE "userId" = r."userId" AND "isMain" LIMIT 1;
    IF main_id IS NOT NULL AND main_id <> r."accountId" THEN
      SELECT "balance", "name" INTO acc_bal, acc_name FROM "Account" WHERE "id" = r."accountId";
      UPDATE "Transaction" SET "accountId" = main_id WHERE "accountId" = r."accountId";
      UPDATE "BankConnection" SET "accountId" = main_id, "balance" = acc_bal, "label" = COALESCE("label", acc_name) WHERE "id" = r."id";
      UPDATE "Account" SET "balance" = "balance" + acc_bal WHERE "id" = main_id;
      DELETE FROM "Account" WHERE "id" = r."accountId";
    END IF;
  END LOOP;
END $$;
