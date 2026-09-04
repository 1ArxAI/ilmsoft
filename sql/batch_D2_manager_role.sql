-- Batch D2: one permission model for the two roles.
-- Owner   = schools.user_id. Everything.
-- Manager = active school_members row. Daily work: students, parents, payments, ledger opening balances,
--           exams, extra-fee collections, income/expense records, suppliers and their bills, custom receipts.
--           Never: permanent deletes, class fees/structure, teachers, extra-fee definitions, categories,
--           team, school profile, billing.
-- Platform admin (admin_users) can read tenant data for the admin insights page.
-- Rollback: sql/rollback/pre_batch_D2_2026-09-04.sql (every policy as it was)

BEGIN;

-- ------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they never recurse into row policies)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_school_owner(p_school_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM schools WHERE id = p_school_id AND user_id = auth.uid()); $$;

CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM schools WHERE id = p_school_id AND user_id = auth.uid())
          OR EXISTS (SELECT 1 FROM school_members WHERE school_id = p_school_id AND user_id = auth.uid() AND status = 'active'); $$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()); $$;

GRANT EXECUTE ON FUNCTION public.is_school_owner(uuid), public.is_school_member(uuid), public.is_platform_admin() TO authenticated, anon;

-- ------------------------------------------------------------------
-- Drop every existing policy on the tenant tables, then recreate one standard set per table
-- ------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname, p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
           WHERE c.relnamespace = 'public'::regnamespace
             AND c.relname IN ('students','parents','payments','ledger','payment_allocations','student_monthly_fees',
                               'fee_generations','classes','teachers','exam_terms','exam_term_configs','exam_results',
                               'extra_fees','extra_fee_payments','income_categories','income_records',
                               'expense_categories','expenses','suppliers','supplier_transactions','custom_receipts','audit_logs')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.polname, r.relname);
  END LOOP;
END $$;

-- read: members (+ platform admin). insert/update: as listed. delete: owner only.
-- m = managers may; o = owners only.
CREATE OR REPLACE FUNCTION pg_temp.std_policies(t text, ins text, upd text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE who_ins text := CASE ins WHEN 'm' THEN 'is_school_member(school_id)' ELSE 'is_school_owner(school_id)' END;
        who_upd text := CASE upd WHEN 'm' THEN 'is_school_member(school_id)' ELSE 'is_school_owner(school_id)' END;
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (is_school_member(school_id) OR is_platform_admin())', t||'_select', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)', t||'_insert', t, who_ins);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)', t||'_update', t, who_upd, who_upd);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (is_school_owner(school_id))', t||'_delete', t);
END $$;

--                                 table                    insert  update
SELECT pg_temp.std_policies('students',              'm', 'm');
SELECT pg_temp.std_policies('parents',               'm', 'm');
SELECT pg_temp.std_policies('payments',              'm', 'o');
SELECT pg_temp.std_policies('exam_terms',            'm', 'm');
SELECT pg_temp.std_policies('exam_term_configs',     'm', 'm');
SELECT pg_temp.std_policies('exam_results',          'm', 'm');
SELECT pg_temp.std_policies('extra_fee_payments',    'm', 'o');
SELECT pg_temp.std_policies('income_records',        'm', 'm');
SELECT pg_temp.std_policies('expenses',              'm', 'm');
SELECT pg_temp.std_policies('suppliers',             'm', 'm');
SELECT pg_temp.std_policies('supplier_transactions', 'm', 'o');
SELECT pg_temp.std_policies('custom_receipts',       'm', 'm');
SELECT pg_temp.std_policies('classes',               'o', 'o');
SELECT pg_temp.std_policies('teachers',              'o', 'o');
SELECT pg_temp.std_policies('extra_fees',            'o', 'o');
SELECT pg_temp.std_policies('income_categories',     'o', 'o');
SELECT pg_temp.std_policies('expense_categories',    'o', 'o');
SELECT pg_temp.std_policies('student_monthly_fees',  'o', 'o');   -- rows are written by the generation RPCs
SELECT pg_temp.std_policies('fee_generations',       'o', 'o');   -- rows are written by the generation RPCs

-- ledger: members may add rows and remove opening-balance rows (the parent edit flow); owners may do anything.
ALTER TABLE public.ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_select ON public.ledger FOR SELECT USING (is_school_member(school_id) OR is_platform_admin());
CREATE POLICY ledger_insert ON public.ledger FOR INSERT WITH CHECK (is_school_member(school_id));
CREATE POLICY ledger_update ON public.ledger FOR UPDATE USING (is_school_owner(school_id)) WITH CHECK (is_school_owner(school_id));
CREATE POLICY ledger_delete ON public.ledger FOR DELETE
  USING (is_school_owner(school_id) OR (is_school_member(school_id) AND reference_type = 'opening_balance'));

-- payment_allocations: read through the payment; only the payment trigger writes.
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_allocations_select ON public.payment_allocations FOR SELECT
  USING (EXISTS (SELECT 1 FROM payments p WHERE p.id = payment_allocations.payment_id
                 AND (is_school_member(p.school_id) OR is_platform_admin())));

-- audit_logs: owners read their school's trail; only the audit trigger writes.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (is_school_owner(school_id));

DROP FUNCTION pg_temp.std_policies(text, text, text);

COMMIT;
