-- ROLLBACK SNAPSHOT for Batch D2, taken 2026-09-04T21:42:37.685Z: EVERY policy in public as it was.
-- To restore: drop the D2 policies on each table (they are named <table>_select/_insert/_update/_delete),
-- drop is_school_owner/is_school_member/is_platform_admin, then run this file.


-- ===== admin_settings (rls=true) =====
CREATE POLICY "Admins can insert admin_settings" ON public.admin_settings AS PERMISSIVE FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Admins can update admin_settings" ON public.admin_settings AS PERMISSIVE FOR UPDATE
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Anyone can read admin_settings" ON public.admin_settings AS PERMISSIVE FOR SELECT
  USING (true);
CREATE POLICY "admin_insert_admin_settings" ON public.admin_settings AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users)));
CREATE POLICY "admin_update_admin_settings" ON public.admin_settings AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() IN ( SELECT admin_users.user_id
   FROM admin_users)));
CREATE POLICY "strict_admin_settings_read" ON public.admin_settings AS PERMISSIVE FOR SELECT
  USING (((EXISTS ( SELECT 1
   FROM schools
  WHERE (schools.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text))))));

-- ===== admin_users (rls=true) =====
CREATE POLICY "Users can view own admin record" ON public.admin_users AS PERMISSIVE FOR SELECT
  USING ((user_id = auth.uid()));

-- ===== audit_logs (rls=true) =====
CREATE POLICY "school_owner_read_audit" ON public.audit_logs AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== classes (rls=true) =====
CREATE POLICY "Schools can delete their own classes" ON public.classes AS PERMISSIVE FOR DELETE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = classes.school_id))));
CREATE POLICY "Schools can insert their own classes" ON public.classes AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = classes.school_id))));
CREATE POLICY "Schools can update their own classes" ON public.classes AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = classes.school_id))));
CREATE POLICY "Schools can view their own classes" ON public.classes AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = classes.school_id))));

-- ===== credit_requests (rls=true) =====
CREATE POLICY "Admins can manage credit requests" ON public.credit_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Admins can view all credit requests" ON public.credit_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Schools can create requests" ON public.credit_requests AS PERMISSIVE FOR INSERT
  WITH CHECK (((status = 'pending'::text) AND (auth.uid() IN ( SELECT s.user_id
   FROM schools s
  WHERE (s.id = credit_requests.school_id)))));
CREATE POLICY "Schools can view their own requests" ON public.credit_requests AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = credit_requests.school_id))));

-- ===== custom_receipts (rls=true) =====
CREATE POLICY "Schools can manage their own custom receipts" ON public.custom_receipts AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== exam_results (rls=true) =====
CREATE POLICY "Owners can manage exam results" ON public.exam_results AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Users can read own school exam results" ON public.exam_results AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT user_school_ids() AS user_school_ids)));

-- ===== exam_term_configs (rls=true) =====
CREATE POLICY "Owners can manage exam configs" ON public.exam_term_configs AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Users can read own school exam configs" ON public.exam_term_configs AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT user_school_ids() AS user_school_ids)));

-- ===== exam_terms (rls=true) =====
CREATE POLICY "Owners can delete exam terms" ON public.exam_terms AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners can insert exam terms" ON public.exam_terms AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners can update exam terms" ON public.exam_terms AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Users can read own school exam terms" ON public.exam_terms AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT user_school_ids() AS user_school_ids)));

-- ===== expense_categories (rls=true) =====
CREATE POLICY "Schools can manage their expense categories" ON public.expense_categories AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can view their expense categories" ON public.expense_categories AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== expenses (rls=true) =====
CREATE POLICY "Schools can manage their expenses" ON public.expenses AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can view their expenses" ON public.expenses AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== extra_fee_payments (rls=true) =====
CREATE POLICY "Allow delete for school owners/managers" ON public.extra_fee_payments AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())
UNION
 SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Allow insert for owners" ON public.extra_fee_payments AS PERMISSIVE FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = extra_fee_payments.school_id) AND (schools.user_id = auth.uid())))));
CREATE POLICY "Allow read access for members" ON public.extra_fee_payments AS PERMISSIVE FOR SELECT
  USING (((EXISTS ( SELECT 1
   FROM school_members
  WHERE ((school_members.school_id = extra_fee_payments.school_id) AND (school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = extra_fee_payments.school_id) AND (schools.user_id = auth.uid()))))));
CREATE POLICY "Users can delete their own payments" ON public.extra_fee_payments AS PERMISSIVE FOR DELETE
  USING ((school_id = auth.uid()));

-- ===== extra_fees (rls=true) =====
CREATE POLICY "Allow insert for owners" ON public.extra_fees AS PERMISSIVE FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = extra_fees.school_id) AND (schools.user_id = auth.uid())))));
CREATE POLICY "Allow read access for members" ON public.extra_fees AS PERMISSIVE FOR SELECT
  USING (((EXISTS ( SELECT 1
   FROM school_members
  WHERE ((school_members.school_id = extra_fees.school_id) AND (school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = extra_fees.school_id) AND (schools.user_id = auth.uid()))))));
CREATE POLICY "Allow update for owners" ON public.extra_fees AS PERMISSIVE FOR UPDATE
  USING ((EXISTS ( SELECT 1
   FROM schools
  WHERE ((schools.id = extra_fees.school_id) AND (schools.user_id = auth.uid())))));

-- ===== fee_generations (rls=true) =====
CREATE POLICY "school_member_insert_fee_generations" ON public.fee_generations AS PERMISSIVE FOR INSERT
  WITH CHECK (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_select_fee_generations" ON public.fee_generations AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_update_fee_generations" ON public.fee_generations AS PERMISSIVE FOR UPDATE
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_owner_delete_fee_generations" ON public.fee_generations AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== income_categories (rls=true) =====
CREATE POLICY "income_cat_delete" ON public.income_categories AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "income_cat_insert" ON public.income_categories AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "income_cat_select" ON public.income_categories AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== income_records (rls=true) =====
CREATE POLICY "income_rec_delete" ON public.income_records AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "income_rec_insert" ON public.income_records AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "income_rec_select" ON public.income_records AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "income_rec_update" ON public.income_records AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== ledger (rls=true) =====
CREATE POLICY "school_member_insert_ledger" ON public.ledger AS PERMISSIVE FOR INSERT
  WITH CHECK (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_select_ledger" ON public.ledger AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_update_ledger" ON public.ledger AS PERMISSIVE FOR UPDATE
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_owner_delete_ledger" ON public.ledger AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== parents (rls=true) =====
CREATE POLICY "Admins can view all parents" ON public.parents AS PERMISSIVE FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Members can modify parents" ON public.parents AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Members can view parents" ON public.parents AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Owners can modify parents" ON public.parents AS PERMISSIVE FOR ALL
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners can view parents" ON public.parents AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Parents delete own" ON public.parents AS PERMISSIVE FOR DELETE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Parents insert own" ON public.parents AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Parents update own" ON public.parents AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Parents view own" ON public.parents AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Schools can create parents" ON public.parents AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Schools can delete their own parents" ON public.parents AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can delete their parents" ON public.parents AS PERMISSIVE FOR DELETE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Schools can insert their own parents" ON public.parents AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can update their own parents" ON public.parents AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Schools can update their parents" ON public.parents AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));
CREATE POLICY "Schools can view their own parents" ON public.parents AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = parents.school_id))));

-- ===== payment_allocations (rls=true) =====
CREATE POLICY "school_member_select_payment_allocations" ON public.payment_allocations AS PERMISSIVE FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = payment_allocations.payment_id) AND (p.school_id IN ( SELECT user_school_ids() AS user_school_ids))))));

-- ===== payments (rls=true) =====
CREATE POLICY "school_member_insert_payments" ON public.payments AS PERMISSIVE FOR INSERT
  WITH CHECK (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_select_payments" ON public.payments AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_update_payments" ON public.payments AS PERMISSIVE FOR UPDATE
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_owner_delete_payments" ON public.payments AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== school_members (rls=true) =====
CREATE POLICY "Owners delete members" ON public.school_members AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners insert members" ON public.school_members AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners update members" ON public.school_members AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Read own school members" ON public.school_members AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT user_school_ids() AS user_school_ids)));

-- ===== schools (rls=true) =====
CREATE POLICY "Admins can view all schools" ON public.schools AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Schools can update their own profile" ON public.schools AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() = user_id));
CREATE POLICY "Schools can view their own profile" ON public.schools AS PERMISSIVE FOR SELECT
  USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their school profile" ON public.schools AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() = user_id));

-- ===== student_monthly_fees (rls=true) =====
CREATE POLICY "school_member_insert_student_monthly_fees" ON public.student_monthly_fees AS PERMISSIVE FOR INSERT
  WITH CHECK (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_select_student_monthly_fees" ON public.student_monthly_fees AS PERMISSIVE FOR SELECT
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_member_update_student_monthly_fees" ON public.student_monthly_fees AS PERMISSIVE FOR UPDATE
  USING (((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))) OR (school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid())))));
CREATE POLICY "school_owner_delete_student_monthly_fees" ON public.student_monthly_fees AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== students (rls=true) =====
CREATE POLICY "Admins can view all students" ON public.students AS PERMISSIVE FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM admin_users
  WHERE (admin_users.user_id = auth.uid()))));
CREATE POLICY "Members can delete students" ON public.students AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Members can insert students" ON public.students AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Members can update students" ON public.students AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Members can view students" ON public.students AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT school_members.school_id
   FROM school_members
  WHERE ((school_members.user_id = auth.uid()) AND (school_members.status = 'active'::text)))));
CREATE POLICY "Owners can delete students" ON public.students AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners can insert students" ON public.students AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners can update students" ON public.students AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "Owners can view students" ON public.students AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== supplier_transactions (rls=true) =====
CREATE POLICY "supplier_tx_delete" ON public.supplier_transactions AS PERMISSIVE FOR DELETE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "supplier_tx_insert" ON public.supplier_transactions AS PERMISSIVE FOR INSERT
  WITH CHECK ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "supplier_tx_select" ON public.supplier_transactions AS PERMISSIVE FOR SELECT
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));
CREATE POLICY "supplier_tx_update" ON public.supplier_transactions AS PERMISSIVE FOR UPDATE
  USING ((school_id IN ( SELECT schools.id
   FROM schools
  WHERE (schools.user_id = auth.uid()))));

-- ===== suppliers (rls=true) =====
CREATE POLICY "Schools can delete their own suppliers" ON public.suppliers AS PERMISSIVE FOR DELETE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = suppliers.school_id))));
CREATE POLICY "Schools can insert their own suppliers" ON public.suppliers AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = suppliers.school_id))));
CREATE POLICY "Schools can update their own suppliers" ON public.suppliers AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = suppliers.school_id))));
CREATE POLICY "Schools can view their own suppliers" ON public.suppliers AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = suppliers.school_id))));

-- ===== teachers (rls=true) =====
CREATE POLICY "Schools can create teachers" ON public.teachers AS PERMISSIVE FOR INSERT
  WITH CHECK ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = teachers.school_id))));
CREATE POLICY "Schools can delete their teachers" ON public.teachers AS PERMISSIVE FOR DELETE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = teachers.school_id))));
CREATE POLICY "Schools can update their teachers" ON public.teachers AS PERMISSIVE FOR UPDATE
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = teachers.school_id))));
CREATE POLICY "Schools can view their own teachers" ON public.teachers AS PERMISSIVE FOR SELECT
  USING ((auth.uid() IN ( SELECT schools.user_id
   FROM schools
  WHERE (schools.id = teachers.school_id))));
