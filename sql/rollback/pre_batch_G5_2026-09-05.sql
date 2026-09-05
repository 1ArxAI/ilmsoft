-- ROLLBACK SNAPSHOT Batch G5 2026-09-05T00:01:17.318Z
DROP VIEW IF EXISTS public.class_student_counts;
DROP FUNCTION IF EXISTS public.school_financial_totals(uuid);
DROP FUNCTION IF EXISTS public.missing_fee_parents(uuid,text);
DROP FUNCTION IF EXISTS public.generate_fees_for_parents(uuid,uuid[],text);
DROP TRIGGER IF EXISTS trigger_supplier_balance_sync ON public.supplier_transactions;
DROP FUNCTION IF EXISTS public.trg_supplier_balance_sync();
CREATE OR REPLACE FUNCTION public.update_supplier_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- On insert or opening_balance update
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.opening_balance IS DISTINCT FROM NEW.opening_balance) THEN
    -- Set current_balance to opening_balance initially
    NEW.current_balance := NEW.opening_balance;
  END IF;
  RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS supplier_balance_trigger ON public.suppliers;
CREATE TRIGGER supplier_balance_trigger BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_supplier_balance();
-- suppliers.current_balance values before: [{"id":"2b34387e-fefe-4916-9ae1-dd7e276a013c","current_balance":-6246},{"id":"fb48503d-df1d-4d9d-bd9b-ceef91951416","current_balance":323},{"id":"21d35f01-b392-4c7b-bc03-2d0a64858b69","current_balance":3525330}]
