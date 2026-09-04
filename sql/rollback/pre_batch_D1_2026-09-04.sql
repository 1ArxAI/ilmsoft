-- ROLLBACK SNAPSHOT for Batch D1, taken 2026-09-04T20:04:14.524Z from the live catalog.

DROP POLICY IF EXISTS "Owners delete members" ON public.school_members;
CREATE POLICY "Owners delete members" ON public.school_members AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Owners insert members" ON public.school_members;
CREATE POLICY "Owners insert members" ON public.school_members AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Owners update members" ON public.school_members;
CREATE POLICY "Owners update members" ON public.school_members AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Public invite token lookup" ON public.school_members;
CREATE POLICY "Public invite token lookup" ON public.school_members AS PERMISSIVE FOR SELECT
  USING (((invite_token IS NOT NULL) AND (status = 'pending'::text)));
DROP POLICY IF EXISTS "Read own school members" ON public.school_members;
CREATE POLICY "Read own school members" ON public.school_members AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT user_school_ids() AS user_school_ids)));

-- ===== function verify_invite(p_token uuid) =====
-- (drop the D1 replacement first: DROP FUNCTION IF EXISTS public.verify_invite(text);)
CREATE OR REPLACE FUNCTION public.verify_invite(p_token uuid)
 RETURNS TABLE(school_name text, email text, school_id uuid, role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    BEGIN
      RETURN QUERY
      SELECT s.school_name::TEXT, sm.email::TEXT, sm.school_id, sm.role::TEXT
      FROM public.school_members sm
      JOIN public.schools s ON s.id = sm.school_id
      WHERE sm.invite_token = p_token AND sm.status = 'invited';
    END;
    $function$
;
GRANT EXECUTE ON FUNCTION public.verify_invite(p_token uuid) TO anon, authenticated;

-- ===== function claim_invite(p_token uuid, p_user_id uuid) =====
-- (drop the D1 replacement first: DROP FUNCTION IF EXISTS public.claim_invite(text);)
CREATE OR REPLACE FUNCTION public.claim_invite(p_token uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      v_member RECORD;
    BEGIN
      SELECT * INTO v_member FROM public.school_members
      WHERE invite_token = p_token AND status = 'invited';

      IF v_member IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.school_members
        WHERE school_id = v_member.school_id AND user_id = p_user_id AND status = 'active'
      ) THEN
        RAISE EXCEPTION 'Already a member of this school';
      END IF;

      UPDATE public.school_members
      SET user_id = p_user_id, status = 'active', invite_token = NULL
      WHERE id = v_member.id;

      RETURN v_member.school_id;
    END;
    $function$
;
GRANT EXECUTE ON FUNCTION public.claim_invite(p_token uuid, p_user_id uuid) TO anon, authenticated;

-- ===== function handle_new_user_onboarding() =====
-- (drop the D1 replacement first: DROP FUNCTION IF EXISTS public.handle_new_user_onboarding(text);)
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_school_id  UUID;
  v_school_name  TEXT;
  v_contact      TEXT;
  v_expires_at   TIMESTAMPTZ;
BEGIN
  -- CRITICAL: Set search_path to public so downstream triggers can find their tables.
  SET search_path = public, auth;

  BEGIN
    v_school_name := COALESCE(new.raw_user_meta_data->>'school_name', 'My School');
    v_contact     := COALESCE(new.raw_user_meta_data->>'contact', 'Not Provided');
    v_expires_at  := now() + interval '30 days';

    -- A. Create the school profile
    INSERT INTO public.schools (
      user_id, school_name, contact, email, total_credits, credit_expires_at,
      primary_color, secondary_color, tertiary_color, logo_url, address
    )
    VALUES (
      new.id, v_school_name, v_contact, new.email, 30, v_expires_at,
      '#4f46e5', '#818cf8', '#c7d2fe', '', ''
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO new_school_id;

    -- B. Ensure owner membership exists
    IF new_school_id IS NULL THEN
      SELECT id INTO new_school_id FROM public.schools WHERE user_id = new.id;
    END IF;

    IF new_school_id IS NOT NULL THEN
      INSERT INTO public.school_members (school_id, user_id, email, role, status)
      VALUES (new_school_id, new.id, new.email, 'owner', 'active')
      ON CONFLICT (school_id, email) DO NOTHING;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log the error to Postgres Logs for audit
    RAISE LOG 'Onboarding failed for user %: %', new.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
;
GRANT EXECUTE ON FUNCTION public.handle_new_user_onboarding() TO anon, authenticated;

-- trigger: CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_onboarding();

-- school_members pre-state (6 rows; token values are in the backup JSON): [{"id":"c07314ca-c43f-408b-ab3e-513219a61cd3","status":"active","role":"owner","has_token":false},{"id":"3cf78e6c-b713-4137-a0c4-d2c9de3f08cd","status":"removed","role":"manager","has_token":true},{"id":"4c26d087-efaa-4e76-8bb7-c4a369aeaad6","status":"active","role":"owner","has_token":false},{"id":"b609840b-93fb-49b6-afdd-cafa381bffb1","status":"active","role":"owner","has_token":false},{"id":"9e8c9e81-212d-418e-beb3-2e29b182fd8a","status":"active","role":"owner","has_token":false},{"id":"7dca0cb2-6133-4ad7-898f-e91393db7938","status":"removed","role":"manager","has_token":true}]
