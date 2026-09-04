-- Batch F: same permission model as D2/D3, expressed so Postgres evaluates it ONCE per query, not once per row.
-- D2 used is_school_member(school_id) / is_school_owner(school_id) / school_is_active(school_id): SECURITY DEFINER
-- functions cannot be inlined, so every row paid ~0.3 ms. Set-membership predicates below become hashed
-- InitPlans/SubPlans that run one time per statement. The helper functions stay (the RPCs use them).

BEGIN;

CREATE OR REPLACE FUNCTION public.member_school_ids()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM schools WHERE user_id = auth.uid()
      UNION SELECT school_id FROM school_members WHERE user_id = auth.uid() AND status = 'active'; $$;
CREATE OR REPLACE FUNCTION public.owner_school_ids()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM schools WHERE user_id = auth.uid(); $$;
CREATE OR REPLACE FUNCTION public.active_school_ids()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM schools WHERE credit_expires_at > now(); $$;
GRANT EXECUTE ON FUNCTION public.member_school_ids(), public.owner_school_ids(), public.active_school_ids() TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.fast_policies(t text, ins text, upd text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m text := 'school_id IN (SELECT member_school_ids())';
        o text := 'school_id IN (SELECT owner_school_ids())';
        act text := 'school_id IN (SELECT active_school_ids())';
        adm text := '(SELECT is_platform_admin())';
        who_ins text := CASE ins WHEN 'm' THEN m ELSE o END;
        who_upd text := CASE upd WHEN 'm' THEN m ELSE o END;
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (%s OR %s)', t||'_select', t, m, adm);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s AND %s)', t||'_insert', t, who_ins, act);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s AND %s) WITH CHECK (%s AND %s)', t||'_update', t, who_upd, act, who_upd, act);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (%s AND %s)', t||'_delete', t, o, act);
END $$;

SELECT pg_temp.fast_policies('students',              'm', 'm');
SELECT pg_temp.fast_policies('parents',               'm', 'm');
SELECT pg_temp.fast_policies('payments',              'm', 'o');
SELECT pg_temp.fast_policies('exam_terms',            'm', 'm');
SELECT pg_temp.fast_policies('exam_term_configs',     'm', 'm');
SELECT pg_temp.fast_policies('exam_results',          'm', 'm');
SELECT pg_temp.fast_policies('extra_fee_payments',    'm', 'o');
SELECT pg_temp.fast_policies('income_records',        'm', 'm');
SELECT pg_temp.fast_policies('expenses',              'm', 'm');
SELECT pg_temp.fast_policies('suppliers',             'm', 'm');
SELECT pg_temp.fast_policies('supplier_transactions', 'm', 'o');
SELECT pg_temp.fast_policies('custom_receipts',       'm', 'm');
SELECT pg_temp.fast_policies('classes',               'o', 'o');
SELECT pg_temp.fast_policies('teachers',              'o', 'o');
SELECT pg_temp.fast_policies('extra_fees',            'o', 'o');
SELECT pg_temp.fast_policies('income_categories',     'o', 'o');
SELECT pg_temp.fast_policies('expense_categories',    'o', 'o');
SELECT pg_temp.fast_policies('student_monthly_fees',  'o', 'o');
SELECT pg_temp.fast_policies('fee_generations',       'o', 'o');
DROP FUNCTION pg_temp.fast_policies(text, text, text);

DROP POLICY IF EXISTS ledger_select ON public.ledger; DROP POLICY IF EXISTS ledger_insert ON public.ledger;
DROP POLICY IF EXISTS ledger_update ON public.ledger; DROP POLICY IF EXISTS ledger_delete ON public.ledger;
CREATE POLICY ledger_select ON public.ledger FOR SELECT USING (school_id IN (SELECT member_school_ids()) OR (SELECT is_platform_admin()));
CREATE POLICY ledger_insert ON public.ledger FOR INSERT WITH CHECK (school_id IN (SELECT member_school_ids()) AND school_id IN (SELECT active_school_ids()));
CREATE POLICY ledger_update ON public.ledger FOR UPDATE USING (school_id IN (SELECT owner_school_ids()) AND school_id IN (SELECT active_school_ids())) WITH CHECK (school_id IN (SELECT owner_school_ids()) AND school_id IN (SELECT active_school_ids()));
CREATE POLICY ledger_delete ON public.ledger FOR DELETE USING (school_id IN (SELECT active_school_ids()) AND (school_id IN (SELECT owner_school_ids()) OR (school_id IN (SELECT member_school_ids()) AND reference_type = 'opening_balance')));

DROP POLICY IF EXISTS payment_allocations_select ON public.payment_allocations;
CREATE POLICY payment_allocations_select ON public.payment_allocations FOR SELECT
  USING (payment_id IN (SELECT id FROM payments WHERE school_id IN (SELECT member_school_ids()) OR (SELECT is_platform_admin())));

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (school_id IN (SELECT owner_school_ids()));

-- the same treatment for the tables that kept their old policies
DROP POLICY IF EXISTS "Read own school members" ON public.school_members;
CREATE POLICY "Read own school members" ON public.school_members FOR SELECT USING (school_id IN (SELECT member_school_ids()));

-- A manager must be able to read the school they belong to (AuthContext embeds schools via school_members).
-- Until now only the owner (user_id = auth.uid()) and platform admins could; managers would get an empty dashboard.
DROP POLICY IF EXISTS "Schools can view their own profile" ON public.schools;
CREATE POLICY "Schools can view their own profile" ON public.schools FOR SELECT USING (id IN (SELECT member_school_ids()));

-- Owners of the three schools created before school_members existed have no membership row; add it so
-- every user resolves through the same single query.
INSERT INTO public.school_members (school_id, user_id, email, role, status)
SELECT s.id, s.user_id, s.email, 'owner', 'active' FROM public.schools s
WHERE NOT EXISTS (SELECT 1 FROM public.school_members m WHERE m.school_id = s.id AND m.user_id = s.user_id)
ON CONFLICT (school_id, email) DO UPDATE SET user_id = EXCLUDED.user_id, role = 'owner', status = 'active';

COMMIT;
