-- ROLLBACK SNAPSHOT for Batch A, taken 2026-09-04T15:23:27.065Z
-- Re-running this file restores the pre-Batch-A state of the objects Batch A touches.
-- Generated read-only from the live catalog; review before use.


-- ===== payment_allocations =====
ALTER TABLE public.payment_allocations DISABLE ROW LEVEL SECURITY;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_allocations TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_allocations TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.payment_allocations TO service_role;
-- column-level privileges present (40) -- unusual, see below
-- anon:allocated_amount:INSERT anon:allocated_amount:REFERENCES anon:allocated_amount:SELECT anon:allocated_amount:UPDATE anon:created_at:INSERT anon:created_at:REFERENCES anon:created_at:SELECT anon:created_at:UPDATE anon:id:INSERT anon:id:REFERENCES anon:id:SELECT anon:id:UPDATE anon:payment_id:INSERT anon:payment_id:REFERENCES anon:payment_id:SELECT anon:payment_id:UPDATE anon:student_monthly_fee_id:INSERT anon:student_monthly_fee_id:REFERENCES anon:student_monthly_fee_id:SELECT anon:student_monthly_fee_id:UPDATE authenticated:allocated_amount:INSERT authenticated:allocated_amount:REFERENCES authenticated:allocated_amount:SELECT authenticated:allocated_amount:UPDATE authenticated:created_at:INSERT authenticated:created_at:REFERENCES authenticated:created_at:SELECT authenticated:created_at:UPDATE authenticated:id:INSERT authenticated:id:REFERENCES authenticated:id:SELECT authenticated:id:UPDATE authenticated:payment_id:INSERT authenticated:payment_id:REFERENCES authenticated:payment_id:SELECT authenticated:payment_id:UPDATE authenticated:student_monthly_fee_id:INSERT authenticated:student_monthly_fee_id:REFERENCES authenticated:student_monthly_fee_id:SELECT authenticated:student_monthly_fee_id:UPDATE

-- ===== credit_requests =====
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage credit requests" ON public.credit_requests;
CREATE POLICY "Admins can manage credit requests" ON public.credit_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Admins can view all credit requests" ON public.credit_requests;
CREATE POLICY "Admins can view all credit requests" ON public.credit_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Schools can create requests" ON public.credit_requests;
CREATE POLICY "Schools can create requests" ON public.credit_requests AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = credit_requests.school_id))));
DROP POLICY IF EXISTS "Schools can view their own requests" ON public.credit_requests;
CREATE POLICY "Schools can view their own requests" ON public.credit_requests AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = credit_requests.school_id))));
DROP POLICY IF EXISTS "admin_can_update_credit_requests" ON public.credit_requests;
CREATE POLICY "admin_can_update_credit_requests" ON public.credit_requests AS PERMISSIVE FOR UPDATE
  USING (true);
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_requests TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.credit_requests TO service_role;
-- column-level privileges present (72) -- unusual, see below
-- anon:admin_notes:INSERT anon:admin_notes:REFERENCES anon:admin_notes:SELECT anon:admin_notes:UPDATE anon:amount_pkr:INSERT anon:amount_pkr:REFERENCES anon:amount_pkr:SELECT anon:amount_pkr:UPDATE anon:created_at:INSERT anon:created_at:REFERENCES anon:created_at:SELECT anon:created_at:UPDATE anon:credits:INSERT anon:credits:REFERENCES anon:credits:SELECT anon:credits:UPDATE anon:id:INSERT anon:id:REFERENCES anon:id:SELECT anon:id:UPDATE anon:payment_method:INSERT anon:payment_method:REFERENCES anon:payment_method:SELECT anon:payment_method:UPDATE anon:payment_reference:INSERT anon:payment_reference:REFERENCES anon:payment_reference:SELECT anon:payment_reference:UPDATE anon:school_id:INSERT anon:school_id:REFERENCES anon:school_id:SELECT anon:school_id:UPDATE anon:status:INSERT anon:status:REFERENCES anon:status:SELECT anon:status:UPDATE authenticated:admin_notes:INSERT authenticated:admin_notes:REFERENCES authenticated:admin_notes:SELECT authenticated:admin_notes:UPDATE authenticated:amount_pkr:INSERT authenticated:amount_pkr:REFERENCES authenticated:amount_pkr:SELECT authenticated:amount_pkr:UPDATE authenticated:created_at:INSERT authenticated:created_at:REFERENCES authenticated:created_at:SELECT authenticated:created_at:UPDATE authenticated:credits:INSERT authenticated:credits:REFERENCES authenticated:credits:SELECT authenticated:credits:UPDATE authenticated:id:INSERT authenticated:id:REFERENCES authenticated:id:SELECT authenticated:id:UPDATE authenticated:payment_method:INSERT authenticated:payment_method:REFERENCES authenticated:payment_method:SELECT authenticated:payment_method:UPDATE authenticated:payment_reference:INSERT authenticated:payment_reference:REFERENCES authenticated:payment_reference:SELECT authenticated:payment_reference:UPDATE authenticated:school_id:INSERT authenticated:school_id:REFERENCES authenticated:school_id:SELECT authenticated:school_id:UPDATE authenticated:status:INSERT authenticated:status:REFERENCES authenticated:status:SELECT authenticated:status:UPDATE

-- ===== schools =====
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view all schools" ON public.schools;
CREATE POLICY "Admins can view all schools" ON public.schools AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Schools can update their own profile" ON public.schools;
CREATE POLICY "Schools can update their own profile" ON public.schools AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Schools can view their own profile" ON public.schools;
CREATE POLICY "Schools can view their own profile" ON public.schools AS PERMISSIVE FOR SELECT
  USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "Users can insert their school profile" ON public.schools;
CREATE POLICY "Users can insert their school profile" ON public.schools AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() = user_id));
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.schools TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.schools TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.schools TO service_role;
-- column-level privileges present (104) -- unusual, see below
-- anon:address:INSERT anon:address:REFERENCES anon:address:SELECT anon:address:UPDATE anon:contact:INSERT anon:contact:REFERENCES anon:contact:SELECT anon:contact:UPDATE anon:created_at:INSERT anon:created_at:REFERENCES anon:created_at:SELECT anon:created_at:UPDATE anon:credit_expires_at:INSERT anon:credit_expires_at:REFERENCES anon:credit_expires_at:SELECT anon:credit_expires_at:UPDATE anon:email:INSERT anon:email:REFERENCES anon:email:SELECT anon:email:UPDATE anon:id:INSERT anon:id:REFERENCES anon:id:SELECT anon:id:UPDATE anon:logo_url:INSERT anon:logo_url:REFERENCES anon:logo_url:SELECT anon:logo_url:UPDATE anon:primary_color:INSERT anon:primary_color:REFERENCES anon:primary_color:SELECT anon:primary_color:UPDATE anon:school_name:INSERT anon:school_name:REFERENCES anon:school_name:SELECT anon:school_name:UPDATE anon:secondary_color:INSERT anon:secondary_color:REFERENCES anon:secondary_color:SELECT anon:secondary_color:UPDATE anon:tertiary_color:INSERT anon:tertiary_color:REFERENCES anon:tertiary_color:SELECT anon:tertiary_color:UPDATE anon:total_credits:INSERT anon:total_credits:REFERENCES anon:total_credits:SELECT anon:total_credits:UPDATE anon:user_id:INSERT anon:user_id:REFERENCES anon:user_id:SELECT anon:user_id:UPDATE authenticated:address:INSERT authenticated:address:REFERENCES authenticated:address:SELECT authenticated:address:UPDATE authenticated:contact:INSERT authenticated:contact:REFERENCES authenticated:contact:SELECT authenticated:contact:UPDATE authenticated:created_at:INSERT authenticated:created_at:REFERENCES authenticated:created_at:SELECT authenticated:created_at:UPDATE authenticated:credit_expires_at:INSERT authenticated:credit_expires_at:REFERENCES authenticated:credit_expires_at:SELECT authenticated:credit_expires_at:UPDATE authenticated:email:INSERT authenticated:email:REFERENCES authenticated:email:SELECT authenticated:email:UPDATE authenticated:id:INSERT authenticated:id:REFERENCES authenticated:id:SELECT authenticated:id:UPDATE authenticated:logo_url:INSERT authenticated:logo_url:REFERENCES authenticated:logo_url:SELECT authenticated:logo_url:UPDATE authenticated:primary_color:INSERT authenticated:primary_color:REFERENCES authenticated:primary_color:SELECT authenticated:primary_color:UPDATE authenticated:school_name:INSERT authenticated:school_name:REFERENCES authenticated:school_name:SELECT authenticated:school_name:UPDATE authenticated:secondary_color:INSERT authenticated:secondary_color:REFERENCES authenticated:secondary_color:SELECT authenticated:secondary_color:UPDATE authenticated:tertiary_color:INSERT authenticated:tertiary_color:REFERENCES authenticated:tertiary_color:SELECT authenticated:tertiary_color:UPDATE authenticated:total_credits:INSERT authenticated:total_credits:REFERENCES authenticated:total_credits:SELECT authenticated:total_credits:UPDATE authenticated:user_id:INSERT authenticated:user_id:REFERENCES authenticated:user_id:SELECT authenticated:user_id:UPDATE

-- credit_requests CHECK constraints before: 0

-- ===== function trg_payment_to_ledger (owner postgres; execute: anon,authenticated,public,service_role) =====
CREATE OR REPLACE FUNCTION public.trg_payment_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_rem_amount NUMERIC(10,2);
    v_fee_row    RECORD;
    v_allocated  NUMERIC(10,2);
    v_already_paid NUMERIC(10,2);
BEGIN
    -- 1. Create Ledger Entry
    INSERT INTO ledger (
        school_id, parent_id, entry_type, amount,
        reference_type, reference_id, description, created_by
    ) VALUES (
        NEW.school_id, NEW.parent_id, 'credit', NEW.received_amount,
        'payment', NEW.id, 'Payment received', NEW.received_by
    );

    -- 2. Automatic Allocation to student_monthly_fees
    v_rem_amount := NEW.received_amount;

    FOR v_fee_row IN 
        SELECT f.id, f.net_amount, 
               COALESCE(SUM(a.allocated_amount), 0) as paid_so_far
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
$function$
;
GRANT EXECUTE ON FUNCTION public.trg_payment_to_ledger TO anon, authenticated, public;

-- ===== function deduct_daily_credits (owner postgres; execute: anon,authenticated,public,service_role) =====
CREATE OR REPLACE FUNCTION public.deduct_daily_credits()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.schools
  SET total_credits = GREATEST(0, total_credits - 1)
  WHERE credit_expires_at IS NULL 
     OR credit_expires_at > now();
     
  UPDATE public.schools
  SET credit_expires_at = NULL
  WHERE total_credits = 0;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.deduct_daily_credits TO anon, authenticated, public;

-- ===== function promote_students (owner postgres; execute: anon,authenticated,public,service_role) =====
CREATE OR REPLACE FUNCTION public.promote_students(p_school_id uuid, p_from_class_id uuid, p_to_class_id uuid)
 RETURNS TABLE(promoted_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_promoted_count bigint;
BEGIN
  UPDATE students SET current_class_id = p_to_class_id, updated_at = now()
  WHERE school_id = p_school_id AND current_class_id = p_from_class_id AND active = true;
  GET DIAGNOSTICS v_promoted_count = ROW_COUNT;
  RETURN QUERY SELECT v_promoted_count;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.promote_students TO anon, authenticated, public;

-- ===== function get_unpaid_months_summary (owner postgres; execute: anon,authenticated,public,service_role) =====
CREATE OR REPLACE FUNCTION public.get_unpaid_months_summary(p_parent_id uuid, p_start_month text DEFAULT NULL::text)
 RETURNS TABLE(month_year text, amount numeric, status text, days_pending integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_start TEXT;
BEGIN
  IF p_start_month IS NULL THEN
    v_start := TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM');
  ELSE
    v_start := p_start_month;
  END IF;
  
  RETURN QUERY
  SELECT 
    mf.month::TEXT,
    mf.amount,
    mf.status::TEXT,
    GREATEST(0, CURRENT_DATE - to_date(mf.month || '-01', 'YYYY-MM-DD'))::INTEGER AS days_pending
  FROM monthly_fees mf
  WHERE mf.parent_id = p_parent_id
    AND mf.month >= v_start
  ORDER BY mf.month DESC;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.get_unpaid_months_summary TO anon, authenticated, public;

-- trigger: CREATE TRIGGER trigger_payment_to_ledger AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION trg_payment_to_ledger();

-- PRE-STATE COUNTS: {"pa":"176","p":"105","l":"252","cr":"3","s":"7","credits":"340"}
-- SET ROLE authenticated test: authenticated
