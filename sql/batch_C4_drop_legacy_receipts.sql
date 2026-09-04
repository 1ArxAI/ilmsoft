-- Batch C4: remove the last two tables of the old fee system.
-- Receipts are rendered on the fly from payments / students / parent_balances (PaymentReceipt.tsx)
-- and nothing in the app reads or writes fee_payments or fee_receipts (last rows: 17 Apr 2026).
-- Rollback: sql/rollback/pre_batch_C4_2026-09-04.sql + backups/<stamp>/data/public.{fee_payments,fee_receipts}.json

BEGIN;

DROP TABLE IF EXISTS public.fee_receipts;     -- has the FK to fee_payments, so first
DROP TABLE IF EXISTS public.fee_payments;
DROP FUNCTION IF EXISTS public.generate_receipt_no(uuid);  -- read fee_receipts; no callers

COMMIT;
