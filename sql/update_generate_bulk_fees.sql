-- Update generate_bulk_fees to support class-wise selection
CREATE OR REPLACE FUNCTION generate_bulk_fees(
    p_school_id          UUID,
    p_months             TEXT[],
    p_class_ids          UUID[] DEFAULT NULL,
    p_include_unassigned BOOLEAN DEFAULT TRUE
)
RETURNS JSON AS $$
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
        INSERT INTO ledger (
          school_id, parent_id, entry_type, amount,
          reference_type, reference_id, description, month
        ) VALUES (
          p_school_id, v_parent_totals.parent_id, 'debit', v_parent_totals.parent_total,
          'fee_generation', v_generation_id,
          'Monthly fee: ' || v_month, v_month
        );
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
$$ LANGUAGE plpgsql;
