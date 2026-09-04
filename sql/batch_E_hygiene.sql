-- Batch E (database part): hygiene.
-- Rollback: sql/rollback/pre_batch_E_2026-09-04.sql

BEGIN;

-- E3. Logo bucket: any signed-in user could upload files of any size or type. 2 MB, images only.
UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
WHERE id = 'logos';

-- E4. admin_settings had six overlapping policies saying three things. Keep one of each.
DROP POLICY IF EXISTS "Anyone can read admin_settings"     ON public.admin_settings;  -- anon has no SELECT grant anyway
DROP POLICY IF EXISTS "Admins can insert admin_settings"   ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can update admin_settings"   ON public.admin_settings;
-- kept: strict_admin_settings_read (members + admins), admin_insert_admin_settings, admin_update_admin_settings

COMMIT;
