// Batch G5 applier.  node scripts/batch_G5_apply.mjs dryrun|apply
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const S='3a13ea3e-b5c2-4129-8313-58e034a84141';
const fx=(await c.query(`SELECT user_id owner,(SELECT user_id FROM schools WHERE id<>$1 AND credit_expires_at>now() AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=schools.user_id) LIMIT 1) other,(SELECT user_id FROM admin_users LIMIT 1) admin FROM schools WHERE id=$1`,[S])).rows[0];
// rollback snapshot
const sup=(await c.query(`SELECT pg_get_functiondef(oid) d FROM pg_proc WHERE proname='update_supplier_balance'`)).rows[0].d;
fs.writeFileSync('sql/rollback/pre_batch_G5_2026-09-05.sql',`-- ROLLBACK SNAPSHOT Batch G5 ${new Date().toISOString()}\nDROP VIEW IF EXISTS public.class_student_counts;\nDROP FUNCTION IF EXISTS public.school_financial_totals(uuid);\nDROP FUNCTION IF EXISTS public.missing_fee_parents(uuid,text);\nDROP FUNCTION IF EXISTS public.generate_fees_for_parents(uuid,uuid[],text);\nDROP TRIGGER IF EXISTS trigger_supplier_balance_sync ON public.supplier_transactions;\nDROP FUNCTION IF EXISTS public.trg_supplier_balance_sync();\n${sup};\nDROP TRIGGER IF EXISTS supplier_balance_trigger ON public.suppliers;\nCREATE TRIGGER supplier_balance_trigger BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_supplier_balance();\n-- suppliers.current_balance values before: ${JSON.stringify((await c.query('SELECT id, current_balance FROM suppliers')).rows)}\n`);
const sql=fs.readFileSync('sql/batch_G5_aggregates.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
// reference values computed the way the browser does today (as postgres, no RLS)
const ref=(await c.query(`SELECT
 (SELECT json_object_agg(class_id, n) FROM (SELECT current_class_id class_id, count(*) n FROM students WHERE school_id=$1 AND active AND current_class_id IS NOT NULL GROUP BY 1) x) class_counts,
 (SELECT COALESCE(sum(received_amount),0) FROM payments WHERE school_id=$1) collection,
 (SELECT COALESCE(sum(net_amount),0) FROM student_monthly_fees WHERE school_id=$1) expected,
 (SELECT COALESCE(sum(-balance),0) FROM parent_balances WHERE school_id=$1 AND balance<0) outstanding,
 (SELECT array_agg(p.id ORDER BY p.first_name) FROM parents p WHERE p.school_id=$1 AND p.is_active AND EXISTS (SELECT 1 FROM students s WHERE s.parent_id=p.id AND s.active) AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.parent_id=p.id AND l.reference_type='fee_generation' AND l.month='2026-09')) missing_sep,
 (SELECT array_agg(p.id ORDER BY p.first_name) FROM parents p WHERE p.school_id=$1 AND p.is_active AND EXISTS (SELECT 1 FROM students s WHERE s.parent_id=p.id AND s.active)) all_active_parents,
 (SELECT json_agg(json_build_object('id',id,'bal',current_balance)) FROM suppliers) supplier_balances_before`,[S])).rows[0];
await c.query('BEGIN');
try{
  await c.query(sql); console.log('\n-- migration applied inside transaction --\n');
  await c.query('SAVEPOINT behav');
  await as(fx.owner); let r;
  r=await tryq(`SELECT class_id, active_students FROM class_student_counts WHERE school_id=$1 AND active_students>0`,[S]);
  ok('view: owner reads class counts', r.ok && r.r.rowCount>0, r.ok?`classes=${r.r.rowCount}`:r.err);
  if(r.ok){ const norm=o=>JSON.stringify(Object.entries(o).map(([k,n])=>[k,+n]).sort()); const v=Object.fromEntries(r.r.rows.map(x=>[x.class_id,+x.active_students])); ok('view: counts equal a direct count per class', norm(v)===norm(ref.class_counts), `classes=${Object.keys(v).length}, students=${Object.values(v).reduce((a,b)=>a+b,0)}`); }
  r=await tryq(`SELECT * FROM school_financial_totals($1)`,[S]);
  ok('totals RPC: owner gets three numbers equal to the JS sums', r.ok && r.r.rowCount===1 && +r.r.rows[0].total_collection===+ref.collection && +r.r.rows[0].total_expected===+ref.expected && +r.r.rows[0].total_outstanding===+ref.outstanding, r.ok?JSON.stringify(r.r.rows[0])+' vs '+JSON.stringify({c:ref.collection,e:ref.expected,o:ref.outstanding}):r.err);
  r=await tryq(`SELECT id, students FROM missing_fee_parents($1,'2026-09')`,[S]);
  ok('missing RPC (Sep): same parents the browser logic finds', r.ok && JSON.stringify([...r.r.rows.map(x=>x.id)].sort())===JSON.stringify([...(ref.missing_sep||[])].sort()), r.ok?`rpc=${r.r.rowCount} ref=${(ref.missing_sep||[]).length}`:r.err);
  r=await tryq(`SELECT id, students FROM missing_fee_parents($1,'2099-08')`,[S]);
  const sortIds=a=>JSON.stringify([...a].sort()); const shapeOk=r.ok && r.r.rows.every(x=>Array.isArray(x.students)&&x.students.length>0&&'classes' in x.students[0]&&'discount_type' in x.students[0]);
  ok('missing RPC (future month): every active parent, with students json', r.ok && sortIds(r.r.rows.map(x=>x.id))===sortIds(ref.all_active_parents) && shapeOk, r.ok?`rpc=${r.r.rowCount} ref=${ref.all_active_parents.length} shape=${shapeOk} sample=${JSON.stringify(r.r.rows[0]?.students?.[0]).slice(0,120)}`:r.err);
  const twoParents=(ref.all_active_parents||[]).slice(0,2);
  r=await tryq(`SELECT generate_fees_for_parents($1,$2,'2099-08') res`,[S,twoParents]);
  ok('bulk generate for 2 parents in one call', r.ok && r.r.rows[0].res.processed===2, r.ok?JSON.stringify(r.r.rows[0].res):r.err);
  r=await tryq(`SELECT id FROM missing_fee_parents($1,'2099-08')`,[S]);
  ok('after generating, those 2 are no longer missing', r.ok && r.r.rowCount===ref.all_active_parents.length-2, r.ok?`missing now=${r.r.rowCount}`:r.err);
  r=await tryq(`SELECT generate_fees_for_parents($1,$2,'2099-08') res`,[S,twoParents]);
  ok('re-running skips them (no double billing)', r.ok && r.r.rows[0].res.processed===0 && r.r.rows[0].res.skipped===2, r.ok?JSON.stringify(r.r.rows[0].res):r.err);
  // suppliers: trigger keeps current_balance
  const supRow=(await c.query(`SELECT id, school_id, current_balance FROM suppliers LIMIT 1`)).rows[0];
  if (supRow) { const supOwner=(await c.query(`SELECT user_id FROM schools WHERE id=$1`,[supRow.school_id])).rows[0].user_id; await reset(); await as(supOwner);
    r=await tryq(`INSERT INTO supplier_transactions (school_id,supplier_id,type,amount,description,balance_after) VALUES ($1,$2,'bill',250,'dry',0)`,[supRow.school_id,supRow.id]);
    const after=(await c.query(`SELECT current_balance FROM suppliers WHERE id=$1`,[supRow.id])).rows[0].current_balance;
    ok('supplier bill: DB moves current_balance by +250', r.ok && +after===+supRow.current_balance+250, r.ok?`${supRow.current_balance} -> ${after}`:r.err);
    r=await tryq(`INSERT INTO supplier_transactions (school_id,supplier_id,type,amount,description,balance_after) VALUES ($1,$2,'payment',100,'dry',0)`,[supRow.school_id,supRow.id]);
    const after2=(await c.query(`SELECT current_balance FROM suppliers WHERE id=$1`,[supRow.id])).rows[0].current_balance;
    ok('supplier payment: DB moves current_balance by -100', r.ok && +after2===+supRow.current_balance+150, `${after} -> ${after2}`); }
  await reset();
  await as(fx.other); r=await tryq(`SELECT * FROM school_financial_totals($1)`,[S]); ok('other school: totals RPC returns nothing', r.ok && r.r.rowCount===0);
  r=await tryq(`SELECT count(*) n FROM missing_fee_parents($1,'2099-08')`,[S]); ok('other school: missing RPC returns nothing', r.ok && +r.r.rows[0].n===0);
  r=await tryq(`SELECT count(*) n FROM class_student_counts WHERE school_id=$1`,[S]); ok('other school: view shows nothing', r.ok && +r.r.rows[0].n===0); await reset();
  await as(fx.admin); r=await tryq(`SELECT * FROM school_financial_totals($1)`,[S]); ok('platform admin: totals RPC works', r.ok && r.r.rowCount===1); await reset();
  await as(null,'anon'); r=await tryq(`SELECT * FROM school_financial_totals($1)`,[S]); ok('anon: refused', !r.ok, r.err); await reset();
  await c.query('ROLLBACK TO SAVEPOINT behav');
  const bal=(await c.query(`SELECT json_agg(json_build_object('id',id,'bal',current_balance)) v FROM suppliers`)).rows[0].v;
  ok('supplier balances unchanged by backfill (already consistent)', JSON.stringify(bal)===JSON.stringify(ref.supplier_balances_before));
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch G5. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
