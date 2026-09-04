// Batch C4 applier with verification.  node scripts/batch_C4_apply.mjs dryrun|apply
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const fx=(await c.query(`SELECT s.id school_id, s.user_id owner_uid, (SELECT p.id FROM payments p WHERE p.school_id=s.id ORDER BY received_at DESC LIMIT 1) payment_id FROM schools s WHERE s.id='3a13ea3e-b5c2-4129-8313-58e034a84141'`)).rows[0];
const sql=fs.readFileSync('sql/batch_C4_drop_legacy_receipts.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try{
  const pre=(await c.query(`SELECT (SELECT count(*) FROM payments) p,(SELECT count(*) FROM ledger) l,(SELECT count(*) FROM payment_allocations) a,(SELECT count(*) FROM custom_receipts) cr,(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r') tables`)).rows[0];
  await c.query(sql); console.log('\n-- migration applied inside transaction --\n');
  const cat=(await c.query(`SELECT
    (SELECT count(*) FROM pg_class WHERE relname IN ('fee_receipts','fee_payments') AND relnamespace='public'::regnamespace) legacy_present,
    (SELECT count(*) FROM pg_proc WHERE proname='generate_receipt_no') fn_present,
    (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND (prosrc ILIKE '%fee_receipts%' OR prosrc ILIKE '%fee_payments%')) fns_referencing,
    (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r') tables`)).rows[0];
  ok('fee_receipts and fee_payments dropped', +cat.legacy_present===0);
  ok('generate_receipt_no dropped', +cat.fn_present===0);
  ok('no function references the dropped tables', +cat.fns_referencing===0);
  ok('exactly two tables fewer', +cat.tables===+pre.tables-2, `${pre.tables} -> ${cat.tables}`);
  // the on-the-fly receipt path (PaymentReceipt.tsx) as the school owner
  await as(fx.owner_uid);
  let r=await tryq(`SELECT p.*, pr.first_name, pr.last_name, pr.contact FROM payments p JOIN parents pr ON pr.id=p.parent_id WHERE p.id=$1`,[fx.payment_id]);
  ok('receipt step: payment + parent readable', r.ok && r.r.rowCount===1, r.ok?'':r.err);
  const parentId = r.ok ? r.r.rows[0].parent_id : null;
  r=await tryq(`SELECT first_name, last_name FROM students WHERE parent_id=$1`,[parentId]); ok('receipt step: students readable', r.ok && r.r.rowCount>=1, r.ok?`n=${r.r.rowCount}`:r.err);
  r=await tryq(`SELECT balance FROM parent_balances WHERE parent_id=$1`,[parentId]); ok('receipt step: balance readable', r.ok && r.r.rowCount===1, r.ok?`balance=${r.r.rows[0].balance}`:r.err);
  r=await tryq(`SELECT id FROM custom_receipts WHERE school_id=$1`,[fx.school_id]); ok('custom receipts (live feature) still readable', r.ok, r.ok?`n=${r.r.rowCount}`:r.err);
  await reset();
  const post=(await c.query(`SELECT (SELECT count(*) FROM payments) p,(SELECT count(*) FROM ledger) l,(SELECT count(*) FROM payment_allocations) a,(SELECT count(*) FROM custom_receipts) cr`)).rows[0];
  ok('payments / ledger / allocations / custom_receipts untouched', post.p===pre.p&&post.l===pre.l&&post.a===pre.a&&post.cr===pre.cr, JSON.stringify(post));
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch C4. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
