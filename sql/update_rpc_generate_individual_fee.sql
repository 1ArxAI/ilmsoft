-- Recreate generate_individual_fee to support proper validation and satisfy foreign key constraints
CREATE OR REPLACE FUNCTION public.generate_individual_fee(
    p_school_id          UUID,
    p_parent_id          UUID,
    p_month              TEXT
)
RETURNS JSON 
SECURITY DEFINER
SET search_path = public
AS $$
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
$$ LANGUAGE plpgsql;
