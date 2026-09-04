-- ROLLBACK SNAPSHOT for Batch E, 2026-09-04T22:54:03.361Z
UPDATE storage.buckets SET file_size_limit=NULL, allowed_mime_types=NULL WHERE id='logos';
DROP POLICY IF EXISTS "Admins can insert admin_settings" ON public.admin_settings;
CREATE POLICY "Admins can insert admin_settings" ON public.admin_settings FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Admins can update admin_settings" ON public.admin_settings;
CREATE POLICY "Admins can update admin_settings" ON public.admin_settings FOR UPDATE
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
DROP POLICY IF EXISTS "Anyone can read admin_settings" ON public.admin_settings;
CREATE POLICY "Anyone can read admin_settings" ON public.admin_settings FOR SELECT
  USING (true);
DROP POLICY IF EXISTS "admin_insert_admin_settings" ON public.admin_settings;
CREATE POLICY "admin_insert_admin_settings" ON public.admin_settings FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users)));
DROP POLICY IF EXISTS "admin_update_admin_settings" ON public.admin_settings;
CREATE POLICY "admin_update_admin_settings" ON public.admin_settings FOR UPDATE
  USING ((auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users)));
DROP POLICY IF EXISTS "strict_admin_settings_read" ON public.admin_settings;
CREATE POLICY "strict_admin_settings_read" ON public.admin_settings FOR SELECT
  USING (((EXISTS ( SELECT 1
   FROM schools
  WHERE (schools.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text))))));
