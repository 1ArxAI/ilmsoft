-- Batch C: one fee system.
-- Rule (owner, 2026-09-04): a student's fee for a month = current class fee − the student's discount
-- (percentage or amount), computed in the database at generation time. Class fee changes apply to
-- every student in that class at the next generation. The April 2026 "fee_structures/discounts"
-- system is obsolete and is removed here.
-- Rollback: sql/rollback/pre_batch_C_<date>.sql + backups/<stamp>/ (data of dropped tables).

BEGIN;

-- ------------------------------------------------------------------
-- C1. The one formula, and a trigger that keeps the student's cached fee equal to it
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_net_fee(p_class_fee numeric, p_discount_type text, p_discount_value numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $$
  SELECT GREATEST(
    COALESCE(p_class_fee, 0) - CASE
      WHEN p_discount_type = 'percentage' THEN ROUND(COALESCE(p_class_fee, 0) * COALESCE(p_discount_value, 0) / 100.0)
      WHEN p_discount_type = 'amount'     THEN COALESCE(p_discount_value, 0)
      ELSE 0 END,
    0);
$$;

-- students.monthly_fee  = the current class fee (gross, informational)
-- students.current_monthly_fee = class fee − discount (what screens show and what is billed)
CREATE OR REPLACE FUNCTION public.trg_student_fee_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER            -- must read classes regardless of the caller's row policies
 SET search_path = public
AS $$
DECLARE v_class_fee numeric := 0;
BEGIN
  IF NEW.current_class_id IS NOT NULL THEN
    SELECT monthly_fee INTO v_class_fee FROM classes WHERE id = NEW.current_class_id;
  END IF;
  NEW.monthly_fee := COALESCE(v_class_fee, 0);
  NEW.current_monthly_fee := student_net_fee(v_class_fee, NEW.discount_type, NEW.discount_value);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_student_fee_sync() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_student_class_changed ON public.students;
DROP TRIGGER IF EXISTS trigger_student_reactivated  ON public.students;
DROP TRIGGER IF EXISTS trigger_student_fee_sync     ON public.students;
CREATE TRIGGER trigger_student_fee_sync
  BEFORE INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.trg_student_fee_sync();

-- A class fee change refreshes every student currently in that class.
CREATE OR REPLACE FUNCTION public.trg_class_fee_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
BEGIN
  IF OLD.monthly_fee IS DISTINCT FROM NEW.monthly_fee THEN
    UPDATE students SET updated_at = now() WHERE current_class_id = NEW.id;  -- BEFORE trigger recomputes the fee
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_class_fee_changed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_class_fee_changed ON public.classes;
CREATE TRIGGER trigger_class_fee_changed
  AFTER UPDATE OF monthly_fee ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.trg_class_fee_changed();

-- Bring every existing student row in line with the rule (no-op for all 54 active students today).
UPDATE public.students SET updated_at = updated_at;

-- ------------------------------------------------------------------
-- C2. Monthly generation computes from the class fee and the student's discount, at generation time
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_bulk_fees(
    p_school_id          uuid,
    p_months             text[],
    p_class_ids          uuid[] DEFAULT NULL,
    p_include_unassigned boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_month           TEXT;
    v_student         RECORD;
    v_generation_id   UUID;
    v_inserted        INTEGER := 0;
    v_skipped         INTEGER := 0;
    v_total_amount    NUMERIC(10,2) := 0;
    v_parent_totals   RECORD;
    v_net             NUMERIC(10,2);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM school_members WHERE user_id = auth.uid() AND school_id = p_school_id AND status = 'active')
       AND NOT EXISTS (SELECT 1 FROM schools WHERE user_id = auth.uid() AND id = p_school_id) THEN
        RAISE EXCEPTION 'Not authorized to generate fees for this school' USING ERRCODE = '42501';
    END IF;

    FOREACH v_month IN ARRAY p_months LOOP
      INSERT INTO fee_generations (school_id, months_generated, status, generated_by)
      VALUES (p_school_id, ARRAY[v_month], 'completed', auth.uid())
      RETURNING id INTO v_generation_id;

      FOR v_student IN
        SELECT s.id, s.parent_id, s.current_class_id AS class_id,
               COALESCE(c.monthly_fee, 0) AS class_fee,
               s.discount_type, COALESCE(s.discount_value, 0) AS discount_value
        FROM students s
        LEFT JOIN classes c ON c.id = s.current_class_id
        WHERE s.school_id = p_school_id
          AND s.active = true
          AND (
            (p_class_ids IS NULL AND p_include_unassigned = TRUE)
            OR (s.current_class_id = ANY(p_class_ids))
            OR (s.current_class_id IS NULL AND p_include_unassigned = TRUE)
          )
      LOOP
        v_net := student_net_fee(v_student.class_fee, v_student.discount_type, v_student.discount_value);

        INSERT INTO student_monthly_fees (
          school_id, student_id, parent_id, class_id, generation_id,
          month, gross_amount, discount_type, discount_value, discount_amount, net_amount)
        VALUES (
          p_school_id, v_student.id, v_student.parent_id, v_student.class_id, v_generation_id,
          v_month, v_student.class_fee, v_student.discount_type, v_student.discount_value,
          v_student.class_fee - v_net, v_net)
        ON CONFLICT (student_id, month) DO NOTHING;

        IF FOUND THEN
          v_inserted := v_inserted + 1;
          v_total_amount := v_total_amount + v_net;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END LOOP;

      FOR v_parent_totals IN
        SELECT parent_id, SUM(net_amount) AS parent_total
        FROM student_monthly_fees
        WHERE school_id = p_school_id AND month = v_month AND generation_id = v_generation_id
        GROUP BY parent_id
      LOOP
        IF v_parent_totals.parent_total > 0 THEN
          INSERT INTO ledger (school_id, parent_id, entry_type, amount, reference_type, reference_id, description, month, created_by)
          VALUES (p_school_id, v_parent_totals.parent_id, 'debit', v_parent_totals.parent_total,
                  'fee_generation', v_generation_id, 'Monthly fee: ' || v_month, v_month, auth.uid());
        END IF;
      END LOOP;

      UPDATE fee_generations
      SET student_count = v_inserted, total_amount = v_total_amount, skipped_count = v_skipped
      WHERE id = v_generation_id;
    END LOOP;

    RETURN json_build_object(
      'months_processed', array_length(p_months, 1),
      'students_processed', v_inserted,
      'total_amount', v_total_amount,
      'skipped_count', v_skipped);
END;
$function$;

-- Same formula for the single-parent path (Missing Fee screen).
CREATE OR REPLACE FUNCTION public.generate_individual_fee(p_school_id uuid, p_parent_id uuid, p_month text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_student RECORD;
    v_gen_id  UUID;
    v_count   INT := 0;
    v_total   NUMERIC(10,2) := 0;
    v_net     NUMERIC(10,2);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM school_members WHERE user_id = auth.uid() AND school_id = p_school_id AND status = 'active')
       AND NOT EXISTS (SELECT 1 FROM schools WHERE user_id = auth.uid() AND id = p_school_id) THEN
        RAISE EXCEPTION 'Not authorized to generate fees for this school' USING ERRCODE = '42501';
    END IF;

    IF EXISTS (SELECT 1 FROM ledger WHERE parent_id = p_parent_id AND school_id = p_school_id
               AND reference_type = 'fee_generation' AND month = p_month) THEN
        RETURN json_build_object('error', 'Fee already generated for this parent and month');
    END IF;

    v_gen_id := gen_random_uuid();
    INSERT INTO fee_generations (id, school_id, months_generated, status, student_count, total_amount, generated_by)
    VALUES (v_gen_id, p_school_id, ARRAY[p_month], 'completed', 0, 0, auth.uid());

    FOR v_student IN
      SELECT s.id AS student_id, s.parent_id, s.current_class_id,
             COALESCE(c.monthly_fee, 0) AS class_fee,
             s.discount_type, COALESCE(s.discount_value, 0) AS discount_value
      FROM students s
      LEFT JOIN classes c ON c.id = s.current_class_id
      WHERE s.school_id = p_school_id AND s.parent_id = p_parent_id AND s.active = true
    LOOP
      v_net := student_net_fee(v_student.class_fee, v_student.discount_type, v_student.discount_value);
      INSERT INTO student_monthly_fees (
        school_id, student_id, parent_id, class_id, generation_id,
        month, gross_amount, discount_type, discount_value, discount_amount, net_amount)
      VALUES (
        p_school_id, v_student.student_id, v_student.parent_id, v_student.current_class_id, v_gen_id,
        p_month, v_student.class_fee, v_student.discount_type, v_student.discount_value,
        v_student.class_fee - v_net, v_net)
      ON CONFLICT (student_id, month) DO NOTHING;
      IF FOUND THEN
        v_count := v_count + 1;
        v_total := v_total + v_net;
      END IF;
    END LOOP;

    IF v_total > 0 THEN
      INSERT INTO ledger (school_id, parent_id, entry_type, amount, reference_type, reference_id, description, month, created_by)
      VALUES (p_school_id, p_parent_id, 'debit', v_total, 'fee_generation', v_gen_id, 'Monthly fee: ' || p_month, p_month, auth.uid());
    END IF;

    UPDATE fee_generations SET student_count = v_count, total_amount = v_total WHERE id = v_gen_id;
    RETURN json_build_object('student_count', v_count, 'total_amount', v_total);
END;
$function$;

-- ------------------------------------------------------------------
-- C3. Remove the obsolete April fee system and other dead objects
--     (fee_payments / fee_receipts stay until receipts are rebuilt in C4)
-- ------------------------------------------------------------------
DROP TRIGGER  IF EXISTS trigger_discount_changed      ON public.discounts;
DROP TRIGGER  IF EXISTS trigger_fee_structure_changed ON public.fee_structures;
DROP FUNCTION IF EXISTS public.trg_discount_changed();
DROP FUNCTION IF EXISTS public.trg_fee_structure_changed();
DROP FUNCTION IF EXISTS public.trg_student_class_changed();
DROP FUNCTION IF EXISTS public.trg_student_reactivated();
DROP FUNCTION IF EXISTS public.recalculate_student_fee(uuid);

DROP TABLE IF EXISTS public.fee_structures;
DROP TABLE IF EXISTS public.discounts;
DROP TABLE IF EXISTS public.monthly_fees;
ALTER TABLE public.students DROP COLUMN IF EXISTS discount_id;

DROP FUNCTION IF EXISTS public.generate_monthly_fees(uuid, text, integer);
DROP FUNCTION IF EXISTS public.get_parent_balance(uuid);
DROP FUNCTION IF EXISTS public.get_unpaid_months_summary(uuid, text);
DROP FUNCTION IF EXISTS public.record_parent_payment(uuid, numeric, text, text[], text, uuid);
DROP FUNCTION IF EXISTS public.record_parent_payment(uuid, numeric, character varying, text[], text, uuid);
DROP FUNCTION IF EXISTS public.generate_receipt_number(uuid);
DROP FUNCTION IF EXISTS public.generate_receipt_no();
DROP FUNCTION IF EXISTS public.create_receipt_sequence();
DROP FUNCTION IF EXISTS public.create_school_on_signup();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.recalculate_parent_balances(uuid);

COMMIT;
