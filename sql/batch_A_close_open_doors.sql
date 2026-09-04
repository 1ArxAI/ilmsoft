-- Batch A: close the open doors found in the 2026-09-04 audit.
-- Rollback: sql/rollback/pre_batch_A_2026-09-04.sql
-- Apply as one transaction. No app code depends on anything removed here.

BEGIN;

-- ------------------------------------------------------------------
-- A1. payment_allocations: row security was OFF (anon could read/delete all rows)
-- ------------------------------------------------------------------
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- Members of the school that received the payment may read its allocations.
DROP POLICY IF EXISTS school_member_select_payment_allocations ON public.payment_allocations;
CREATE POLICY school_member_select_payment_allocations
  ON public.payment_allocations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.id = payment_allocations.payment_id
      AND p.school_id IN (SELECT public.user_school_ids())
  ));

-- No INSERT/UPDATE/DELETE policies: only the trigger below writes this table.
REVOKE ALL ON public.payment_allocations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_allocations FROM authenticated;

-- The trigger that allocates a payment used to run as the calling user; with RLS on
-- it must run as the function owner or every payment insert would fail.
CREATE OR REPLACE FUNCTION public.trg_payment_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_rem_amount NUMERIC(10,2);
    v_fee_row    RECORD;
    v_allocated  NUMERIC(10,2);
    v_already_paid NUMERIC(10,2);
BEGIN
    INSERT INTO ledger (
        school_id, parent_id, entry_type, amount,
        reference_type, reference_id, description, created_by
    ) VALUES (
        NEW.school_id, NEW.parent_id, 'credit', NEW.received_amount,
        'payment', NEW.id, 'Payment received', NEW.received_by
    );

    v_rem_amount := NEW.received_amount;

    FOR v_fee_row IN
        SELECT f.id, f.net_amount,
               COALESCE(SUM(a.allocated_amount), 0) AS paid_so_far
        FROM student_monthly_fees f
        LEFT JOIN payment_allocations a ON a.student_monthly_fee_id = f.id
        WHERE f.parent_id = NEW.parent_id
        GROUP BY f.id, f.net_amount, f.month
        HAVING COALESCE(SUM(a.allocated_amount), 0) < f.net_amount
        ORDER BY f.month ASC
    LOOP
        EXIT WHEN v_rem_amount <= 0;
        v_already_paid := v_fee_row.paid_so_far;
        v_allocated := LEAST(v_rem_amount, v_fee_row.net_amount - v_already_paid);
        IF v_allocated > 0 THEN
            INSERT INTO payment_allocations (payment_id, student_monthly_fee_id, allocated_amount)
            VALUES (NEW.id, v_fee_row.id, v_allocated);
            v_rem_amount := v_rem_amount - v_allocated;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;
-- Trigger functions are never called directly; nobody needs EXECUTE.
REVOKE EXECUTE ON FUNCTION public.trg_payment_to_ledger() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------
-- A2. credit_requests: anyone could UPDATE any request; buyer set credits/amount/status
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS admin_can_update_credit_requests ON public.credit_requests;

-- A school may only create a *pending* request for itself.
DROP POLICY IF EXISTS "Schools can create requests" ON public.credit_requests;
CREATE POLICY "Schools can create requests"
  ON public.credit_requests FOR INSERT
  WITH CHECK (
    status = 'pending'
    AND auth.uid() IN (SELECT s.user_id FROM public.schools s WHERE s.id = credit_requests.school_id)
  );

-- Credits and price must be one of the two published plans (README: 30/Rs2000, 100/Rs5000).
ALTER TABLE public.credit_requests
  DROP CONSTRAINT IF EXISTS credit_requests_plan_check;
ALTER TABLE public.credit_requests
  ADD CONSTRAINT credit_requests_plan_check CHECK (
    (credits = 30  AND amount_pkr = 2000) OR
    (credits = 100 AND amount_pkr = 5000)
  );

-- ------------------------------------------------------------------
-- A3. schools: owners could set their own total_credits / credit_expires_at
-- ------------------------------------------------------------------
REVOKE UPDATE ON public.schools FROM anon, authenticated;
GRANT UPDATE (school_name, contact, email, address, logo_url,
              primary_color, secondary_color, tertiary_color)
  ON public.schools TO authenticated;

-- ------------------------------------------------------------------
-- A4. Functions callable by anyone with the public key, unused by the app
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.deduct_daily_credits();
DROP FUNCTION IF EXISTS public.promote_students(uuid, uuid, uuid);
REVOKE EXECUTE ON FUNCTION public.get_unpaid_months_summary(uuid, text) FROM PUBLIC, anon, authenticated;

COMMIT;
