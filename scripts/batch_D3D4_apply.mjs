// Batch D3+D4 applier with verification.  node scripts/batch_D3D4_apply.mjs dryrun|apply
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const denied=(r)=>!r.ok || r.r.rowCount===0;
const fx=(await c.query(`SELECT s.id sid, s.user_id owner,
 (SELECT id FROM parents WHERE school_id=s.id AND is_active AND EXISTS (SELECT 1 FROM payments p WHERE p.parent_id=parents.id) LIMIT 1) parent_with_money,
 (SELECT id FROM students WHERE school_id=s.id AND active AND EXISTS (SELECT 1 FROM student_monthly_fees f WHERE f.student_id=students.id) LIMIT 1) student_with_fees,
 (SELECT id FROM classes WHERE school_id=s.id AND active ORDER BY display_order LIMIT 1) class,
 (SELECT id FROM schools WHERE credit_expires_at < now() ORDER BY created_at LIMIT 1) expired_sid,
 (SELECT user_id FROM schools WHERE credit_expires_at < now() ORDER BY created_at LIMIT 1) expired_owner,
 (SELECT user_id FROM schools WHERE id<>s.id AND credit_expires_at > now() LIMIT 1) other_owner
 FROM schools s WHERE s.id='3a13ea3e-b5c2-4129-8313-58e034a84141'`)).rows[0];
const sql=fs.readFileSync('sql/batch_D3D4_expiry_and_delete.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try{
  const pre=(await c.query(`SELECT (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace) pols,(SELECT count(*) FROM students) st,(SELECT count(*) FROM parents) pa,(SELECT count(*) FROM payments) py,(SELECT count(*) FROM ledger) le,(SELECT count(*) FROM ledger WHERE reference_type<>'opening_balance') le_nonob,(SELECT count(*) FROM auth.users) u,(SELECT count(*) FROM school_members) sm,(SELECT credit_expires_at FROM schools WHERE id=$1) exp`,[fx.sid])).rows[0];
  await c.query(sql); console.log('\n-- migration applied inside transaction --\n');
  const cat=(await c.query(`SELECT
    (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace) pols,
    (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace AND p.polcmd IN ('a','w','d') AND c.relname NOT IN ('schools','school_members','credit_requests','admin_settings','admin_users') AND COALESCE(pg_get_expr(p.polqual,p.polrelid),'')||COALESCE(pg_get_expr(p.polwithcheck,p.polrelid),'') NOT ILIKE '%school_is_active%') write_pols_without_active,
    (SELECT count(*) FROM pg_proc WHERE proname IN ('school_is_active','delete_parent_permanently','delete_student_permanently') AND prosecdef) fns,
    has_function_privilege('anon','public.delete_parent_permanently(uuid)','EXECUTE') anon_del`)).rows[0];
  ok('policy count unchanged', cat.pols===pre.pols, `${pre.pols} -> ${cat.pols}`);
  ok('every tenant write policy requires an active school', +cat.write_pols_without_active===0, `missing=${cat.write_pols_without_active}`);
  ok('helper + two delete functions exist (SECURITY DEFINER)', +cat.fns===3);
  ok('anon cannot call delete functions', cat.anon_del===false);
  await c.query('SAVEPOINT behav');

  // ---------- D3: active owner works
  await as(fx.owner); let r;
  r=await tryq(`INSERT INTO parents (school_id,first_name,last_name,cnic,contact) VALUES ($1,'DRY','DUP','00000-0000000-8','0') RETURNING id`,[fx.sid]); ok('active school: owner adds a parent', r.ok, r.ok?'':r.err);
  const dupParent=r.ok?r.r.rows[0].id:null;
  r=await tryq(`INSERT INTO students (school_id,parent_id,first_name,last_name,current_class_id,admission_class_id) VALUES ($1,$2,'DRY','CHILD',$3,$3) RETURNING id`,[fx.sid,dupParent,fx.class]); ok('active school: owner adds a child', r.ok, r.ok?'':r.err);
  const dupStudent=r.ok?r.r.rows[0].id:null;
  r=await tryq(`INSERT INTO ledger (school_id,parent_id,entry_type,amount,reference_type) VALUES ($1,$2,'debit',5,'opening_balance')`,[fx.sid,dupParent]); ok('active school: opening balance posts', r.ok, r.ok?'':r.err);
  await reset();
  // ---------- D3: make this school expired (inside the transaction only)
  await c.query(`UPDATE schools SET credit_expires_at = now() - interval '1 day' WHERE id=$1`,[fx.sid]);
  await as(fx.owner);
  r=await tryq(`SELECT count(*) n FROM students WHERE school_id=$1`,[fx.sid]); ok('expired: owner can still READ students', r.ok && +r.r.rows[0].n>0);
  r=await tryq(`SELECT count(*) n FROM parent_balances WHERE school_id=$1`,[fx.sid]); ok('expired: owner can still read balances', r.ok && +r.r.rows[0].n>0);
  r=await tryq(`INSERT INTO parents (school_id,first_name,last_name,cnic,contact) VALUES ($1,'DRY','X','00000-0000000-7','0')`,[fx.sid]); ok('expired: cannot add a parent', denied(r), r.ok?'':r.err);
  r=await tryq(`UPDATE students SET last_name=last_name WHERE id=$1`,[dupStudent]); ok('expired: cannot edit a student', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`INSERT INTO payments (school_id,parent_id,received_amount,payment_method) VALUES ($1,$2,1,'cash')`,[fx.sid,fx.parent_with_money]); ok('expired: cannot record a payment', denied(r), r.ok?'':r.err);
  r=await tryq(`DELETE FROM students WHERE id=$1`,[dupStudent]); ok('expired: cannot delete', denied(r), r.ok?`rows=${r.r.rowCount}`:r.err);
  r=await tryq(`SELECT generate_bulk_fees($1, ARRAY['2099-06'], NULL, true)`,[fx.sid]); ok('expired: fee generation refused with a clear message', !r.ok && /expired/i.test(r.err), r.err);
  r=await tryq(`SELECT delete_parent_permanently($1)`,[dupParent]); ok('expired: permanent delete refused', !r.ok && /expired/i.test(r.err), r.err);
  r=await tryq(`INSERT INTO credit_requests (school_id,credits,amount_pkr,payment_method,payment_reference) VALUES ($1,30,2000,'jazzcash','DRY-'||gen_random_uuid())`,[fx.sid]); ok('expired: CAN still buy credits', r.ok, r.ok?'':r.err);
  r=await tryq(`UPDATE schools SET contact=contact WHERE id=$1`,[fx.sid]); ok('expired: can still edit profile', r.ok && r.r.rowCount===1, r.ok?'':r.err);
  await reset();
  await c.query(`UPDATE schools SET credit_expires_at = $2 WHERE id=$1`,[fx.sid,pre.exp]);
  await as(fx.owner); r=await tryq(`UPDATE students SET last_name=last_name WHERE id=$1`,[dupStudent]); ok('renewed: writes work again', r.ok && r.r.rowCount===1, r.ok?'':r.err); await reset();
  // a real expired trial school
  if (fx.expired_owner) { await as(fx.expired_owner); r=await tryq(`INSERT INTO parents (school_id,first_name,last_name,cnic,contact) VALUES ($1,'DRY','X','00000-0000000-6','0')`,[fx.expired_sid]); ok('real expired trial school: cannot write', denied(r), r.ok?'':r.err); r=await tryq(`SELECT count(*) n FROM classes WHERE school_id=$1`,[fx.expired_sid]); ok('real expired trial school: can read', r.ok && +r.r.rows[0].n>0); await reset(); }

  // ---------- D4: permanent delete
  await as(fx.owner);
  r=await tryq(`SELECT delete_parent_permanently($1)`,[fx.parent_with_money]); ok('D4: parent with payments is refused', !r.ok && /financial history/.test(r.err), r.err);
  r=await tryq(`SELECT delete_student_permanently($1)`,[fx.student_with_fees]); ok('D4: student with fee records is refused', !r.ok && /Deactivate/.test(r.err), r.err);
  r=await tryq(`SELECT delete_student_permanently($1)`,[dupStudent]); ok('D4: fresh duplicate student deleted', r.ok, r.ok?'':r.err);
  r=await tryq(`SELECT delete_parent_permanently($1)`,[dupParent]); ok('D4: duplicate parent (opening balance only) deleted', r.ok, r.ok?'':r.err);
  const gone=(await c.query(`SELECT (SELECT count(*) FROM parents WHERE id=$1) p,(SELECT count(*) FROM ledger WHERE parent_id=$1) l`,[dupParent])).rows[0];
  ok('D4: parent and its opening-balance row are gone', +gone.p===0 && +gone.l===0);
  await reset();
  const chk=(await c.query(`SELECT (SELECT count(*) FROM payments) py,(SELECT count(*) FROM ledger WHERE reference_type<>'opening_balance') le`)).rows[0];
  ok('D4: no payment or fee ledger row was touched', chk.py===pre.py && chk.le===pre.le_nonob, `payments ${pre.py}->${chk.py}, fee/payment ledger ${pre.le_nonob}->${chk.le}`);
  // manager / other / anon cannot delete
  const mgr=crypto.randomUUID();
  await c.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','dryrun.mgr2@example.com','x',now(),'{}','{"invite_token":"none"}',now(),now())`,[mgr]);
  await c.query(`INSERT INTO school_members (school_id,user_id,email,role,status) VALUES ($1,$2,'dryrun.mgr2@example.com','manager','active')`,[fx.sid,mgr]);
  await as(fx.owner); r=await tryq(`INSERT INTO parents (school_id,first_name,last_name,cnic,contact) VALUES ($1,'DRY','DUP2','00000-0000000-5','0') RETURNING id`,[fx.sid]); const dup2=r.r.rows[0].id; await reset();
  await as(mgr); r=await tryq(`SELECT delete_parent_permanently($1)`,[dup2]); ok('D4: manager refused', !r.ok && /owner/.test(r.err), r.err); await reset();
  await as(fx.other_owner); r=await tryq(`SELECT delete_parent_permanently($1)`,[dup2]); ok('D4: other school owner refused', !r.ok, r.err); await reset();
  await as(null,'anon'); r=await tryq(`SELECT delete_parent_permanently($1)`,[dup2]); ok('D4: anon refused', !r.ok, r.err); await reset();

  await c.query('ROLLBACK TO SAVEPOINT behav');
  const fin=(await c.query(`SELECT (SELECT count(*) FROM students) st,(SELECT count(*) FROM parents) pa,(SELECT count(*) FROM payments) py,(SELECT count(*) FROM ledger) le,(SELECT count(*) FROM auth.users) u,(SELECT count(*) FROM school_members) sm,(SELECT credit_expires_at FROM schools WHERE id=$1) exp`,[fx.sid])).rows[0];
  const same=['st','pa','py','le','u','sm'].every(k=>fin[k]===pre[k]) && String(fin.exp)===String(pre.exp);
  ok('behavioural rows discarded; counts and expiry equal pre-state', same, JSON.stringify({...fin,exp:String(fin.exp).slice(0,10)}));
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0||!same){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch D3D4. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
