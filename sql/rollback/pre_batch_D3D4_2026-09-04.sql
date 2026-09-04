-- ROLLBACK SNAPSHOT for Batch D3D4, taken 2026-09-04T22:05:21.870Z: EVERY policy in public as it was.
-- To restore: drop the D3 write policies (<table>_insert/_update/_delete) and school_is_active, delete_*_permanently,
-- then run this file (functions generate_bulk_fees / generate_individual_fee: re-run sql/batch_C_one_fee_system.sql C2 section).


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
CREATE POLICY "audit_logs_select" ON public.audit_logs AS PERMISSIVE FOR SELECT
  USING (is_school_owner(school_id));

-- ===== classes (rls=true) =====
CREATE POLICY "classes_delete" ON public.classes AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "classes_insert" ON public.classes AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "classes_select" ON public.classes AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "classes_update" ON public.classes AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

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
CREATE POLICY "custom_receipts_delete" ON public.custom_receipts AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "custom_receipts_insert" ON public.custom_receipts AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "custom_receipts_select" ON public.custom_receipts AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "custom_receipts_update" ON public.custom_receipts AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== exam_results (rls=true) =====
CREATE POLICY "exam_results_delete" ON public.exam_results AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "exam_results_insert" ON public.exam_results AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "exam_results_select" ON public.exam_results AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "exam_results_update" ON public.exam_results AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== exam_term_configs (rls=true) =====
CREATE POLICY "exam_term_configs_delete" ON public.exam_term_configs AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "exam_term_configs_insert" ON public.exam_term_configs AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "exam_term_configs_select" ON public.exam_term_configs AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "exam_term_configs_update" ON public.exam_term_configs AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== exam_terms (rls=true) =====
CREATE POLICY "exam_terms_delete" ON public.exam_terms AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "exam_terms_insert" ON public.exam_terms AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "exam_terms_select" ON public.exam_terms AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "exam_terms_update" ON public.exam_terms AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== expense_categories (rls=true) =====
CREATE POLICY "expense_categories_delete" ON public.expense_categories AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "expense_categories_insert" ON public.expense_categories AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "expense_categories_select" ON public.expense_categories AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "expense_categories_update" ON public.expense_categories AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== expenses (rls=true) =====
CREATE POLICY "expenses_delete" ON public.expenses AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "expenses_insert" ON public.expenses AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "expenses_select" ON public.expenses AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "expenses_update" ON public.expenses AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== extra_fee_payments (rls=true) =====
CREATE POLICY "extra_fee_payments_delete" ON public.extra_fee_payments AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "extra_fee_payments_insert" ON public.extra_fee_payments AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "extra_fee_payments_select" ON public.extra_fee_payments AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "extra_fee_payments_update" ON public.extra_fee_payments AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== extra_fees (rls=true) =====
CREATE POLICY "extra_fees_delete" ON public.extra_fees AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "extra_fees_insert" ON public.extra_fees AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "extra_fees_select" ON public.extra_fees AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "extra_fees_update" ON public.extra_fees AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== fee_generations (rls=true) =====
CREATE POLICY "fee_generations_delete" ON public.fee_generations AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "fee_generations_insert" ON public.fee_generations AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "fee_generations_select" ON public.fee_generations AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "fee_generations_update" ON public.fee_generations AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== income_categories (rls=true) =====
CREATE POLICY "income_categories_delete" ON public.income_categories AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "income_categories_insert" ON public.income_categories AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "income_categories_select" ON public.income_categories AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "income_categories_update" ON public.income_categories AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== income_records (rls=true) =====
CREATE POLICY "income_records_delete" ON public.income_records AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "income_records_insert" ON public.income_records AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "income_records_select" ON public.income_records AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "income_records_update" ON public.income_records AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== ledger (rls=true) =====
CREATE POLICY "ledger_delete" ON public.ledger AS PERMISSIVE FOR DELETE
  USING ((is_school_owner(school_id) OR (is_school_member(school_id) AND (reference_type = 'opening_balance'::text))));
CREATE POLICY "ledger_insert" ON public.ledger AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "ledger_select" ON public.ledger AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "ledger_update" ON public.ledger AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== parents (rls=true) =====
CREATE POLICY "parents_delete" ON public.parents AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "parents_insert" ON public.parents AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "parents_select" ON public.parents AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "parents_update" ON public.parents AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== payment_allocations (rls=true) =====
CREATE POLICY "payment_allocations_select" ON public.payment_allocations AS PERMISSIVE FOR SELECT
  USING ((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = payment_allocations.payment_id) AND (is_school_member(p.school_id) OR is_platform_admin())))));

-- ===== payments (rls=true) =====
CREATE POLICY "payments_delete" ON public.payments AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "payments_insert" ON public.payments AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "payments_select" ON public.payments AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "payments_update" ON public.payments AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

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
CREATE POLICY "student_monthly_fees_delete" ON public.student_monthly_fees AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "student_monthly_fees_insert" ON public.student_monthly_fees AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "student_monthly_fees_select" ON public.student_monthly_fees AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "student_monthly_fees_update" ON public.student_monthly_fees AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== students (rls=true) =====
CREATE POLICY "students_delete" ON public.students AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "students_insert" ON public.students AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "students_select" ON public.students AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "students_update" ON public.students AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== supplier_transactions (rls=true) =====
CREATE POLICY "supplier_transactions_delete" ON public.supplier_transactions AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "supplier_transactions_insert" ON public.supplier_transactions AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "supplier_transactions_select" ON public.supplier_transactions AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "supplier_transactions_update" ON public.supplier_transactions AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));

-- ===== suppliers (rls=true) =====
CREATE POLICY "suppliers_delete" ON public.suppliers AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "suppliers_insert" ON public.suppliers AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_member(school_id));
CREATE POLICY "suppliers_select" ON public.suppliers AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "suppliers_update" ON public.suppliers AS PERMISSIVE FOR UPDATE
  USING (is_school_member(school_id))
  WITH CHECK (is_school_member(school_id));

-- ===== teachers (rls=true) =====
CREATE POLICY "teachers_delete" ON public.teachers AS PERMISSIVE FOR DELETE
  USING (is_school_owner(school_id));
CREATE POLICY "teachers_insert" ON public.teachers AS PERMISSIVE FOR INSERT
  WITH CHECK (is_school_owner(school_id));
CREATE POLICY "teachers_select" ON public.teachers AS PERMISSIVE FOR SELECT
  USING ((is_school_member(school_id) OR is_platform_admin()));
CREATE POLICY "teachers_update" ON public.teachers AS PERMISSIVE FOR UPDATE
  USING (is_school_owner(school_id))
  WITH CHECK (is_school_owner(school_id));
