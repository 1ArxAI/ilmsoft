// Batch D2 applier with verification.  node scripts/batch_D2_apply.mjs dryrun|apply
// Simulates a manager (fresh auth user + active membership), the owner, another school's owner, the platform
// admin and anon against real rows. All behavioural rows are rolled back to a savepoint.
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const denied=(r)=>!r.ok || r.r.rowCount===0;   // RLS: either an error (insert/upsert) or 0 rows (update/delete/select)
const fx=(await c.query(`SELECT s.id sid, s.user_id owner,
 (SELECT id FROM parents WHERE school_id=s.id AND is_active ORDER BY created_at LIMIT 1) parent,
 (SELECT id FROM students WHERE school_id=s.id AND active ORDER BY created_at LIMIT 1) student,
 (SELECT id FROM classes WHERE school_id=s.id AND active ORDER BY display_order LIMIT 1) class,
 (SELECT id FROM income_categories WHERE school_id=s.id LIMIT 1) inc_cat,
 (SELECT id FROM expense_categories WHERE school_id=s.id LIMIT 1) exp_cat,
 (SELECT id FROM exam_terms WHERE school_id=s.id LIMIT 1) term,
 (SELECT id FROM suppliers WHERE school_id=s.id LIMIT 1) supplier,
 (SELECT id FROM extra_fees WHERE school_id=s.id LIMIT 1) extra_fee,
 (SELECT id FROM extra_fee_payments WHERE school_id=s.id LIMIT 1) extra_pay,
 (SELECT user_id FROM schools WHERE id<>s.id AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=schools.user_id) ORDER BY created_at LIMIT 1) other_owner,
 (SELECT user_id FROM admin_users LIMIT 1) admin
 FROM schools s WHERE s.id='3a13ea3e-b5c2-4129-8313-58e034a84141'`)).rows[0];
const sql=fs.readFileSync('sql/batch_D2_manager_role.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try{
  const pre=(await c.query(`SELECT (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace) pols,(SELECT count(*) FROM students) st,(SELECT count(*) FROM parents) pa,(SELECT count(*) FROM payments) py,(SELECT count(*) FROM ledger) le,(SELECT count(*) FROM auth.users) u,(SELECT count(*) FROM school_members) sm`)).rows[0];
  await c.query(sql); console.log('\n-- migration applied inside transaction --\n');
  const cat=(await c.query(`SELECT
    (SELECT count(*) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND NOT c.relrowsecurity) rls_off,
    (SELECT string_agg(c.relname,',') FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relname<>'keep_alive' AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) no_policy_tables,
    (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace) pols,
    (SELECT count(*) FROM pg_proc WHERE proname IN ('is_school_owner','is_school_member','is_platform_admin') AND prosecdef) helpers`)).rows[0];
  ok('RLS enabled on every public table', +cat.rls_off===0);
  ok('every table (except keep_alive) has at least one policy', cat.no_policy_tables===null, cat.no_policy_tables||'');
  ok('policy count reduced', +cat.pols < +pre.pols, `${pre.pols} -> ${cat.pols}`);
  ok('three SECURITY DEFINER helpers exist', +cat.helpers===3);
  await c.query('SAVEPOINT behav');

  // create a manager: fresh auth user + active membership (as the app's invite flow would leave it)
  const mgr=crypto.randomUUID();
  await c.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','dryrun.mgr@example.com','x',now(),'{"provider":"email","providers":["email"]}','{"invite_token":"none"}',now(),now())`,[mgr]);
  await c.query(`INSERT INTO school_members (school_id,user_id,email,role,status) VALUES ($1,$2,'dryrun.mgr@example.com','manager','active')`,[fx.sid,mgr]);

  // ---------- MANAGER: daily work allowed
  await as(mgr); let r;
  r=await tryq(`SELECT count(*) n FROM students WHERE school_id=$1`,[fx.sid]); ok('mgr reads students', r.ok && +r.r.rows[0].n>0);
  r=await tryq(`INSERT INTO students (school_id,parent_id,first_name,last_name,current_class_id,admission_class_id) VALUES ($1,$2,'DRY','MGR',$3,$3) RETURNING id, current_monthly_fee`,[fx.sid,fx.parent,fx.class]); ok('mgr adds a student (fee trigger ran)', r.ok && r.r.rows[0].current_monthly_fee!==null, r.ok?`fee=${r.r.rows[0].current_monthly_fee}`:r.err);
  const newStu=r.ok?r.r.rows[0].id:null;
  r=await tryq(`UPDATE students SET last_name=last_name WHERE id=$1`,[fx.student]); ok('mgr edits a student', r.ok && r.r.rowCount===1, r.ok?'':r.err);
  r=await tryq(`INSERT INTO parents (school_id,first_name,last_name,cnic,contact) VALUES ($1,'DRY','PARENT','00000-0000000-9','0')`,[fx.sid]); ok('mgr adds a parent', r.ok, r.ok?'':r.err);
  r=await tryq(`INSERT INTO payments (school_id,parent_id,received_amount,payment_method,received_by) VALUES ($1,$2,1,'cash',$3) RETURNING id`,[fx.sid,fx.parent,mgr]); ok('mgr records a payment (ledger + allocation via trigger)', r.ok, r.ok?'':r.err);
  const payId=r.ok?r.r.rows[0].id:null;
  r=await tryq(`SELECT count(*) n FROM ledger WHERE reference_id=$1`,[payId]); ok('mgr sees the ledger credit', r.ok && +r.r.rows[0].n===1);
  r=await tryq(`INSERT INTO ledger (school_id,parent_id,entry_type,amount,reference_type,description) VALUES ($1,$2,'debit',10,'opening_balance','dry') RETURNING id`,[fx.sid,fx.parent]); ok('mgr posts an opening-balance row', r.ok, r.ok?'':r.err);
  const obId=r.ok?r.r.rows[0].id:null;
  r=await tryq(`DELETE FROM ledger WHERE id=$1`,[obId]); ok('mgr can remove an opening-balance row (parent edit flow)', r.ok && r.r.rowCount===1, r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`SELECT generate_individual_fee($1,$2,'2099-05') res`,[fx.sid,fx.parent]); ok('mgr can generate fees (RPC)', r.ok && !r.r.rows[0].res.error, r.ok?JSON.stringify(r.r.rows[0].res):r.err);
  r=await tryq(`INSERT INTO income_records (school_id,category_id,amount,description) VALUES ($1,$2,5,'dry')`,[fx.sid,fx.inc_cat]); ok('mgr records income', r.ok, r.ok?'':r.err);
  r=await tryq(`INSERT INTO expenses (school_id,category_id,amount,expense_date,description,paid_by) VALUES ($1,$2,5,CURRENT_DATE,'dry','dry')`,[fx.sid,fx.exp_cat]); ok('mgr records an expense', r.ok, r.ok?'':r.err);
  r=await tryq(`INSERT INTO supplier_transactions (school_id,supplier_id,type,amount,description,balance_after) VALUES ($1,$2,'bill',5,'dry',0)`,[fx.sid,fx.supplier]); ok('mgr records a supplier bill', r.ok, r.ok?'':r.err);
  if (fx.term) { r=await tryq(`INSERT INTO exam_results (school_id,exam_term_id,class_id,student_id,subject_marks) VALUES ($1,$2,$3,$4,'{}') ON CONFLICT (exam_term_id,student_id) DO UPDATE SET updated_at=now()`,[fx.sid,fx.term,fx.class,fx.student]); ok('mgr enters exam marks (upsert)', r.ok, r.ok?'':r.err); }
  if (fx.extra_fee) { r=await tryq(`INSERT INTO extra_fee_payments (school_id,extra_fee_id,student_id,parent_id,amount_paid,payment_method,payment_date) VALUES ($1,$2,$3,$4,1,'cash',CURRENT_DATE)`,[fx.sid,fx.extra_fee,fx.student,fx.parent]); ok('mgr collects an extra fee', r.ok, r.ok?'':r.err); }
  r=await tryq(`INSERT INTO custom_receipts (school_id,type,receipt_no,recipient_name,items,total_amount) VALUES ($1,'receipt','DRY-1','dry','[]',0)`,[fx.sid]); ok('mgr issues a custom receipt', r.ok, r.ok?'':r.err);
  // ---------- MANAGER: owner-only things refused
  r=await tryq(`DELETE FROM students WHERE id=$1`,[newStu]); ok('mgr cannot delete a student', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`DELETE FROM parents WHERE id=$1`,[fx.parent]); ok('mgr cannot delete a parent', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`DELETE FROM payments WHERE id=$1`,[payId]); ok('mgr cannot delete a payment', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`UPDATE payments SET received_amount=999 WHERE id=$1`,[payId]); ok('mgr cannot edit a payment', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`UPDATE ledger SET amount=999 WHERE reference_id=$1`,[payId]); ok('mgr cannot edit ledger rows', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`DELETE FROM ledger WHERE reference_type='fee_generation' AND school_id=$1`,[fx.sid]); ok('mgr cannot delete fee debits', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`UPDATE classes SET monthly_fee=monthly_fee+1 WHERE id=$1`,[fx.class]); ok('mgr cannot change a class fee', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`INSERT INTO classes (school_id,name) VALUES ($1,'DRY')`,[fx.sid]); ok('mgr cannot add a class', denied(r), r.ok?'':r.err);
  r=await tryq(`INSERT INTO teachers (school_id,name) VALUES ($1,'DRY')`,[fx.sid]); ok('mgr cannot add a teacher', denied(r), r.ok?'':r.err);
  r=await tryq(`INSERT INTO extra_fees (school_id,name,amount,due_date) VALUES ($1,'DRY',1,CURRENT_DATE)`,[fx.sid]); ok('mgr cannot define an extra fee', denied(r), r.ok?'':r.err);
  if (fx.extra_pay) { r=await tryq(`DELETE FROM extra_fee_payments WHERE id=$1`,[fx.extra_pay]); ok('mgr cannot un-pay an extra fee', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err); }
  r=await tryq(`INSERT INTO income_categories (school_id,name) VALUES ($1,'DRY')`,[fx.sid]); ok('mgr cannot add a category', denied(r), r.ok?'':r.err);
  r=await tryq(`DELETE FROM income_records WHERE school_id=$1`,[fx.sid]); ok('mgr cannot delete income records', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  if (fx.term) { r=await tryq(`DELETE FROM exam_terms WHERE id=$1`,[fx.term]); ok('mgr cannot delete an exam term', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err); }
  r=await tryq(`UPDATE schools SET school_name='x' WHERE id=$1`,[fx.sid]); ok('mgr cannot edit the school profile', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`INSERT INTO school_members (school_id,email,role,status) VALUES ($1,'x@x.com','manager','pending')`,[fx.sid]); ok('mgr cannot invite', denied(r), r.ok?'':r.err);
  r=await tryq(`INSERT INTO credit_requests (school_id,credits,amount_pkr,payment_method,payment_reference) VALUES ($1,30,2000,'x','DRY-'||gen_random_uuid())`,[fx.sid]); ok('mgr cannot buy credits', denied(r), r.ok?'':r.err);
  r=await tryq(`SELECT count(*) n FROM audit_logs WHERE school_id=$1`,[fx.sid]); ok('mgr cannot read the audit trail', r.ok && +r.r.rows[0].n===0, r.ok?`rows=${r.r.rows[0].n}`:r.err);
  r=await tryq(`SELECT count(*) n FROM students WHERE school_id<>$1`,[fx.sid]); ok('mgr sees no other school', r.ok && +r.r.rows[0].n===0);
  await reset();
  // ---------- OWNER: unchanged power
  await as(fx.owner);
  await tryq(`DELETE FROM student_monthly_fees WHERE student_id=$1`,[newStu]); r=await tryq(`DELETE FROM students WHERE id=$1`,[newStu]); ok('owner can delete a student', r.ok && r.r.rowCount===1, r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`UPDATE classes SET monthly_fee=monthly_fee WHERE id=$1`,[fx.class]); ok('owner can edit a class', r.ok && r.r.rowCount===1);
  r=await tryq(`INSERT INTO teachers (school_id,name) VALUES ($1,'DRY')`,[fx.sid]); ok('owner can add a teacher', r.ok, r.ok?'':r.err);
  r=await tryq(`SELECT count(*) n FROM audit_logs WHERE school_id=$1`,[fx.sid]); ok('owner reads the audit trail', r.ok && +r.r.rows[0].n>0);
  r=await tryq(`SELECT count(*) n FROM payment_allocations`); ok('owner reads own allocations', r.ok && +r.r.rows[0].n>0);
  r=await tryq(`SELECT count(*) n FROM school_members WHERE school_id=$1 AND status='active' AND role='manager'`,[fx.sid]); ok('owner sees the new manager in the team', r.ok && +r.r.rows[0].n===1, r.ok?`managers=${r.r.rows[0].n}`:r.err);
  await reset();
  // ---------- OTHER SCHOOL / ADMIN / ANON
  await as(fx.other_owner); r=await tryq(`SELECT count(*) n FROM parents WHERE school_id=$1`,[fx.sid]); ok('other school sees nothing', r.ok && +r.r.rows[0].n===0); await reset();
  await as(fx.admin); r=await tryq(`SELECT (SELECT count(*) FROM students WHERE school_id=$1) s,(SELECT count(*) FROM classes WHERE school_id=$1) c,(SELECT count(*) FROM payments WHERE school_id=$1) p,(SELECT count(*) FROM parent_balances WHERE school_id=$1) b`,[fx.sid]); ok('platform admin can read the insights data', r.ok && +r.r.rows[0].s>0 && +r.r.rows[0].c>0 && +r.r.rows[0].p>0 && +r.r.rows[0].b>0, r.ok?JSON.stringify(r.r.rows[0]):r.err);
  r=await tryq(`UPDATE students SET last_name=last_name WHERE school_id=$1`,[fx.sid]); ok('platform admin cannot write tenant data', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err); await reset();
  await as(null,'anon'); r=await tryq(`SELECT count(*) n FROM students`); ok('anon sees nothing', !r.ok || +r.r.rows[0].n===0); await reset();

  await c.query('ROLLBACK TO SAVEPOINT behav');
  const fin=(await c.query(`SELECT (SELECT count(*) FROM students) st,(SELECT count(*) FROM parents) pa,(SELECT count(*) FROM payments) py,(SELECT count(*) FROM ledger) le,(SELECT count(*) FROM auth.users) u,(SELECT count(*) FROM school_members) sm`)).rows[0];
  const same=['st','pa','py','le','u','sm'].every(k=>fin[k]===pre[k]);
  ok('behavioural rows discarded; counts equal pre-state', same, JSON.stringify(fin));
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0||!same){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch D2. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
