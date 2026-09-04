// Batch A applier with built-in verification.
//   node scripts/batch_A_apply.mjs dryrun   -> applies sql/batch_A_close_open_doors.sql inside a transaction,
//                                             runs 30 catalog + behavioural checks as anon / owner / other owner / admin,
//                                             then ROLLS BACK everything. Nothing persists.
//   node scripts/batch_A_apply.mjs apply    -> same, but COMMITs the migration if every check passes.
//                                             Behavioural test rows are rolled back to a savepoint before commit,
//                                             so no test payment / request / audit row is left behind.
// Rollback of a committed run: sql/rollback/pre_batch_A_2026-09-04.sql. Backup: backups/2026-09-04T15-38-20-015Z.
import fs from 'node:fs'; import pg from 'pg';
const mode = process.argv[2]; if (!['dryrun','apply'].includes(mode)) { console.error('usage: node scripts/batch_A_apply.mjs dryrun|apply'); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const c = new pg.Client({ host: env.SUPABASE_DB_HOST, port: +env.SUPABASE_DB_PORT, database: env.SUPABASE_DB_NAME, user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures = 0;
const ok = (name, cond, detail='') => { console.log(`${cond?'PASS':'FAIL'}  ${name}${detail?'  — '+detail:''}`); if(!cond) failures++; };
const as = async (uid, role='authenticated') => { await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({sub: uid, role})]); await c.query(`SET LOCAL ROLE ${role}`); };
const reset = async () => { await c.query('RESET ROLE'); await c.query(`SELECT set_config('request.jwt.claims', '', true)`); };
const tryq = async (sql, params=[]) => { await c.query('SAVEPOINT t'); try { const r = await c.query(sql, params); await c.query('RELEASE SAVEPOINT t'); return {ok:true, r}; } catch(e) { await c.query('ROLLBACK TO SAVEPOINT t'); return {ok:false, err:e.message}; } };

// Fixture ids (ids only, no PII). School: the one with the most active students.
const fx = (await c.query(`
  SELECT s.id school_id, s.user_id owner_uid,
    (SELECT p.id FROM parents p WHERE p.school_id=s.id AND p.is_active AND EXISTS (SELECT 1 FROM student_monthly_fees f WHERE f.parent_id=p.id AND f.net_amount > COALESCE((SELECT sum(a.allocated_amount) FROM payment_allocations a WHERE a.student_monthly_fee_id=f.id),0)) ORDER BY p.created_at LIMIT 1) parent_id,
    (SELECT s2.user_id FROM schools s2 WHERE s2.id<>s.id AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=s2.user_id) ORDER BY s2.created_at LIMIT 1) other_owner_uid,
    (SELECT a.user_id FROM admin_users a LIMIT 1) admin_uid,
    (SELECT cr.id FROM credit_requests cr WHERE cr.school_id=s.id LIMIT 1) own_request_id
  FROM schools s WHERE s.id='3a13ea3e-b5c2-4129-8313-58e034a84141'`)).rows[0];
console.log('fixtures:', JSON.stringify(fx));

const sql = fs.readFileSync('sql/batch_A_close_open_doors.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try {
  const pre = (await c.query(`SELECT (SELECT count(*) FROM payment_allocations) pa,(SELECT count(*) FROM payments) p,(SELECT count(*) FROM ledger) l`)).rows[0];
  await c.query(sql);
  console.log('\n-- migration applied inside transaction --\n');
  await c.query('SAVEPOINT behav');

  // ---- catalog checks
  const cat = (await c.query(`SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid='public.payment_allocations'::regclass) pa_rls,
    (SELECT count(*) FROM pg_policy WHERE polrelid='public.payment_allocations'::regclass) pa_pol,
    (SELECT prosecdef FROM pg_proc WHERE proname='trg_payment_to_ledger') trg_secdef,
    (SELECT count(*) FROM pg_policy WHERE polrelid='public.credit_requests'::regclass AND polname='admin_can_update_credit_requests') bad_pol,
    (SELECT count(*) FROM pg_constraint WHERE conname='credit_requests_plan_check') plan_chk,
    (SELECT count(*) FROM pg_proc WHERE proname IN ('deduct_daily_credits','promote_students')) dropped_fns,
    has_function_privilege('anon','public.get_unpaid_months_summary(uuid,text)','EXECUTE') anon_unpaid,
    has_table_privilege('authenticated','public.schools','UPDATE') auth_schools_table_update,
    has_column_privilege('authenticated','public.schools','total_credits','UPDATE') auth_credits_col,
    has_column_privilege('authenticated','public.schools','school_name','UPDATE') auth_name_col,
    has_table_privilege('anon','public.payment_allocations','SELECT') anon_pa_select`)).rows[0];
  ok('A1 RLS enabled on payment_allocations', cat.pa_rls===true);
  ok('A1 exactly one policy on payment_allocations', +cat.pa_pol===1);
  ok('A1 trigger fn is SECURITY DEFINER', cat.trg_secdef===true);
  ok('A1 anon lost SELECT grant on payment_allocations', cat.anon_pa_select===false);
  ok('A2 admin_can_update_credit_requests gone', +cat.bad_pol===0);
  ok('A2 plan CHECK exists (existing rows validated)', +cat.plan_chk===1);
  ok('A3 authenticated has no table-level UPDATE on schools', cat.auth_schools_table_update===false);
  ok('A3 authenticated cannot UPDATE total_credits column', cat.auth_credits_col===false);
  ok('A3 authenticated can UPDATE school_name column', cat.auth_name_col===true);
  ok('A4 deduct_daily_credits & promote_students dropped', +cat.dropped_fns===0);
  ok('A4 anon cannot execute get_unpaid_months_summary', cat.anon_unpaid===false);

  // ---- behaviour: anon
  await as(null,'anon');
  let r = await tryq(`SELECT count(*) n FROM payment_allocations`);
  ok('anon SELECT payment_allocations denied or empty', !r.ok || +r.r.rows[0].n===0, r.ok? `rows=${r.r.rows[0].n}` : r.err);
  r = await tryq(`SELECT * FROM deduct_daily_credits()`); ok('anon cannot call deduct_daily_credits', !r.ok, r.err);
  r = await tryq(`SELECT * FROM get_unpaid_months_summary($1)`, [fx.parent_id]); ok('anon cannot call get_unpaid_months_summary', !r.ok, r.err);
  await reset();

  // ---- behaviour: school owner records a payment (the critical path)
  await as(fx.owner_uid);
  r = await tryq(`INSERT INTO payments (school_id, parent_id, received_amount, payment_method, received_by, notes) VALUES ($1,$2,1,'cash',$3,'DRY RUN') RETURNING id`, [fx.school_id, fx.parent_id, fx.owner_uid]);
  ok('owner can insert a payment (trigger ran)', r.ok, r.ok?'':r.err);
  const payId = r.ok ? r.r.rows[0].id : null;
  if (payId) {
    const led = (await c.query(`SELECT count(*) n FROM ledger WHERE reference_type='payment' AND reference_id=$1`, [payId])).rows[0].n;
    ok('ledger credit created by trigger', +led===1);
    const alloc = (await c.query(`SELECT count(*) n, coalesce(sum(allocated_amount),0) s FROM payment_allocations WHERE payment_id=$1`, [payId])).rows[0];
    ok('allocation created and visible to owner', +alloc.n>=1 && +alloc.s===1, `n=${alloc.n} sum=${alloc.s}`);
    const vis = (await c.query(`SELECT count(*) n FROM payment_allocations`)).rows[0].n;
    ok('owner sees only own school allocations (< total)', +vis < +pre.pa+1, `visible=${vis} total_before=${pre.pa}`);
    r = await tryq(`DELETE FROM payment_allocations WHERE payment_id=$1`, [payId]);
    ok('owner cannot delete allocations directly', !r.ok || r.r.rowCount===0, r.ok?`rowCount=${r.r.rowCount}`:r.err);
  }
  r = await tryq(`UPDATE credit_requests SET credits=999 WHERE id=$1`, [fx.own_request_id]);
  ok('owner UPDATE on own credit_request affects 0 rows', r.ok && r.r.rowCount===0, r.ok?`rowCount=${r.r.rowCount}`:r.err);
  r = await tryq(`INSERT INTO credit_requests (school_id,credits,amount_pkr,payment_method,payment_reference,status) VALUES ($1,3650,2000,'jazzcash','DRYRUN-'||gen_random_uuid(),'pending')`, [fx.school_id]);
  ok('owner INSERT with off-plan credits rejected', !r.ok, r.err);
  r = await tryq(`INSERT INTO credit_requests (school_id,credits,amount_pkr,payment_method,payment_reference,status) VALUES ($1,30,2000,'jazzcash','DRYRUN-'||gen_random_uuid(),'approved')`, [fx.school_id]);
  ok('owner INSERT with status=approved rejected', !r.ok, r.err);
  r = await tryq(`INSERT INTO credit_requests (school_id,credits,amount_pkr,payment_method,payment_reference,status) VALUES ($1,30,2000,'jazzcash','DRYRUN-'||gen_random_uuid(),'pending') RETURNING id`, [fx.school_id]);
  ok('owner INSERT of a valid pending request works', r.ok, r.ok?'':r.err);
  const newReq = r.ok ? r.r.rows[0].id : null;
  r = await tryq(`UPDATE schools SET school_name = school_name WHERE id=$1`, [fx.school_id]);
  ok('owner can update profile columns', r.ok && r.r.rowCount===1, r.ok?`rowCount=${r.r.rowCount}`:r.err);
  r = await tryq(`UPDATE schools SET total_credits = 99999 WHERE id=$1`, [fx.school_id]);
  ok('owner cannot update total_credits', !r.ok, r.err);
  r = await tryq(`UPDATE schools SET credit_expires_at = now() + interval '100 years' WHERE id=$1`, [fx.school_id]);
  ok('owner cannot update credit_expires_at', !r.ok, r.err);
  await reset();

  // ---- other school's owner
  await as(fx.other_owner_uid);
  if (payId) { const n = (await c.query(`SELECT count(*) n FROM payment_allocations WHERE payment_id=$1`, [payId])).rows[0].n; ok('other school cannot see this allocation', +n===0); }
  r = await tryq(`UPDATE credit_requests SET status='rejected' WHERE id=$1`, [fx.own_request_id]);
  ok('other school cannot update another school request', r.ok && r.r.rowCount===0, r.ok?`rowCount=${r.r.rowCount}`:r.err);
  await reset();

  // ---- admin
  await as(fx.admin_uid);
  if (newReq) { r = await tryq(`UPDATE credit_requests SET status='rejected', admin_notes='dry run' WHERE id=$1`, [newReq]); ok('admin can reject a pending request', r.ok && r.r.rowCount===1, r.ok?`rowCount=${r.r.rowCount}`:r.err); }
  if (newReq) { r = await tryq(`SELECT approve_credit_request($1,$2) ok`, [newReq, fx.admin_uid]); ok('admin approval RPC still runs (returns false: already rejected)', r.ok && r.r.rows[0].ok===false, r.ok?`ret=${r.r.rows[0].ok}`:r.err); }
  await reset();

  const post = (await c.query(`SELECT (SELECT count(*) FROM payment_allocations) pa,(SELECT count(*) FROM payments) p,(SELECT count(*) FROM ledger) l`)).rows[0];
  console.log(`\ncounts before: ${JSON.stringify(pre)}  after test payment (inside txn): ${JSON.stringify(post)}`);

  // discard every behavioural-test row (payment, ledger, allocation, credit request) and their audit-log entries
  await c.query('ROLLBACK TO SAVEPOINT behav');
  const fin = (await c.query(`SELECT (SELECT count(*) FROM payment_allocations) pa,(SELECT count(*) FROM payments) p,(SELECT count(*) FROM ledger) l,(SELECT count(*) FROM credit_requests) cr,(SELECT count(*) FROM audit_logs) al`)).rows[0];
  const same = fin.pa===pre.pa && fin.p===pre.p && fin.l===pre.l;
  ok('behavioural test rows discarded; data counts equal pre-state', same, JSON.stringify(fin));
  if (mode==='dryrun') { await c.query('ROLLBACK'); console.log('\nROLLED BACK (dry run). failures =', failures); }
  else if (failures>0 || !same) { await c.query('ROLLBACK'); console.log('\nROLLED BACK because of failures =', failures); }
  else { await c.query('COMMIT'); console.log('\nCOMMITTED Batch A. failures =', failures); }
} catch (e) { await c.query('ROLLBACK'); console.log('\nROLLED BACK on exception:', e.message); failures++; }
await c.end(); process.exit(failures?1:0);
