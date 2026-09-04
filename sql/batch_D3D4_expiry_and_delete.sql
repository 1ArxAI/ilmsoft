-- Batch D3 + D4.
-- D3: credit expiry enforced in the database. A school whose credits have expired can still READ everything
--     (and buy credits), but cannot write school data until credits are renewed. Until now only the browser hid the tabs.
-- D4: permanent delete becomes one transactional function per record type, owner-only, and it refuses to delete
--     anything that carries financial history. Duplicates (no payments, no fees) can still be removed.
-- Rollback: sql/rollback/pre_batch_D3D4_2026-09-04.sql

BEGIN;

-- ------------------------------------------------------------------
-- D3. Helper + every write policy on tenant tables requires an active school
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_is_active(p_school_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM schools WHERE id = p_school_id AND credit_expires_at > now()); $$;
GRANT EXECUTE ON FUNCTION public.school_is_active(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION pg_temp.write_policies(t text, ins text, upd text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE who_ins text := CASE ins WHEN 'm' THEN 'is_school_member(school_id)' ELSE 'is_school_owner(school_id)' END;
        who_upd text := CASE upd WHEN 'm' THEN 'is_school_member(school_id)' ELSE 'is_school_owner(school_id)' END;
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s AND school_is_active(school_id))', t||'_insert', t, who_ins);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (%s AND school_is_active(school_id)) WITH CHECK (%s AND school_is_active(school_id))', t||'_update', t, who_upd, who_upd);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (is_school_owner(school_id) AND school_is_active(school_id))', t||'_delete', t);
END $$;

-- same matrix as D2
SELECT pg_temp.write_policies('students',              'm', 'm');
SELECT pg_temp.write_policies('parents',               'm', 'm');
SELECT pg_temp.write_policies('payments',              'm', 'o');
SELECT pg_temp.write_policies('exam_terms',            'm', 'm');
SELECT pg_temp.write_policies('exam_term_configs',     'm', 'm');
SELECT pg_temp.write_policies('exam_results',          'm', 'm');
SELECT pg_temp.write_policies('extra_fee_payments',    'm', 'o');
SELECT pg_temp.write_policies('income_records',        'm', 'm');
SELECT pg_temp.write_policies('expenses',              'm', 'm');
SELECT pg_temp.write_policies('suppliers',             'm', 'm');
SELECT pg_temp.write_policies('supplier_transactions', 'm', 'o');
SELECT pg_temp.write_policies('custom_receipts',       'm', 'm');
SELECT pg_temp.write_policies('classes',               'o', 'o');
SELECT pg_temp.write_policies('teachers',              'o', 'o');
SELECT pg_temp.write_policies('extra_fees',            'o', 'o');
SELECT pg_temp.write_policies('income_categories',     'o', 'o');
SELECT pg_temp.write_policies('expense_categories',    'o', 'o');
SELECT pg_temp.write_policies('student_monthly_fees',  'o', 'o');
SELECT pg_temp.write_policies('fee_generations',       'o', 'o');
DROP FUNCTION pg_temp.write_policies(text, text, text);

DROP POLICY IF EXISTS ledger_insert ON public.ledger;
DROP POLICY IF EXISTS ledger_update ON public.ledger;
DROP POLICY IF EXISTS ledger_delete ON public.ledger;
CREATE POLICY ledger_insert ON public.ledger FOR INSERT WITH CHECK (is_school_member(school_id) AND school_is_active(school_id));
CREATE POLICY ledger_update ON public.ledger FOR UPDATE USING (is_school_owner(school_id) AND school_is_active(school_id)) WITH CHECK (is_school_owner(school_id) AND school_is_active(school_id));
CREATE POLICY ledger_delete ON public.ledger FOR DELETE
  USING (school_is_active(school_id) AND (is_school_owner(school_id) OR (is_school_member(school_id) AND reference_type = 'opening_balance')));

-- Fee generation RPCs: same rule (bodies unchanged from Batch C apart from the added check).
CREATE OR REPLACE FUNCTION public.generate_bulk_fees(p_school_id uuid, p_months text[], p_class_ids uuid[] DEFAULT NULL, p_include_unassigned boolean DEFAULT true)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
    v_month TEXT; v_student RECORD; v_generation_id UUID; v_inserted INTEGER := 0; v_skipped INTEGER := 0;
    v_total_amount NUMERIC(10,2) := 0; v_parent_totals RECORD; v_net NUMERIC(10,2);
BEGIN
    IF NOT is_school_member(p_school_id) THEN
        RAISE EXCEPTION 'Not authorized to generate fees for this school' USING ERRCODE = '42501';
    END IF;
    IF NOT school_is_active(p_school_id) THEN
        RAISE EXCEPTION 'Your credits have expired. Renew credits to generate fees.' USING ERRCODE = '42501';
    END IF;

    FOREACH v_month IN ARRAY p_months LOOP
      INSERT INTO fee_generations (school_id, months_generated, status, generated_by)
      VALUES (p_school_id, ARRAY[v_month], 'completed', auth.uid()) RETURNING id INTO v_generation_id;

      FOR v_student IN
        SELECT s.id, s.parent_id, s.current_class_id AS class_id, COALESCE(c.monthly_fee, 0) AS class_fee,
               s.discount_type, COALESCE(s.discount_value, 0) AS discount_value
        FROM students s LEFT JOIN classes c ON c.id = s.current_class_id
        WHERE s.school_id = p_school_id AND s.active = true
          AND ((p_class_ids IS NULL AND p_include_unassigned = TRUE)
               OR (s.current_class_id = ANY(p_class_ids))
               OR (s.current_class_id IS NULL AND p_include_unassigned = TRUE))
      LOOP
        v_net := student_net_fee(v_student.class_fee, v_student.discount_type, v_student.discount_value);
        INSERT INTO student_monthly_fees (school_id, student_id, parent_id, class_id, generation_id, month,
                                          gross_amount, discount_type, discount_value, discount_amount, net_amount)
        VALUES (p_school_id, v_student.id, v_student.parent_id, v_student.class_id, v_generation_id, v_month,
                v_student.class_fee, v_student.discount_type, v_student.discount_value, v_student.class_fee - v_net, v_net)
        ON CONFLICT (student_id, month) DO NOTHING;
        IF FOUND THEN v_inserted := v_inserted + 1; v_total_amount := v_total_amount + v_net;
        ELSE v_skipped := v_skipped + 1; END IF;
      END LOOP;

      FOR v_parent_totals IN
        SELECT parent_id, SUM(net_amount) AS parent_total FROM student_monthly_fees
        WHERE school_id = p_school_id AND month = v_month AND generation_id = v_generation_id GROUP BY parent_id
      LOOP
        IF v_parent_totals.parent_total > 0 THEN
          INSERT INTO ledger (school_id, parent_id, entry_type, amount, reference_type, reference_id, description, month, created_by)
          VALUES (p_school_id, v_parent_totals.parent_id, 'debit', v_parent_totals.parent_total,
                  'fee_generation', v_generation_id, 'Monthly fee: ' || v_month, v_month, auth.uid());
        END IF;
      END LOOP;

      UPDATE fee_generations SET student_count = v_inserted, total_amount = v_total_amount, skipped_count = v_skipped
      WHERE id = v_generation_id;
    END LOOP;

    RETURN json_build_object('months_processed', array_length(p_months, 1), 'students_processed', v_inserted,
                             'total_amount', v_total_amount, 'skipped_count', v_skipped);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_individual_fee(p_school_id uuid, p_parent_id uuid, p_month text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_student RECORD; v_gen_id UUID; v_count INT := 0; v_total NUMERIC(10,2) := 0; v_net NUMERIC(10,2);
BEGIN
    IF NOT is_school_member(p_school_id) THEN
        RAISE EXCEPTION 'Not authorized to generate fees for this school' USING ERRCODE = '42501';
    END IF;
    IF NOT school_is_active(p_school_id) THEN
        RAISE EXCEPTION 'Your credits have expired. Renew credits to generate fees.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM ledger WHERE parent_id = p_parent_id AND school_id = p_school_id
               AND reference_type = 'fee_generation' AND month = p_month) THEN
        RETURN json_build_object('error', 'Fee already generated for this parent and month');
    END IF;

    v_gen_id := gen_random_uuid();
    INSERT INTO fee_generations (id, school_id, months_generated, status, student_count, total_amount, generated_by)
    VALUES (v_gen_id, p_school_id, ARRAY[p_month], 'completed', 0, 0, auth.uid());

    FOR v_student IN
      SELECT s.id AS student_id, s.parent_id, s.current_class_id, COALESCE(c.monthly_fee, 0) AS class_fee,
             s.discount_type, COALESCE(s.discount_value, 0) AS discount_value
      FROM students s LEFT JOIN classes c ON c.id = s.current_class_id
      WHERE s.school_id = p_school_id AND s.parent_id = p_parent_id AND s.active = true
    LOOP
      v_net := student_net_fee(v_student.class_fee, v_student.discount_type, v_student.discount_value);
      INSERT INTO student_monthly_fees (school_id, student_id, parent_id, class_id, generation_id, month,
                                        gross_amount, discount_type, discount_value, discount_amount, net_amount)
      VALUES (p_school_id, v_student.student_id, v_student.parent_id, v_student.current_class_id, v_gen_id, p_month,
              v_student.class_fee, v_student.discount_type, v_student.discount_value, v_student.class_fee - v_net, v_net)
      ON CONFLICT (student_id, month) DO NOTHING;
      IF FOUND THEN v_count := v_count + 1; v_total := v_total + v_net; END IF;
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
-- D4. Permanent delete: one function, owner-only, refuses anything with financial history
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_student_permanently(p_student_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school uuid; v_fees int; v_extra int;
BEGIN
  SELECT school_id INTO v_school FROM students WHERE id = p_student_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  IF NOT is_school_owner(v_school) THEN RAISE EXCEPTION 'Only the school owner can permanently delete records' USING ERRCODE = '42501'; END IF;
  IF NOT school_is_active(v_school) THEN RAISE EXCEPTION 'Your credits have expired.' USING ERRCODE = '42501'; END IF;

  SELECT count(*) INTO v_fees  FROM student_monthly_fees WHERE student_id = p_student_id;
  SELECT count(*) INTO v_extra FROM extra_fee_payments   WHERE student_id = p_student_id;
  IF v_fees > 0 OR v_extra > 0 THEN
    RAISE EXCEPTION 'This student has % monthly fee record(s) and % extra-fee payment(s). Deactivate the student instead of deleting.', v_fees, v_extra;
  END IF;

  DELETE FROM exam_results WHERE student_id = p_student_id;
  DELETE FROM students     WHERE id = p_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_parent_permanently(p_parent_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school uuid; v_pay int; v_fees int; v_extra int; v_receipts int; v_ledger int;
BEGIN
  SELECT school_id INTO v_school FROM parents WHERE id = p_parent_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Parent not found'; END IF;
  IF NOT is_school_owner(v_school) THEN RAISE EXCEPTION 'Only the school owner can permanently delete records' USING ERRCODE = '42501'; END IF;
  IF NOT school_is_active(v_school) THEN RAISE EXCEPTION 'Your credits have expired.' USING ERRCODE = '42501'; END IF;

  SELECT count(*) INTO v_pay      FROM payments             WHERE parent_id = p_parent_id;
  SELECT count(*) INTO v_fees     FROM student_monthly_fees WHERE parent_id = p_parent_id;
  SELECT count(*) INTO v_extra    FROM extra_fee_payments   WHERE parent_id = p_parent_id;
  SELECT count(*) INTO v_receipts FROM custom_receipts      WHERE parent_id = p_parent_id;
  SELECT count(*) INTO v_ledger   FROM ledger               WHERE parent_id = p_parent_id AND reference_type <> 'opening_balance';
  IF v_pay > 0 OR v_fees > 0 OR v_extra > 0 OR v_receipts > 0 OR v_ledger > 0 THEN
    RAISE EXCEPTION 'This parent has financial history (% payment(s), % fee record(s), % extra-fee payment(s), % receipt(s)). Deactivate the parent instead of deleting.', v_pay, v_fees, v_extra, v_receipts;
  END IF;

  DELETE FROM ledger       WHERE parent_id = p_parent_id;           -- only opening-balance rows can exist here
  DELETE FROM exam_results WHERE student_id IN (SELECT id FROM students WHERE parent_id = p_parent_id);
  DELETE FROM students     WHERE parent_id = p_parent_id;
  DELETE FROM parents      WHERE id = p_parent_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_student_permanently(uuid), public.delete_parent_permanently(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_student_permanently(uuid), public.delete_parent_permanently(uuid) TO authenticated;

COMMIT;
