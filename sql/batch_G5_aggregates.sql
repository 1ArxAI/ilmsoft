-- Batch G5: aggregate in the database instead of downloading whole tables into the browser.
-- Rollback: sql/rollback/pre_batch_G5_2026-09-05.sql (all objects here are new, except the suppliers trigger + backfill)

BEGIN;

-- 1. Students per class (Classes screen showed one row per student to count them).
CREATE OR REPLACE VIEW public.class_student_counts WITH (security_invoker = true) AS
  SELECT c.id AS class_id, c.school_id,
         count(s.id) FILTER (WHERE s.active) AS active_students
  FROM classes c LEFT JOIN students s ON s.current_class_id = c.id
  GROUP BY c.id, c.school_id;
GRANT SELECT ON public.class_student_counts TO authenticated;

-- 2. Three financial totals for a school (admin insights summed three whole tables in JS).
CREATE OR REPLACE FUNCTION public.school_financial_totals(p_school_id uuid)
 RETURNS TABLE(total_collection numeric, total_expected numeric, total_outstanding numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COALESCE(sum(received_amount), 0) FROM payments WHERE school_id = p_school_id),
    (SELECT COALESCE(sum(net_amount), 0) FROM student_monthly_fees WHERE school_id = p_school_id),
    (SELECT COALESCE(sum(-balance), 0) FROM parent_balances WHERE school_id = p_school_id AND balance < 0)
  WHERE is_school_member(p_school_id) OR is_platform_admin();
$$;
REVOKE EXECUTE ON FUNCTION public.school_financial_totals(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.school_financial_totals(uuid) TO authenticated;

-- 3. Parents with active students who have NO fee for a month (Missing Fees screen loaded the whole roster).
--    Same row shape the screen already renders: parent + students[] with class name/fee.
CREATE OR REPLACE FUNCTION public.missing_fee_parents(p_school_id uuid, p_month text)
 RETURNS TABLE(id uuid, first_name text, last_name text, contact text, students json)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.contact,
         json_agg(json_build_object(
           'id', s.id, 'active', s.active, 'first_name', s.first_name, 'last_name', s.last_name,
           'current_monthly_fee', s.current_monthly_fee, 'discount_type', s.discount_type, 'discount_value', s.discount_value,
           'classes', CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('name', c.name, 'monthly_fee', c.monthly_fee) END
         ) ORDER BY s.first_name) AS students
  FROM parents p
  JOIN students s ON s.parent_id = p.id AND s.active
  LEFT JOIN classes c ON c.id = s.current_class_id
  WHERE p.school_id = p_school_id AND p.is_active
    AND (is_school_member(p_school_id) OR is_platform_admin())
    AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.parent_id = p.id AND l.reference_type = 'fee_generation' AND l.month = p_month)
  GROUP BY p.id, p.first_name, p.last_name, p.contact
  ORDER BY p.first_name;
$$;
REVOKE EXECUTE ON FUNCTION public.missing_fee_parents(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.missing_fee_parents(uuid, text) TO authenticated;

-- 4. Generate for many parents in one round trip (was one RPC per parent from the browser).
CREATE OR REPLACE FUNCTION public.generate_fees_for_parents(p_school_id uuid, p_parent_ids uuid[], p_month text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_res json; v_ok int := 0; v_skipped int := 0; v_total numeric := 0;
BEGIN
  -- generate_individual_fee does the membership + expiry checks itself
  FOREACH v_id IN ARRAY p_parent_ids LOOP
    v_res := generate_individual_fee(p_school_id, v_id, p_month);
    IF v_res->>'error' IS NULL THEN
      v_ok := v_ok + 1; v_total := v_total + COALESCE((v_res->>'total_amount')::numeric, 0);
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  RETURN json_build_object('processed', v_ok, 'skipped', v_skipped, 'total_amount', v_total);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_fees_for_parents(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_fees_for_parents(uuid, uuid[], text) TO authenticated;

-- 5. Supplier balance is maintained by the database, not recomputed in the browser from every transaction.
CREATE OR REPLACE FUNCTION public.trg_supplier_balance_sync()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_supplier uuid := COALESCE(NEW.supplier_id, OLD.supplier_id);
BEGIN
  UPDATE suppliers s
  SET current_balance = COALESCE(s.opening_balance, 0)
    + COALESCE((SELECT sum(CASE WHEN t.type = 'bill' THEN t.amount ELSE -t.amount END) FROM supplier_transactions t WHERE t.supplier_id = s.id), 0)
  WHERE s.id = v_supplier;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_supplier_balance_sync() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_supplier_balance_sync ON public.supplier_transactions;
CREATE TRIGGER trigger_supplier_balance_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_balance_sync();
-- opening balance edits also move the current balance
CREATE OR REPLACE FUNCTION public.update_supplier_balance()
 RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.opening_balance IS DISTINCT FROM NEW.opening_balance THEN
    NEW.current_balance := COALESCE(NEW.opening_balance, 0)
      + COALESCE((SELECT sum(CASE WHEN t.type = 'bill' THEN t.amount ELSE -t.amount END) FROM supplier_transactions t WHERE t.supplier_id = NEW.id), 0);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS supplier_balance_trigger ON public.suppliers;
CREATE TRIGGER supplier_balance_trigger BEFORE INSERT OR UPDATE OF opening_balance ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_supplier_balance();
-- backfill (the 3 existing suppliers already matched; this makes it a rule, not luck)
UPDATE public.suppliers s SET current_balance = COALESCE(s.opening_balance, 0)
  + COALESCE((SELECT sum(CASE WHEN t.type = 'bill' THEN t.amount ELSE -t.amount END) FROM supplier_transactions t WHERE t.supplier_id = s.id), 0);

COMMIT;
