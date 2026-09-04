-- ROLLBACK SNAPSHOT for Batch C, taken 2026-09-04T16:30:33.540Z from the live catalog.
-- Restores functions, triggers, dropped tables (DDL + policies) and the students.discount_id column.
-- Row data of dropped tables: backups/<stamp>/data/public.{fee_structures,discounts,monthly_fees}.json (scripts/db_restore.mjs --table).


-- ===== table fee_structures =====
CREATE TABLE public.fee_structures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  class_id uuid NOT NULL,
  monthly_amount numeric(10,2) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.fee_structures ADD CONSTRAINT no_overlap UNIQUE (class_id, effective_from);
ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);
ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);
ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_monthly_amount_check CHECK ((monthly_amount >= (0)::numeric));
CREATE INDEX idx_fee_structures_school_id ON public.fee_structures USING btree (school_id);
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_member_insert_fee_structures" ON public.fee_structures AS PERMISSIVE FOR INSERT
  WITH CHECK (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_select_fee_structures" ON public.fee_structures AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_update_fee_structures" ON public.fee_structures AS PERMISSIVE FOR UPDATE
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_owner_delete_fee_structures" ON public.fee_structures AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_structures TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_structures TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_structures TO service_role;

-- ===== table discounts =====
CREATE TABLE public.discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  active_from date NOT NULL DEFAULT CURRENT_DATE,
  active_to date,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.discounts ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);
ALTER TABLE public.discounts ADD CONSTRAINT discounts_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public.discounts ADD CONSTRAINT discounts_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id);
ALTER TABLE public.discounts ADD CONSTRAINT discounts_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'amount'::text, 'fixed'::text])));
CREATE INDEX idx_discounts_school_id ON public.discounts USING btree (school_id);
CREATE INDEX idx_discounts_student_id ON public.discounts USING btree (student_id);
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school_member_insert_discounts" ON public.discounts AS PERMISSIVE FOR INSERT
  WITH CHECK (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_select_discounts" ON public.discounts AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_update_discounts" ON public.discounts AS PERMISSIVE FOR UPDATE
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_owner_delete_discounts" ON public.discounts AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.discounts TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.discounts TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.discounts TO service_role;

-- ===== table monthly_fees =====
CREATE TABLE public.monthly_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  student_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  month character varying(7) NOT NULL,
  amount numeric(10,2) NOT NULL,
  discount_type character varying(20),
  discount_value numeric(10,2),
  final_amount numeric(10,2) NOT NULL,
  status character varying(20) DEFAULT 'unpaid'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.monthly_fees ADD CONSTRAINT monthly_fees_school_student_month_uniq UNIQUE (school_id, student_id, month);
ALTER TABLE public.monthly_fees ADD CONSTRAINT monthly_fees_student_month_key UNIQUE (student_id, month);
ALTER TABLE public.monthly_fees ADD CONSTRAINT monthly_fees_pkey PRIMARY KEY (id);
ALTER TABLE public.monthly_fees ADD CONSTRAINT monthly_fees_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE;
ALTER TABLE public.monthly_fees ADD CONSTRAINT monthly_fees_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.monthly_fees ADD CONSTRAINT monthly_fees_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX monthly_fees_school_student_month ON public.monthly_fees USING btree (school_id, student_id, month);
CREATE INDEX idx_monthly_fees_parent_id ON public.monthly_fees USING btree (parent_id);
ALTER TABLE public.monthly_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow owners full access to monthly_fees" ON public.monthly_fees AS PERMISSIVE FOR ALL TO authenticated
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Allow school members full access to monthly_fees" ON public.monthly_fees AS PERMISSIVE FOR ALL TO authenticated
  USING ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Allow school owners full access to monthly_fees" ON public.monthly_fees AS PERMISSIVE FOR ALL TO authenticated
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Users can view monthly fees" ON public.monthly_fees AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))) OR (school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users))));
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.monthly_fees TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.monthly_fees TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.monthly_fees TO service_role;

-- ===== students.discount_id =====
ALTER TABLE public.students ADD COLUMN discount_id uuid;

-- ===== function recalculate_student_fee(p_student_id uuid) =====
CREATE OR REPLACE FUNCTION public.recalculate_student_fee(p_student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_class_id        UUID;
  v_gross           NUMERIC(10,2) := 0;
  v_discount_type   TEXT;
  v_discount_value  NUMERIC(10,2) := 0;
  v_discount_amount NUMERIC(10,2) := 0;
  v_net             NUMERIC(10,2) := 0;
BEGIN
  -- Get student class (Using current_class_id to match existing schema)
  SELECT current_class_id INTO v_class_id
  FROM students WHERE id = p_student_id;

  -- Get current active fee for that class from fee_structures
  SELECT monthly_amount INTO v_gross
  FROM fee_structures
  WHERE class_id = v_class_id
    AND (effective_to IS NULL OR (effective_from <= CURRENT_DATE AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)))
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_gross IS NULL THEN
    v_gross := 0;
  END IF;

  -- Get current active discount for student from NEW discounts table
  SELECT discount_type, discount_value
  INTO v_discount_type, v_discount_value
  FROM discounts
  WHERE student_id = p_student_id
    AND active_from <= CURRENT_DATE
    AND (active_to IS NULL OR active_to >= CURRENT_DATE)
  LIMIT 1;

  -- Compute discount amount
  IF v_discount_type = 'percentage' THEN
    v_discount_amount := ROUND(v_gross * (v_discount_value / 100), 2);
  ELSIF v_discount_type IN ('amount', 'fixed') THEN
    v_discount_amount := v_discount_value;
  ELSE
    v_discount_amount := 0;
  END IF;

  -- Cap discount at gross (cannot go negative)
  v_net := GREATEST(v_gross - v_discount_amount, 0);

  -- Update student record with the new cached fee (Step 1.3 column)
  UPDATE students
  SET current_monthly_fee = v_net
  WHERE id = p_student_id;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_student_fee(p_student_id uuid) TO anon, authenticated;

-- ===== function trg_discount_changed() =====
CREATE OR REPLACE FUNCTION public.trg_discount_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- When a student's discount is added, updated, or removed,
  -- recalculate their current monthly fee.
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_student_fee(OLD.student_id);
  ELSE
    PERFORM recalculate_student_fee(NEW.student_id);
  END IF;
  RETURN NULL; -- AFTER trigger on ROW
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.trg_discount_changed() TO anon, authenticated;

-- ===== function trg_fee_structure_changed() =====
CREATE OR REPLACE FUNCTION public.trg_fee_structure_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_student RECORD;
BEGIN
  -- When a fee structure is added or updated for a class,
  -- recalculate fees for all active students in that class.
  FOR v_student IN
    SELECT id FROM students
    WHERE current_class_id = NEW.class_id AND active = true
  LOOP
    PERFORM recalculate_student_fee(v_student.id);
  END LOOP;
  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.trg_fee_structure_changed() TO anon, authenticated;

-- ===== function trg_student_class_changed() =====
CREATE OR REPLACE FUNCTION public.trg_student_class_changed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.current_class_id IS DISTINCT FROM NEW.current_class_id THEN
    PERFORM recalculate_student_fee(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.trg_student_class_changed() TO anon, authenticated;

-- ===== function trg_student_reactivated() =====
CREATE OR REPLACE FUNCTION public.trg_student_reactivated()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- When a student is reactivated (active changes from false to true),
  -- recalculate their current monthly fee.
  IF OLD.active IS DISTINCT FROM NEW.active AND NEW.active = true THEN
    PERFORM recalculate_student_fee(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.trg_student_reactivated() TO anon, authenticated;

-- ===== function generate_bulk_fees(p_school_id uuid, p_months text[], p_class_ids uuid[], p_include_unassigned boolean) =====
CREATE OR REPLACE FUNCTION public.generate_bulk_fees(p_school_id uuid, p_months text[], p_class_ids uuid[] DEFAULT NULL::uuid[], p_include_unassigned boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_month           TEXT;
    v_student         RECORD;
    v_generation_id   UUID;
    v_inserted        INTEGER := 0;
    v_skipped         INTEGER := 0;
    v_total_amount    NUMERIC(10,2) := 0;
    v_parent_totals   RECORD;
    v_gross           NUMERIC(10,2);
    v_discount_type   TEXT;
    v_discount_value  NUMERIC(10,2);
    v_discount_amount NUMERIC(10,2);
BEGIN
    -- Explicit security check: ensure caller belongs to the school
    IF NOT EXISTS (
        SELECT 1 FROM school_members
        WHERE user_id = auth.uid() AND school_id = p_school_id AND status = 'active'
    ) AND NOT EXISTS (
        SELECT 1 FROM schools
        WHERE user_id = auth.uid() AND id = p_school_id
    ) THEN
        RAISE EXCEPTION 'Not authorized to generate fees for this school' USING ERRCODE = '42501';
    END IF;

    FOREACH v_month IN ARRAY p_months LOOP

      -- Create generation log entry
      INSERT INTO fee_generations (school_id, months_generated, status)
      VALUES (p_school_id, ARRAY[v_month], 'completed')
      RETURNING id INTO v_generation_id;

      -- Process each active student
      FOR v_student IN
        SELECT s.id, s.parent_id, s.current_class_id as class_id, s.current_monthly_fee,
               d.discount_type, d.discount_value,
               fs.monthly_amount AS gross_amount
        FROM students s
        LEFT JOIN discounts d ON d.student_id = s.id
          AND d.active_from <= CURRENT_DATE
          AND (d.active_to IS NULL OR d.active_to >= CURRENT_DATE)
        LEFT JOIN fee_structures fs ON fs.class_id = s.current_class_id
          AND fs.effective_to IS NULL
        WHERE s.school_id = p_school_id 
          AND s.active = true 
          AND (
            (p_class_ids IS NULL AND p_include_unassigned = TRUE) -- All included
            OR (s.current_class_id = ANY(p_class_ids)) -- Selected real classes
            OR (s.current_class_id IS NULL AND p_include_unassigned = TRUE) -- Unassigned included
          )
      LOOP
        -- Compute discount amount for audit storage
        IF v_student.discount_type = 'percentage' THEN
          v_discount_amount := ROUND(COALESCE(v_student.gross_amount, 0) * (v_student.discount_value / 100), 2);
        ELSIF v_student.discount_type = 'amount' THEN
          v_discount_amount := v_student.discount_value;
        ELSE
          v_discount_amount := 0;
        END IF;

        -- Insert into student_monthly_fees, skip if already exists
        INSERT INTO student_monthly_fees (
          school_id, student_id, parent_id, class_id, generation_id,
          month, gross_amount, discount_type, discount_value,
          discount_amount, net_amount
        )
        VALUES (
          p_school_id, v_student.id, v_student.parent_id, v_student.class_id,
          v_generation_id, v_month,
          COALESCE(v_student.gross_amount, 0),
          v_student.discount_type,
          COALESCE(v_student.discount_value, 0),
          v_discount_amount,
          v_student.current_monthly_fee
        )
        ON CONFLICT (student_id, month) DO NOTHING;

        IF FOUND THEN
          v_inserted := v_inserted + 1;
          v_total_amount := v_total_amount + v_student.current_monthly_fee;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END LOOP;

      -- Debit each parent for this month (sum of all their children)
      FOR v_parent_totals IN
        SELECT parent_id, SUM(net_amount) AS parent_total
        FROM student_monthly_fees
        WHERE school_id = p_school_id AND month = v_month
          AND generation_id = v_generation_id
        GROUP BY parent_id
      LOOP
        IF v_parent_totals.parent_total > 0 THEN
          INSERT INTO ledger (
            school_id, parent_id, entry_type, amount,
            reference_type, reference_id, description, month
          ) VALUES (
            p_school_id, v_parent_totals.parent_id, 'debit', v_parent_totals.parent_total,
            'fee_generation', v_generation_id,
            'Monthly fee: ' || v_month, v_month
          );
        END IF;
      END LOOP;

      -- Update generation summary
      UPDATE fee_generations
      SET student_count = v_inserted,
          total_amount  = v_total_amount,
          skipped_count = v_skipped
      WHERE id = v_generation_id;

    END LOOP;

    RETURN json_build_object(
      'months_processed', array_length(p_months, 1),
      'students_processed', v_inserted,
      'total_amount', v_total_amount,
      'skipped_count', v_skipped
    );
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.generate_bulk_fees(p_school_id uuid, p_months text[], p_class_ids uuid[], p_include_unassigned boolean) TO anon, authenticated;

-- ===== function generate_individual_fee(p_school_id uuid, p_parent_id uuid, p_month text) =====
CREATE OR REPLACE FUNCTION public.generate_individual_fee(p_school_id uuid, p_parent_id uuid, p_month text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student         RECORD;
    v_gen_id          UUID;
    v_count           INT := 0;
    v_total           NUMERIC(10,2) := 0;
BEGIN
    -- 1. Security check: ensure caller belongs to the school
    IF NOT EXISTS (
        SELECT 1 FROM school_members
        WHERE user_id = auth.uid() AND school_id = p_school_id AND status = 'active'
    ) AND NOT EXISTS (
        SELECT 1 FROM schools
        WHERE user_id = auth.uid() AND id = p_school_id
    ) THEN
        RAISE EXCEPTION 'Not authorized to generate fees for this school' USING ERRCODE = '42501';
    END IF;

    -- 2. Check if already generated for this parent+month
    IF EXISTS (
        SELECT 1 FROM public.ledger
        WHERE parent_id = p_parent_id AND school_id = p_school_id
          AND reference_type IN ('monthly_fee', 'fee_generation') AND month = p_month
    ) THEN
        RETURN json_build_object('error', 'Fee already generated for this parent and month');
    END IF;

    v_gen_id := gen_random_uuid();

    -- 3. Create generation log entry to satisfy foreign key constraint
    INSERT INTO public.fee_generations (id, school_id, months_generated, status, student_count, total_amount)
    VALUES (v_gen_id, p_school_id, ARRAY[p_month], 'completed', 0, 0);

    -- 4. Process each active student of the parent
    FOR v_student IN
      SELECT s.id AS student_id, s.parent_id, s.current_class_id,
             s.current_monthly_fee, s.discount_type,
             COALESCE(s.discount_value, 0) AS discount_value,
             COALESCE(c.monthly_fee, s.monthly_fee, 0) AS class_fee
      FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.current_class_id
      WHERE s.school_id = p_school_id AND s.parent_id = p_parent_id AND s.active = true
    LOOP
      DECLARE
        v_discount_amount NUMERIC(10,2) := 0;
        v_net NUMERIC(10,2) := 0;
      BEGIN
        IF v_student.discount_type = 'percentage' THEN
          v_discount_amount := ROUND(v_student.class_fee * v_student.discount_value / 100, 2);
        ELSIF v_student.discount_type = 'amount' OR v_student.discount_type = 'fixed' THEN
          v_discount_amount := v_student.discount_value;
        END IF;
        v_net := GREATEST(0, v_student.class_fee - v_discount_amount);

        INSERT INTO public.student_monthly_fees (
          school_id, student_id, parent_id, class_id, generation_id,
          month, gross_amount, discount_type, discount_value, discount_amount, net_amount
        ) VALUES (
          p_school_id, v_student.student_id, v_student.parent_id,
          v_student.current_class_id, v_gen_id, p_month,
          v_student.class_fee, v_student.discount_type,
          v_student.discount_value, v_discount_amount, v_net
        );

        v_count := v_count + 1;
        v_total := v_total + v_net;
      END;
    END LOOP;

    -- 5. Create ledger debit entry if net total > 0
    IF v_total > 0 THEN
      INSERT INTO public.ledger (
        school_id, parent_id, entry_type, amount, 
        reference_type, reference_id, description, month
      ) VALUES (
        p_school_id, p_parent_id, 'debit', v_total, 
        'fee_generation', v_gen_id, 'Monthly fee: ' || p_month, p_month
      );
    END IF;

    -- 6. Update summary statistics in fee_generations
    UPDATE public.fee_generations
    SET student_count = v_count,
        total_amount  = v_total
    WHERE id = v_gen_id;

    RETURN json_build_object('student_count', v_count, 'total_amount', v_total);
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.generate_individual_fee(p_school_id uuid, p_parent_id uuid, p_month text) TO anon, authenticated;

-- ===== function generate_monthly_fees(p_school_id uuid, p_start_month text, p_num_months integer) =====
CREATE OR REPLACE FUNCTION public.generate_monthly_fees(p_school_id uuid, p_start_month text, p_num_months integer)
 RETURNS TABLE(parents_affected integer, students_affected integer, total_fees_generated numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_cnt INT;
BEGIN
  INSERT INTO monthly_fees(school_id, student_id, parent_id, month, amount, discount_type, discount_value, final_amount, status)
  SELECT s.school_id, s.id, s.parent_id,
    TO_CHAR(DATE_TRUNC('month', 
      (LEFT(p_start_month, 4) || '-' || RIGHT(p_start_month, 2) || '-01')::DATE 
      + (gs-1) * INTERVAL '1 month'), 'YYYY-MM'),
    c.monthly_fee, s.discount_type, s.discount_value,
    CASE WHEN s.discount_type = 'percentage' THEN ROUND(c.monthly_fee * (100 - COALESCE(s.discount_value,0))/100.0, 0)
         WHEN s.discount_type = 'amount' THEN GREATEST(0, c.monthly_fee - COALESCE(s.discount_value,0))
         ELSE c.monthly_fee END,
    'unpaid'
  FROM students s
  JOIN classes c ON c.id = s.current_class_id
  CROSS JOIN generate_series(0, p_num_months-1) AS gs
  WHERE s.school_id = p_school_id AND s.active = true AND s.current_class_id IS NOT NULL
  ON CONFLICT(student_id, month) DO NOTHING;
  
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN QUERY SELECT COUNT(DISTINCT parent_id)::int, COUNT(DISTINCT student_id)::int, COALESCE(SUM(final_amount), 0)::numeric FROM monthly_fees WHERE school_id = p_school_id;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.generate_monthly_fees(p_school_id uuid, p_start_month text, p_num_months integer) TO anon, authenticated;

-- ===== function get_parent_balance(p_parent_id uuid) =====
CREATE OR REPLACE FUNCTION public.get_parent_balance(p_parent_id uuid)
 RETURNS TABLE(total_charged numeric, total_paid numeric, balance numeric, advance numeric)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(fm.final_amount), 0)::DECIMAL,
    COALESCE(SUM(fp.amount), 0)::DECIMAL,
    (COALESCE(SUM(fm.final_amount), 0) - COALESCE(SUM(fp.amount), 0))::DECIMAL AS balance,
    GREATEST(COALESCE(SUM(fp.amount), 0) - COALESCE(SUM(fm.final_amount), 0), 0)::DECIMAL AS advance
  FROM monthly_fees fm
  LEFT JOIN fee_payments_v2 fp ON fp.parent_id = fm.parent_id AND fm.school_id = fp.school_id
  WHERE fm.parent_id = p_parent_id;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.get_parent_balance(p_parent_id uuid) TO anon, authenticated;

-- ===== function get_unpaid_months_summary(p_parent_id uuid, p_start_month text) =====
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

-- ===== function record_parent_payment(p_parent_id uuid, p_amount numeric, p_method text, p_for_months text[], p_description text, p_created_by uuid) =====
CREATE OR REPLACE FUNCTION public.record_parent_payment(p_parent_id uuid, p_amount numeric, p_method text, p_for_months text[], p_description text, p_created_by uuid)
 RETURNS TABLE(receipt_no text, payment_id uuid, new_balance numeric, remaining_as_advance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_receipt text; v_payment_id uuid; v_new_balance numeric; v_school_id uuid;
BEGIN
  SELECT school_id INTO v_school_id FROM parents WHERE id = p_parent_id;
  INSERT INTO receipt_sequences (school_id) VALUES (v_school_id) ON CONFLICT (school_id) DO NOTHING;
  SELECT CONCAT('RCP-', v_school_id::text, '-', TO_CHAR(now(), 'YYYY'), '-', LPAD((sequence_value+1)::text, 6, '0'))
  INTO v_receipt FROM receipt_sequences WHERE school_id = v_school_id;
  UPDATE receipt_sequences SET sequence_value = sequence_value + 1 WHERE school_id = v_school_id;
  INSERT INTO parent_payments (school_id, parent_id, amount, payment_method, receipt_no, payment_date, created_by, description)
  VALUES (v_school_id, p_parent_id, p_amount, p_method, v_receipt, now(), p_created_by, COALESCE(p_description, ''))
  RETURNING id INTO v_payment_id;
  UPDATE parent_balances SET balance = balance - p_amount WHERE parent_id = p_parent_id;
  SELECT balance INTO v_new_balance FROM parent_balances WHERE parent_id = p_parent_id;
  RETURN QUERY SELECT v_receipt, v_payment_id, COALESCE(v_new_balance, 0), GREATEST(0, -COALESCE(v_new_balance, 0));
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.record_parent_payment(p_parent_id uuid, p_amount numeric, p_method text, p_for_months text[], p_description text, p_created_by uuid) TO anon, authenticated;

-- ===== function record_parent_payment(p_parent_id uuid, p_amount numeric, p_method character varying, p_for_months text[], p_description text, p_created_by uuid) =====
CREATE OR REPLACE FUNCTION public.record_parent_payment(p_parent_id uuid, p_amount numeric, p_method character varying, p_for_months text[], p_description text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS TABLE(receipt_no character varying, payment_id uuid, new_balance numeric, remaining_as_advance numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_school_id UUID;
  v_receipt_no VARCHAR;
  v_payment_id UUID;
  v_balance_after NUMERIC;
  v_previous_balance NUMERIC;
BEGIN
  -- Get school_id
  SELECT school_id INTO v_school_id FROM parents WHERE id = p_parent_id;
  
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Parent not found';
  END IF;
  
  -- Generate receipt number
  UPDATE receipt_sequences 
  SET current_number = current_number + 1
  WHERE school_id = v_school_id
  RETURNING prefix || LPAD(current_number::TEXT, 4, '0') INTO v_receipt_no;
  
  -- Create fee_payments record (for backward compatibility)
  INSERT INTO fee_payments (
    school_id, parent_id, amount, months_paid, months_count,
    payment_date, payment_method
  ) VALUES (
    v_school_id, p_parent_id, p_amount, p_for_months, COALESCE(array_length(p_for_months, 1), 1),
    CURRENT_DATE, p_method
  ) RETURNING id INTO v_payment_id;
  
  -- Get current balance before payment
  SELECT COALESCE(current_balance, 0) INTO v_previous_balance
  FROM parent_balances WHERE parent_id = p_parent_id;
  
  v_balance_after := v_previous_balance - p_amount;
  
  -- Add to ledger
  INSERT INTO parent_ledger (
    parent_id, school_id, transaction_type, month_year,
    amount, payment_method, receipt_no, description,
    fee_payment_id, balance_after, created_by
  ) VALUES (
    p_parent_id, v_school_id, 'payment_received', 
    COALESCE(p_for_months[1], TO_CHAR(CURRENT_DATE, 'YYYY-MM')),
    -p_amount,
    p_method, v_receipt_no, 
    COALESCE(p_description, 'Payment via ' || p_method || ' for ' || COALESCE(array_to_string(p_for_months, ', '), 'current month')),
    v_payment_id,
    v_balance_after,
    p_created_by
  );
  
  -- Recalculate all balances
  PERFORM recalculate_parent_balances(v_school_id);
  
  -- Update last payment info
  UPDATE parent_balances SET
    last_payment_date = CURRENT_DATE,
    last_payment_amount = p_amount,
    last_receipt_no = v_receipt_no,
    last_updated = NOW()
  WHERE parent_id = p_parent_id;
  
  RETURN QUERY SELECT 
    v_receipt_no,
    v_payment_id,
    v_balance_after,
    CASE WHEN v_balance_after < 0 THEN ABS(v_balance_after) ELSE 0 END;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.record_parent_payment(p_parent_id uuid, p_amount numeric, p_method character varying, p_for_months text[], p_description text, p_created_by uuid) TO anon, authenticated;

-- ===== function generate_receipt_number(school_id uuid) =====
CREATE OR REPLACE FUNCTION public.generate_receipt_number(school_id uuid)
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
DECLARE
  seq_val INTEGER;
  new_receipt VARCHAR(50);
  school_prefix VARCHAR(20);
BEGIN
  SELECT COALESCE(MAX(receipt_number), 0) + 1 INTO seq_val
  FROM receipt_sequences WHERE school_id = $1;
  
  SELECT COALESCE(school_prefix, 'RCPT') INTO school_prefix
  FROM schools WHERE id = $1;
  
  new_receipt := school_prefix || '-' || seq_val::TEXT;
  
  INSERT INTO receipt_sequences (school_id, receipt_number, receipt_prefix)
  VALUES ($1, seq_val, school_prefix)
  ON CONFLICT (school_id) DO UPDATE SET receipt_number = seq_val;
  
  RETURN new_receipt;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number(school_id uuid) TO anon, authenticated;

-- ===== function generate_receipt_no() =====
CREATE OR REPLACE FUNCTION public.generate_receipt_no()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  year_prefix TEXT;
  next_num INTEGER;
  receipt_no TEXT;
BEGIN
  year_prefix := 'R-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-';
  
  -- Get max sequence number for current year
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(receipt_no FROM LENGTH(year_prefix) + 1) AS INTEGER
      )
    ),
    0
  ) INTO next_num
  FROM fee_receipts
  WHERE receipt_no LIKE year_prefix || '%';
  
  next_num := next_num + 1;
  receipt_no := year_prefix || LPAD(next_num::TEXT, 4, '0');
  
  RETURN receipt_no;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.generate_receipt_no() TO anon, authenticated;

-- ===== function generate_receipt_no(p_school_id uuid) =====
CREATE OR REPLACE FUNCTION public.generate_receipt_no(p_school_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_year text;
  v_next_num int;
  v_new_receipt_no text;
  v_count int;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
  SELECT COALESCE(MAX(CAST(SPLIT_PART(fr.receipt_no, '-', 3) AS INTEGER)), 0)
  INTO v_next_num
  FROM public.fee_receipts fr
  WHERE fr.school_id = p_school_id AND fr.receipt_no LIKE 'R-' || v_year || '-%';
  v_next_num := v_next_num + 1;
  v_new_receipt_no := 'R-' || v_year || '-' || LPAD(v_next_num::text, 4, '0');
  SELECT COUNT(*) INTO v_count FROM public.fee_receipts fr2 WHERE fr2.receipt_no = v_new_receipt_no;
  IF v_count > 0 THEN RAISE EXCEPTION 'Receipt number collision'; END IF;
  RETURN v_new_receipt_no;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.generate_receipt_no(p_school_id uuid) TO anon, authenticated;

-- ===== function create_receipt_sequence() =====
CREATE OR REPLACE FUNCTION public.create_receipt_sequence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO receipt_sequences (school_id, prefix, current_number)
  VALUES (NEW.id, LEFT(REPLACE(UPPER(NEW.school_name), ' ', ''), 3) || '-', 0)
  ON CONFLICT (school_id) DO NOTHING;
  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.create_receipt_sequence() TO anon, authenticated;

-- ===== function create_school_on_signup() =====
CREATE OR REPLACE FUNCTION public.create_school_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_school_id UUID;
BEGIN
  -- Create school for new user, now including the phone number!
  INSERT INTO public.schools (name, phone, email, owner_id, credits, credit_balance, status, trial_ends_at)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'school_name', 'My School'),
    NEW.raw_user_meta_data->>'phone',
    NEW.email,
    NEW.id,
    100,
    100,
    'trial',
    now() + interval '14 days'
  )
  RETURNING id INTO new_school_id;
  
  -- Link user to school
  INSERT INTO public.user_schools (user_id, school_id, role)
  VALUES (NEW.id, new_school_id, 'owner');
  
  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.create_school_on_signup() TO anon, authenticated;

-- ===== function handle_new_user() =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_school_id UUID;
BEGIN
  -- Create the school record with just the core data
  INSERT INTO public.schools (id, user_id, school_name, contact, email)
  VALUES (
    gen_random_uuid(),
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'school_name', 'New School'),
    COALESCE(NEW.raw_user_meta_data->>'contact', ''),
    COALESCE(NEW.raw_user_meta_data->>'email', NEW.email)
  )
  RETURNING id INTO v_school_id;

  -- Automatically link the user to the school as 'owner'
  INSERT INTO public.school_members (school_id, user_id, email, role, status)
  VALUES (v_school_id, NEW.id, NEW.email, 'owner', 'active');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Extremely defensive: allow signup to finish even if profile creation fails
  -- This prevents the "500 Error" from blocking the user's access.
  RAISE WARNING 'Signup Trigger Warning: %', SQLERRM;
  RETURN NEW; 
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;

-- ===== function recalculate_parent_balances(p_school_id uuid) =====
CREATE OR REPLACE FUNCTION public.recalculate_parent_balances(p_school_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM parent_balances WHERE parent_id IN (SELECT id FROM parents WHERE school_id = p_school_id);
  INSERT INTO parent_balances (school_id, parent_id, balance)
  SELECT p_school_id, id, 0 FROM parents WHERE school_id = p_school_id;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.recalculate_parent_balances(p_school_id uuid) TO anon, authenticated;

-- ===== triggers =====
CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_discount_changed AFTER INSERT OR DELETE OR UPDATE ON public.discounts FOR EACH ROW EXECUTE FUNCTION trg_discount_changed();
CREATE TRIGGER trigger_fee_structure_changed AFTER INSERT OR UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION trg_fee_structure_changed();
CREATE TRIGGER trigger_student_class_changed AFTER UPDATE OF current_class_id ON public.students FOR EACH ROW EXECUTE FUNCTION trg_student_class_changed();
CREATE TRIGGER trigger_student_reactivated AFTER UPDATE OF active ON public.students FOR EACH ROW EXECUTE FUNCTION trg_student_reactivated();
-- to undo the new objects: DROP TRIGGER trigger_student_fee_sync ON students; DROP TRIGGER trigger_class_fee_changed ON classes; DROP FUNCTION trg_student_fee_sync(); DROP FUNCTION trg_class_fee_changed(); DROP FUNCTION student_net_fee(numeric,text,numeric);

-- PRE-STATE: {"fs":"60","d":"43","mf":"30","s":"57","active_billing":"63750.00"}
