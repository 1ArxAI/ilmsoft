-- ROLLBACK SNAPSHOT for Batch C4, taken 2026-09-04T16:43:24.042Z from the live catalog.
-- Row data: backups/<stamp>/data/public.{fee_payments,fee_receipts}.json


-- ===== table fee_payments =====
CREATE TABLE public.fee_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  amount integer NOT NULL,
  months_paid text[] NOT NULL,
  months_count integer NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'Cash'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_amount_check CHECK ((amount > 0));
CREATE INDEX idx_fee_payments_parent ON public.fee_payments USING btree (parent_id, created_at DESC);
CREATE INDEX idx_fee_payments_school ON public.fee_payments USING btree (school_id);
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee_payments_delete" ON public.fee_payments AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "fee_payments_insert" ON public.fee_payments AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "fee_payments_select" ON public.fee_payments AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "fee_payments_update" ON public.fee_payments AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_payments TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_payments TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_payments TO service_role;

-- ===== table fee_receipts =====
CREATE TABLE public.fee_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL,
  school_id uuid NOT NULL,
  parent_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  receipt_data jsonb NOT NULL,
  sent_via text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_receipt_no_key UNIQUE (receipt_no);
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_pkey PRIMARY KEY (id);
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES parents(id);
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES fee_payments(id);
ALTER TABLE public.fee_receipts ADD CONSTRAINT fee_receipts_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
CREATE INDEX idx_fee_receipts_parent ON public.fee_receipts USING btree (parent_id, created_at DESC);
CREATE INDEX idx_fee_receipts_receipt_no ON public.fee_receipts USING btree (receipt_no);
CREATE INDEX idx_fee_receipts_payment ON public.fee_receipts USING btree (payment_id);
CREATE INDEX idx_fee_receipts_school_id ON public.fee_receipts USING btree (school_id);
ALTER TABLE public.fee_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee_receipts_delete" ON public.fee_receipts AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "fee_receipts_insert" ON public.fee_receipts AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "fee_receipts_select" ON public.fee_receipts AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_receipts TO anon;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_receipts TO authenticated;
GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fee_receipts TO service_role;

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
