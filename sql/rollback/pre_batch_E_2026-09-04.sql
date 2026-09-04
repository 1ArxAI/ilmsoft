-- ROLLBACK SNAPSHOT for Batch E, 2026-09-04T23:14:31.611Z
UPDATE storage.buckets SET file_size_limit=2097152, allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'] WHERE id='logos';
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
