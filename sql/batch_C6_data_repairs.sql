-- Batch C6: data repairs confirmed by the owner on 2026-09-05.
-- 1. Muhammad Usman (real school): the Rs 900 entered twice on 4 May 2026. The credit of the first copy was
--    intentionally deleted on 8 May, but that copy still carries the May allocation and the surviving copy has none.
--    Remove the duplicate payment row and re-point the May allocation to the surviving payment. Balance unchanged.
-- 2. parents.opening_balance held the March 2026 fee from the pre-ledger system. It is not used by the app and
--    was never posted to the ledger (the ledger starts 13 April 2026). Clear it so it cannot be mistaken for a debt.
-- Rollback: sql/rollback/pre_batch_C6_2026-09-05.sql

BEGIN;

-- 1a. duplicate payment (kept: 73b5ebdb-007e-4f04-b95d-0682615c9cf7, removed: dd67bee9-4653-42e9-8180-907fde40ae4a)
DELETE FROM public.payment_allocations WHERE payment_id = 'dd67bee9-4653-42e9-8180-907fde40ae4a';
DELETE FROM public.payments            WHERE id         = 'dd67bee9-4653-42e9-8180-907fde40ae4a';

-- 1b. the surviving payment now covers May
INSERT INTO public.payment_allocations (payment_id, student_monthly_fee_id, allocated_amount)
SELECT '73b5ebdb-007e-4f04-b95d-0682615c9cf7', f.id, 900
FROM public.student_monthly_fees f
JOIN public.payments p ON p.parent_id = f.parent_id
WHERE p.id = '73b5ebdb-007e-4f04-b95d-0682615c9cf7' AND f.month = '2026-05';

-- 2. stale pre-ledger "opening balance" values (never in the ledger)
UPDATE public.parents SET opening_balance = 0
WHERE opening_balance <> 0
  AND NOT EXISTS (SELECT 1 FROM public.ledger l WHERE l.parent_id = parents.id AND l.reference_type = 'opening_balance');

COMMIT;
