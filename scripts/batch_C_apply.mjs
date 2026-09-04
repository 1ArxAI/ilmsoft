// Batch C applier with built-in verification.  node scripts/batch_C_apply.mjs dryrun|apply
// dryrun: apply sql/batch_C_one_fee_system.sql in a transaction, run every check, ROLLBACK.
// apply : same, then roll the behavioural test rows back to a savepoint and COMMIT if all checks pass.
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0;
const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const RULE=`GREATEST(c.monthly_fee - CASE WHEN s.discount_type='percentage' THEN round(c.monthly_fee*COALESCE(s.discount_value,0)/100.0) WHEN s.discount_type='amount' THEN COALESCE(s.discount_value,0) ELSE 0 END,0)`;

const fx=(await c.query(`SELECT s.id school_id, s.user_id owner_uid,
  (SELECT c2.id FROM classes c2 WHERE c2.school_id=s.id AND EXISTS (SELECT 1 FROM students st WHERE st.current_class_id=c2.id AND st.active AND st.discount_type IS NOT NULL) ORDER BY c2.display_order LIMIT 1) class_a,
  (SELECT c2.id FROM classes c2 WHERE c2.school_id=s.id AND c2.active AND c2.monthly_fee > 0 AND c2.id <> (SELECT c3.id FROM classes c3 WHERE c3.school_id=s.id AND EXISTS (SELECT 1 FROM students st WHERE st.current_class_id=c3.id AND st.active AND st.discount_type IS NOT NULL) ORDER BY c3.display_order LIMIT 1) ORDER BY c2.monthly_fee DESC LIMIT 1) class_b,
  (SELECT p.id FROM parents p WHERE p.school_id=s.id AND p.is_active AND EXISTS (SELECT 1 FROM students st WHERE st.parent_id=p.id AND st.active) LIMIT 1) parent_id
  FROM schools s WHERE s.id='3a13ea3e-b5c2-4129-8313-58e034a84141'`)).rows[0];
console.log('fixtures:',JSON.stringify(fx));
const sql=fs.readFileSync('sql/batch_C_one_fee_system.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try{
  const pre=(await c.query(`SELECT (SELECT sum(current_monthly_fee) FROM students WHERE active) billing,(SELECT count(*) FROM students) students,(SELECT count(*) FROM student_monthly_fees) smf,(SELECT count(*) FROM ledger) ledger,(SELECT count(*) FROM fee_generations) gens,(SELECT string_agg(id::text||':'||current_monthly_fee, ',' ORDER BY id) FROM students) fees_by_student`)).rows[0];
  await c.query(sql);
  console.log('\n-- migration applied inside transaction --\n');
  await c.query('SAVEPOINT behav');

  // catalog
  const cat=(await c.query(`SELECT
    (SELECT count(*) FROM pg_class WHERE relname IN ('fee_structures','discounts','monthly_fees') AND relnamespace='public'::regnamespace) legacy_tables,
    (SELECT count(*) FROM pg_attribute WHERE attrelid='public.students'::regclass AND attname='discount_id' AND NOT attisdropped) discount_id_col,
    (SELECT string_agg(tgname,',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.students'::regclass AND NOT tgisinternal) student_triggers,
    (SELECT string_agg(tgname,',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.classes'::regclass AND NOT tgisinternal) class_triggers,
    (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('recalculate_student_fee','trg_discount_changed','trg_fee_structure_changed','trg_student_class_changed','trg_student_reactivated','generate_monthly_fees','get_parent_balance','get_unpaid_months_summary','record_parent_payment','generate_receipt_number','create_receipt_sequence','create_school_on_signup','handle_new_user','recalculate_parent_balances')) dead_fns,
    (SELECT count(*) FROM pg_proc WHERE proname='generate_receipt_no') receipt_no_fns,
    (SELECT prosecdef FROM pg_proc WHERE proname='trg_student_fee_sync') sync_secdef,
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.prosrc ILIKE '%fee_structures%' OR p.prosrc ILIKE '%FROM discounts%' OR p.prosrc ILIKE '%JOIN discounts%')) fns_still_reading_legacy`)).rows[0];
  ok('C3 legacy tables dropped', +cat.legacy_tables===0);
  ok('C3 students.discount_id dropped', +cat.discount_id_col===0);
  ok('C1 students triggers = fee sync only', cat.student_triggers==='trigger_student_fee_sync', cat.student_triggers);
  ok('C1 classes triggers include fee change', (cat.class_triggers||'').includes('trigger_class_fee_changed'), cat.class_triggers);
  ok('C3 dead functions gone', +cat.dead_fns===0, `remaining=${cat.dead_fns}`);
  ok('C3 generate_receipt_no(uuid) kept, () dropped', +cat.receipt_no_fns===1);
  ok('C1 fee sync trigger is SECURITY DEFINER', cat.sync_secdef===true);
  ok('no function still reads the legacy tables', +cat.fns_still_reading_legacy===0);

  // data unchanged by the migration itself
  const post=(await c.query(`SELECT (SELECT sum(current_monthly_fee) FROM students WHERE active) billing,(SELECT string_agg(id::text||':'||current_monthly_fee, ',' ORDER BY id) FROM students) fees_by_student, (SELECT count(*) FROM students s JOIN classes c ON c.id=s.current_class_id WHERE s.active AND s.current_monthly_fee <> ${RULE}) rule_violations, (SELECT count(*) FROM students s JOIN classes c ON c.id=s.current_class_id WHERE s.monthly_fee <> c.monthly_fee) gross_not_class_fee`)).rows[0];
  ok('active billing unchanged by migration', post.billing===pre.billing, `${pre.billing} -> ${post.billing}`);
  ok('every student fee identical to before', post.fees_by_student===pre.fees_by_student);
  ok('all active students satisfy the rule', +post.rule_violations===0);
  ok('students.monthly_fee now equals class fee for all', +post.gross_not_class_fee===0, `differ=${post.gross_not_class_fee}`);

  // behaviour as owner
  await as(fx.owner_uid);
  // (a) class fee change propagates
  const before=(await c.query(`SELECT c.monthly_fee fee, (SELECT count(*) FROM students s WHERE s.current_class_id=c.id AND s.active) n FROM classes c WHERE id=$1`,[fx.class_a])).rows[0];
  let r=await tryq(`UPDATE classes SET monthly_fee = monthly_fee + 100 WHERE id=$1`,[fx.class_a]);
  ok('owner can raise a class fee', r.ok, r.ok?'':r.err);
  let chk=(await c.query(`SELECT count(*) n, count(*) FILTER (WHERE s.current_monthly_fee = ${RULE} AND s.monthly_fee = c.monthly_fee) followed FROM students s JOIN classes c ON c.id=s.current_class_id WHERE s.current_class_id=$1 AND s.active`,[fx.class_a])).rows[0];
  ok(`(a) class fee +100 → all ${chk.n} students in class follow the rule`, +chk.n>0 && chk.n===chk.followed, `followed=${chk.followed}/${chk.n}`);
  await c.query(`UPDATE classes SET monthly_fee = monthly_fee - 100 WHERE id=$1`,[fx.class_a]);
  chk=(await c.query(`SELECT count(*) FILTER (WHERE s.current_monthly_fee <> ${RULE}) bad FROM students s JOIN classes c ON c.id=s.current_class_id WHERE s.current_class_id=$1 AND s.active`,[fx.class_a])).rows[0];
  ok('(a) reverting the class fee restores fees', +chk.bad===0);
  // (b) promotion
  const stu=(await c.query(`SELECT id, current_monthly_fee FROM students WHERE current_class_id=$1 AND active AND discount_type IS NOT NULL LIMIT 1`,[fx.class_a])).rows[0];
  r=await tryq(`UPDATE students SET current_class_id=$2 WHERE id=$1`,[stu.id,fx.class_b]);
  ok('(b) owner can promote a student', r.ok, r.ok?'':r.err);
  chk=(await c.query(`SELECT s.current_monthly_fee fee, ${RULE} rule, c.monthly_fee class_fee, s.monthly_fee gross FROM students s JOIN classes c ON c.id=s.current_class_id WHERE s.id=$1`,[stu.id])).rows[0];
  ok('(b) promoted student fee = new class fee − discount', +chk.fee===+chk.rule && +chk.gross===+chk.class_fee, `fee=${chk.fee} rule=${chk.rule} class_fee=${chk.class_fee} was=${stu.current_monthly_fee}`);
  await c.query(`UPDATE students SET current_class_id=$2 WHERE id=$1`,[stu.id,fx.class_a]);
  // (c) typed fee ignored on insert
  r=await tryq(`INSERT INTO students (school_id,parent_id,first_name,last_name,current_class_id,admission_class_id,monthly_fee,current_monthly_fee,discount_type,discount_value,active) VALUES ($1,$2,'DRYRUN','STUDENT',$3,$3,999,999,'percentage',50,true) RETURNING monthly_fee, current_monthly_fee`,[fx.school_id,fx.parent_id,fx.class_a]);
  const cf=(await c.query(`SELECT monthly_fee FROM classes WHERE id=$1`,[fx.class_a])).rows[0].monthly_fee;
  ok('(c) typed fee on insert is replaced by class fee − discount', r.ok && +r.r.rows[0].monthly_fee===cf && +r.r.rows[0].current_monthly_fee===Math.round(cf/2), r.ok?`stored=${r.r.rows[0].monthly_fee}/${r.r.rows[0].current_monthly_fee} class=${cf}`:r.err);
  // (d) bulk generation for a far-future month
  r=await tryq(`SELECT generate_bulk_fees($1, ARRAY['2099-01'], NULL, true) res`,[fx.school_id]);
  ok('(d) generate_bulk_fees runs as owner', r.ok, r.ok?JSON.stringify(r.r.rows[0].res):r.err);
  chk=(await c.query(`SELECT count(*) n, count(*) FILTER (WHERE f.net_amount = ${RULE}) net_ok, count(*) FILTER (WHERE f.gross_amount = c.monthly_fee) gross_ok, count(*) FILTER (WHERE f.net_amount = f.gross_amount - f.discount_amount) arith_ok, sum(f.net_amount) billed FROM student_monthly_fees f JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=f.class_id WHERE f.month='2099-01' AND f.school_id=$1`,[fx.school_id])).rows[0];
  ok('(d) every generated row: net = class fee − discount', +chk.n>0 && chk.n===chk.net_ok, `net_ok=${chk.net_ok}/${chk.n}`);
  ok('(d) every generated row: gross = class fee, net = gross − discount_amount', chk.n===chk.gross_ok && chk.n===chk.arith_ok);
  const led=(await c.query(`SELECT coalesce(sum(amount),0) s, count(*) n FROM ledger WHERE month='2099-01' AND school_id=$1 AND reference_type='fee_generation'`,[fx.school_id])).rows[0];
  ok('(d) ledger debits equal billed total', led.s===chk.billed, `ledger=${led.s} billed=${chk.billed} parents=${led.n}`);
  const cnt=(await c.query(`SELECT count(*) n FROM students WHERE school_id=$1 AND active`,[fx.school_id])).rows[0].n;
  ok('(d) one row per active student', chk.n===cnt, `${chk.n} vs ${cnt}`);
  r=await tryq(`SELECT generate_bulk_fees($1, ARRAY['2099-01'], NULL, true) res`,[fx.school_id]);
  ok('(d) re-running the same month skips everything', r.ok && r.r.rows[0].res.students_processed===0 && r.r.rows[0].res.skipped_count>0, r.ok?JSON.stringify(r.r.rows[0].res):r.err);
  // (e) individual generation
  r=await tryq(`SELECT generate_individual_fee($1,$2,'2099-02') res`,[fx.school_id,fx.parent_id]);
  ok('(e) generate_individual_fee runs', r.ok && !r.r.rows[0].res.error, r.ok?JSON.stringify(r.r.rows[0].res):r.err);
  chk=(await c.query(`SELECT count(*) n, count(*) FILTER (WHERE f.net_amount = ${RULE}) net_ok FROM student_monthly_fees f JOIN students s ON s.id=f.student_id JOIN classes c ON c.id=f.class_id WHERE f.month='2099-02' AND f.parent_id=$1`,[fx.parent_id])).rows[0];
  ok('(e) individual rows follow the rule', +chk.n>0 && chk.n===chk.net_ok, `${chk.net_ok}/${chk.n}`);
  await reset();
  // (f) other school owner cannot generate for this school
  const other=(await c.query(`SELECT user_id FROM schools WHERE id<>$1 AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=schools.user_id) LIMIT 1`,[fx.school_id])).rows[0].user_id;
  await as(other); r=await tryq(`SELECT generate_bulk_fees($1, ARRAY['2099-03'], NULL, true)`,[fx.school_id]); ok('(f) other school cannot generate for this school', !r.ok, r.err); await reset();
  await as(null,'anon'); r=await tryq(`SELECT trg_student_fee_sync()`); ok('anon cannot call trigger functions', !r.ok, r.err); await reset();

  await c.query('ROLLBACK TO SAVEPOINT behav');
  const fin=(await c.query(`SELECT (SELECT sum(current_monthly_fee) FROM students WHERE active) billing,(SELECT count(*) FROM students) students,(SELECT count(*) FROM student_monthly_fees) smf,(SELECT count(*) FROM ledger) ledger,(SELECT count(*) FROM fee_generations) gens`)).rows[0];
  const same=fin.billing===pre.billing&&fin.students===pre.students&&fin.smf===pre.smf&&fin.ledger===pre.ledger&&fin.gens===pre.gens;
  ok('behavioural test rows discarded; counts equal pre-state', same, JSON.stringify(fin));
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0||!same){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch C. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
