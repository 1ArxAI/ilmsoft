# Audit remediation tasks

Rule for every task: **Plan → Perform → Test → Verify.** Production database. Each DB task is first dry-run inside a transaction that is rolled back, then applied, then verified from the catalog and from the public REST API. Pre-state DDL is snapshotted before any change so it can be restored.

Status: `[ ]` not started · `[~]` in progress · `[x]` done and verified · `[!]` blocked / needs decision

## Batch A — close the open doors (SQL only, no app change)

Migration: `sql/batch_A_close_open_doors.sql`. Applied 2026-09-04 (owner ran `node scripts/batch_A_apply.mjs apply`: 30/30 checks, COMMITTED). Verified externally with the public key afterwards. Backup taken first: `backups/2026-09-04T15-38-20-015Z/`.

- [x] **A0. Safety net.** (done 2026-09-04: `sql/rollback/pre_batch_A_2026-09-04.sql`; free tier has no backups, so our own full dump is taken with `scripts/db_dump.mjs` before every change) Snapshot current policies, grants and function DDL for every object touched in A1–A4 into `sql/rollback/` . Confirm Supabase backups are enabled (Dashboard → Database → Backups). Pre-state row counts recorded.
- [x] **A1. `payment_allocations` row security.** Enable RLS; add member SELECT policy via `payments`; make `trg_payment_to_ledger` SECURITY DEFINER with fixed `search_path` so payment inserts keep allocating. Dry-run: simulated owner inserts a payment, allocation + ledger rows appear, rolled back. Verify: anon GET returns no rows; a real payment still allocates.
- [x] **A2. `credit_requests` tampering.** Drop policy `admin_can_update_credit_requests`. Replace the school INSERT policy with one that forces `status = 'pending'`. Add CHECK pinning `(credits, amount_pkr)` to the two plans. Verify: owner cannot update own request; admin still can; existing 3 rows satisfy the CHECK.
- [x] **A3. `schools` credit self-update.** Revoke table-level UPDATE on `schools` from `anon`/`authenticated`; grant column-level UPDATE on the profile columns only. Verify: profile save still works (simulated); `total_credits` PATCH is refused.
- [x] **A4. Anonymous-callable functions.** Drop `deduct_daily_credits()` and `promote_students()`; revoke EXECUTE on `get_unpaid_months_summary` from PUBLIC/anon/authenticated. Verify: app source has no callers; anon RPC returns 404/401.

## Batch B — app fixes (code, then build, test, deploy)

B1–B4 done 2026-09-04: tsc clean, 0 npm vulnerabilities (react-router-dom 7.18.3), tests 4/4, build clean, bundle scanned for secrets. Awaiting commit + Netlify deploy (B5).

- [x] **B1.** Rename `VITE_SUPABASE_SERVICE_KEY` / `VITE_SUPABASE_PASSWORD` in `.env.local` (no `VITE_` prefix); move `pg` to devDependencies.
- [x] **B2.** `npm audit fix` (react-router-dom → 7.18.x, ws); `tsc`, lint, tests, build green.
- [x] **B3.** Parent-profile "Record Payment": send the page's `schoolId`, not `parent.school_id`.
- [x] **B4.** Search filter injection: sanitise the term in PaymentPortalV2 and LedgerManager.
- [~] **B5.** Pushed to `origin/master` as `e7edcb1` on 2026-09-04 (rebased on the three July commits; kept their `typecheck` script and `.editorconfig`, kept the deletion of the dead receipt test). Netlify deploy + one payment from the parent profile on a test parent: owner to confirm.

## Batch C — one fee system (decision 2026-09-04: keep what the schools use; retire the April tables)

Verified model (code + live data): a student's gross fee is entered per student, pre-filled from the class fee (`students.monthly_fee`); the discount lives on the student (`discount_type`, `discount_value`); the net is cached in `students.current_monthly_fee`. Monthly generation bills the cached net per student, records class + month + net in `student_monthly_fees` (permanent), and posts one ledger debit per parent. Payments post ledger credits and allocate oldest month first. Balance = credits − debits.

The April tables (`fee_structures`, `discounts`) and their triggers are the obsolete system. One of those triggers is what recomputes the cached fee on promotion today, so it must be replaced, not just dropped.

Migration: `sql/batch_C_one_fee_system.sql`. Rollback: `sql/rollback/pre_batch_C_2026-09-04.sql` + dropped-table rows in the backup. Dry run 2026-09-04: 30/30 checks pass (class fee change propagates to all students, promotion follows new class, typed fee ignored, bulk + individual generation bill class fee − discount, re-run skips, other school refused). App edits done: ArchiveManager no longer touches `discounts`; StudentModal fee field is read-only class fee. Applied 2026-09-04 by the owner (COMMITTED, 30/30). Post-commit verification: legacy tables gone, triggers present, 0 rule violations, billing Rs 63,750 unchanged, all counts unchanged. Backup before apply: `backups/2026-09-04T16-33-54-961Z/`.

- [x] **C0. Backup** (`scripts/db_dump.mjs`) + rollback snapshot of every object touched.
- [x] **C1. Recalculation from the live columns.** Rewrite `recalculate_student_fee` to read `classes.monthly_fee` + the student's own discount, and to refresh `students.monthly_fee` to the class fee on class change. Keep the two `students` triggers (class change, reactivation). Dry-run: promote a test student inside a rolled-back transaction, cached fee follows the new class.
- [x] **C2. Bulk generation audit columns.** `generate_bulk_fees` takes gross/discount from the same live columns so `net = gross − discount` holds on every fee row. Net billed stays `current_monthly_fee` (unchanged behaviour).
- [x] **C3. Drop the obsolete system.** Triggers on `discounts`/`fee_structures`; tables `fee_structures`, `discounts`, `monthly_fees`, `fee_payments`, `fee_receipts`; column `students.discount_id`; functions `generate_monthly_fees`, `get_parent_balance`, `get_unpaid_months_summary`, both `record_parent_payment`, `generate_receipt_number`, `generate_receipt_no()`, `create_receipt_sequence`, `create_school_on_signup`, `handle_new_user`, `recalculate_parent_balances`. App: remove the two `discounts` deletes in ArchiveManager and the `fee_receipts` code in receiptGenerator (receipts get rebuilt on `payments` in C4).
- [x] **C4. Legacy receipt tables.** Receipts are rendered on the fly (PaymentReceipt.tsx), so nothing is stored. Dropped `fee_receipts`, `fee_payments`, `generate_receipt_no(uuid)`; deleted unused `src/lib/receiptGenerator.ts` + test + 64 lines of unused types. Applied 2026-09-04 (9/9), verified. Backup `backups/2026-09-04T16-44-14-050Z/`, rollback `sql/rollback/pre_batch_C4_2026-09-04.sql`.
- [x] **C5. Class fee change propagation.** Decided 2026-09-04: no per-student override; a class fee change refreshes every student in that class (trigger in C1) and the next generation bills class fee − discount.
- [ ] **C6. Opening balances** (16 missing ledger rows, 2 negative) and the 1 orphaned payment — after the school confirms figures.

## Batch D — access model

- [x] **D1. Invites.** Migration `sql/batch_D1_invites.sql` (rollback `sql/rollback/pre_batch_D1_2026-09-04.sql`): `verify_invite(text)`/`claim_invite(text)` use status `pending` and `auth.uid()`, claim requires the invited email; public token-listing policy dropped; signup trigger links an invited manager instead of creating a school; stale tokens cleared. App: JoinInvite claims as the signed-in user, TeamManager upserts (re-invite works), AuthContext picks one membership deterministically. Dry run 2026-09-04: 25/25 (signup-with-token, claim, wrong email, re-claim, re-invite removed, regular signup, bogus token). Applied 2026-09-04 by the owner (COMMITTED, 25/25); verified internally and with the public key. Backup `backups/2026-09-04T20-06-17-951Z/`.
- [x] **D2. Manager role.** Rule (owner, 2026-09-04): managers do daily work — students, parents, payments, opening balances, fee generation, exams, extra-fee collection, income/expense records, suppliers + bills, custom receipts. Owners only: any delete, classes/fees, teachers, extra-fee definitions, categories, team, profile, billing, audit trail. Platform admin: read-only on tenant data (fixes the admin insights page). Migration `sql/batch_D2_manager_role.sql`: three SECURITY DEFINER helpers (`is_school_owner`, `is_school_member`, `is_platform_admin`), every tenant table gets one standard 4-policy set (105 → 101 policies, duplicates gone). Rollback `sql/rollback/pre_batch_D2_2026-09-04.sql` (all 105 policies). App: 10 `isOwner` gates now fail closed; exam-term delete and extra-fee un-pay hidden for managers. Dry run 2026-09-04: 50/50 (simulated manager, owner, other school, admin, anon). Applied 2026-09-04 by the owner (COMMITTED, 50/50); verified. Backup `backups/2026-09-04T21-46-25-797Z/`.
- [x] **D3. Credit expiry server-side.** `school_is_active(school_id)` added to every tenant write policy and both fee RPCs. Expired schools keep full read access, can buy credits and edit their profile; nothing else writes. The 5 expired schools today are empty trials (0–1 students, no payments); both live schools run to Mar 2027. Migration `sql/batch_D3D4_expiry_and_delete.sql`, rollback `sql/rollback/pre_batch_D3D4_2026-09-04.sql`.
- [x] **D4. Permanent delete.** `delete_parent_permanently` / `delete_student_permanently`: owner-only, one transaction, refuse any record with payments, fee rows, extra-fee payments or receipts (message says to deactivate instead). Duplicates without history still deletable. ArchiveManager calls the RPCs and shows the real error. Dry run 2026-09-04: 30/30. Applied 2026-09-04 by the owner (COMMITTED, 30/30); verified. Backup `backups/2026-09-04T22-07-08-598Z/`.

## Batch E — hygiene

- [ ] Scheduled backup: run `scripts/db_dump.mjs` nightly (launchd on the owner's Mac) and prune old folders.
- [ ] Drop dead functions and duplicate policies; archive legacy tables; logo bucket limits; `UpdatePassword` recovery check; CSP `unsafe-eval`; ErrorBoundary rejection swallowing; ESLint errors.
