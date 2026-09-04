// Batch C6 applier.  node scripts/batch_C6_apply.mjs dryrun|apply
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const DUP='dd67bee9-4653-42e9-8180-907fde40ae4a', KEEP='73b5ebdb-007e-4f04-b95d-0682615c9cf7';
// rollback snapshot: exact rows about to change
const snapRows=(await c.query(`SELECT 'payment' k, row_to_json(p) r FROM payments p WHERE id=$1 UNION ALL SELECT 'allocation', row_to_json(a) FROM payment_allocations a WHERE payment_id=$1 UNION ALL SELECT 'parent', json_build_object('id',id,'opening_balance',opening_balance) FROM parents WHERE opening_balance<>0 AND NOT EXISTS (SELECT 1 FROM ledger l WHERE l.parent_id=parents.id AND l.reference_type='opening_balance')`,[DUP])).rows;
fs.writeFileSync('sql/rollback/pre_batch_C6_2026-09-05.sql', [`-- ROLLBACK SNAPSHOT for Batch C6, ${new Date().toISOString()} (rows as JSON; restore with INSERT ... SELECT * FROM json_populate_record)`, ...snapRows.map(r=>`-- ${r.k}: ${JSON.stringify(r.r)}`), `-- undo 1b: DELETE FROM payment_allocations WHERE payment_id='${KEEP}';`].join('\n')+'\n');
const pre=(await c.query(`SELECT (SELECT count(*) FROM payments) py,(SELECT count(*) FROM payment_allocations) al,(SELECT count(*) FROM ledger) le,(SELECT balance FROM parent_balances b JOIN payments p ON p.parent_id=b.parent_id WHERE p.id=$1) usman_balance,(SELECT count(*) FROM parents WHERE opening_balance<>0) nonzero_ob`,[KEEP])).rows[0];
console.log('pre:',JSON.stringify(pre));
const sql=fs.readFileSync('sql/batch_C6_data_repairs.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try{
  await c.query(sql); console.log('\n-- repair applied inside transaction --\n');
  const post=(await c.query(`SELECT (SELECT count(*) FROM payments) py,(SELECT count(*) FROM payment_allocations) al,(SELECT count(*) FROM ledger) le,(SELECT balance FROM parent_balances b JOIN payments p ON p.parent_id=b.parent_id WHERE p.id=$1) usman_balance,(SELECT count(*) FROM parents WHERE opening_balance<>0) nonzero_ob,(SELECT count(*) FROM payments WHERE id=$2) dup_left,(SELECT string_agg(f.month||':'||a.allocated_amount, ', ' ORDER BY f.month) FROM payment_allocations a JOIN student_monthly_fees f ON f.id=a.student_monthly_fee_id WHERE a.payment_id=$1) keep_alloc`,[KEEP,DUP])).rows[0];
  ok('duplicate payment removed', +post.dup_left===0);
  ok('payments 107 -> 106', +post.py===+pre.py-1, `${pre.py} -> ${post.py}`);
  ok('allocation count unchanged (moved, not added)', post.al===pre.al, `${pre.al} -> ${post.al}`);
  ok('surviving payment now covers May', post.keep_alloc==='2026-05:900.00', post.keep_alloc);
  ok('ledger untouched', post.le===pre.le);
  ok('Usman balance unchanged', post.usman_balance===pre.usman_balance, `${pre.usman_balance} -> ${post.usman_balance}`);
  const integ=(await c.query(`SELECT (SELECT count(*) FROM payments p WHERE NOT EXISTS (SELECT 1 FROM ledger l WHERE l.reference_type='payment' AND l.reference_id=p.id)) payments_without_credit,(SELECT count(*) FROM (SELECT f.id FROM student_monthly_fees f JOIN payment_allocations a ON a.student_monthly_fee_id=f.id GROUP BY f.id, f.net_amount HAVING sum(a.allocated_amount)>f.net_amount) x) over_allocated,(SELECT count(*) FROM (SELECT p.id FROM payments p JOIN payment_allocations a ON a.payment_id=p.id GROUP BY p.id,p.received_amount HAVING sum(a.allocated_amount)>p.received_amount) y) over_paid,(SELECT count(*) FROM payment_allocations a WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.id=a.payment_id)) orphan_alloc`)).rows[0];
  ok('integrity: every payment has its ledger credit', +integ.payments_without_credit===0);
  ok('integrity: no over-allocation, no orphan allocations', +integ.over_allocated===0 && +integ.over_paid===0 && +integ.orphan_alloc===0, JSON.stringify(integ));
  ok('stale opening balances cleared (16 -> 5 with ledger rows remain 0 anyway)', +post.nonzero_ob===0, `nonzero now=${post.nonzero_ob}`);
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch C6. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
