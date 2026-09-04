-- Batch D1: make team invites work, and make them safe.
-- Before: the app wrote status 'pending' but verify_invite/claim_invite looked for 'invited' (a value the
-- CHECK constraint forbids) and compared a text column to a uuid parameter, so every invite link failed;
-- claim_invite trusted a client-supplied user id; a public policy let anyone list pending tokens; and the
-- signup trigger gave every invited manager a throwaway school with 30 free credits.
-- Rollback: sql/rollback/pre_batch_D1_2026-09-04.sql

BEGIN;

-- ------------------------------------------------------------------
-- 1. Nobody can list invite tokens. The RPC below is the only lookup path.
-- ------------------------------------------------------------------
DROP POLICY IF EXISTS "Public invite token lookup" ON public.school_members;

-- ------------------------------------------------------------------
-- 2. verify_invite: token in, school name + invited email out (pre-login page)
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_invite(uuid);
CREATE OR REPLACE FUNCTION public.verify_invite(p_token text)
 RETURNS TABLE(school_name text, email text, school_id uuid, role text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT s.school_name, sm.email, sm.school_id, sm.role
  FROM school_members sm
  JOIN schools s ON s.id = sm.school_id
  WHERE sm.invite_token = p_token AND sm.status = 'pending';
$$;
GRANT EXECUTE ON FUNCTION public.verify_invite(text) TO anon, authenticated;

-- ------------------------------------------------------------------
-- 3. claim_invite: the SIGNED-IN user claims the invite addressed to their email
-- ------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_invite(uuid, uuid);
CREATE OR REPLACE FUNCTION public.claim_invite(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_member school_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to accept an invitation' USING ERRCODE = '42501';
  END IF;
  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;

  SELECT * INTO v_member FROM school_members
  WHERE invite_token = p_token AND status = 'pending'
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already used invitation';
  END IF;
  IF lower(v_member.email) <> v_email THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM school_members
             WHERE school_id = v_member.school_id AND user_id = v_uid AND status = 'active') THEN
    RAISE EXCEPTION 'You are already a member of this school';
  END IF;

  UPDATE school_members
  SET user_id = v_uid, status = 'active', invite_token = NULL, updated_at = now()
  WHERE id = v_member.id;

  RETURN v_member.school_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_invite(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_invite(text) TO authenticated;

-- ------------------------------------------------------------------
-- 4. Signup trigger: an invited manager joins their school instead of getting a new one
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, auth
AS $$
DECLARE
  new_school_id  uuid;
  v_school_name  text;
  v_contact      text;
  v_token        text;
  v_claimed      int := 0;
BEGIN
  BEGIN
    v_token := new.raw_user_meta_data->>'invite_token';

    IF v_token IS NOT NULL AND v_token <> '' THEN
      -- Invited manager: link the pending membership addressed to this email. No school is created.
      UPDATE public.school_members
      SET user_id = new.id, status = 'active', invite_token = NULL, updated_at = now()
      WHERE invite_token = v_token AND status = 'pending' AND lower(email) = lower(new.email);
      GET DIAGNOSTICS v_claimed = ROW_COUNT;
      IF v_claimed = 0 THEN
        RAISE LOG 'Onboarding: invite token for user % did not match a pending invitation', new.id;
      END IF;
      RETURN new;
    END IF;

    -- Regular signup: create the school and its owner membership.
    v_school_name := COALESCE(new.raw_user_meta_data->>'school_name', 'My School');
    v_contact     := COALESCE(new.raw_user_meta_data->>'contact', 'Not Provided');

    INSERT INTO public.schools (
      user_id, school_name, contact, email, total_credits, credit_expires_at,
      primary_color, secondary_color, tertiary_color, logo_url, address)
    VALUES (
      new.id, v_school_name, v_contact, new.email, 30, now() + interval '30 days',
      '#4f46e5', '#818cf8', '#c7d2fe', '', '')
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO new_school_id;

    IF new_school_id IS NULL THEN
      SELECT id INTO new_school_id FROM public.schools WHERE user_id = new.id;
    END IF;
    IF new_school_id IS NOT NULL THEN
      INSERT INTO public.school_members (school_id, user_id, email, role, status)
      VALUES (new_school_id, new.id, new.email, 'owner', 'active')
      ON CONFLICT (school_id, email) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'Onboarding failed for user %: %', new.id, SQLERRM;
  END;
  RETURN new;
END;
$$;

-- ------------------------------------------------------------------
-- 5. Hygiene: tokens only live on pending rows
-- ------------------------------------------------------------------
UPDATE public.school_members SET invite_token = NULL WHERE status <> 'pending' AND invite_token IS NOT NULL;

COMMIT;
