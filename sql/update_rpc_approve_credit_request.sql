-- Migration: Redefine approve_credit_request to calculate dynamic usage days based on credit purchase (1 credit = 1 day) and secure caller authorization.
-- Author: Antigravity AI

CREATE OR REPLACE FUNCTION public.approve_credit_request(request_id uuid, admin_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      v_request RECORD;
    BEGIN
      -- Verify caller is admin (skip for direct postgres superuser/service_role calls)
      IF current_user != 'postgres' AND current_user != 'service_role' THEN
        IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
          RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
        END IF;
      END IF;

      -- Double check that the admin_user_id matches the caller if specified
      IF auth.uid() IS NOT NULL AND auth.uid() != admin_user_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller identity mismatch';
      END IF;

      SELECT * INTO v_request FROM public.credit_requests WHERE id = request_id;
      IF v_request IS NULL OR v_request.status != 'pending' THEN
        RETURN false;
      END IF;

      UPDATE public.credit_requests SET status = 'approved' WHERE id = request_id;

      UPDATE public.schools
      SET total_credits = total_credits + v_request.credits,
          credit_expires_at = GREATEST(COALESCE(credit_expires_at, NOW()), NOW()) + (v_request.credits * INTERVAL '1 day')
      WHERE id = v_request.school_id;

      RETURN true;
    END;
    $function$;
