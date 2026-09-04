// Batch E (db part) applier.  node scripts/batch_E_apply.mjs dryrun|apply
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const fx=(await c.query(`SELECT (SELECT user_id FROM schools WHERE credit_expires_at>now() AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=schools.user_id) LIMIT 1) owner,(SELECT user_id FROM admin_users LIMIT 1) admin`)).rows[0];
// rollback snapshot
const pol=(await c.query(`SELECT p.polname, p.polcmd, pg_get_expr(p.polqual,p.polrelid) u, pg_get_expr(p.polwithcheck,p.polrelid) w FROM pg_policy p WHERE p.polrelid='public.admin_settings'::regclass ORDER BY 1`)).rows;
const bk=(await c.query(`SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='logos'`)).rows[0];
const snap=[`-- ROLLBACK SNAPSHOT for Batch E, ${new Date().toISOString()}`,`UPDATE storage.buckets SET file_size_limit=${bk.file_size_limit===null?'NULL':bk.file_size_limit}, allowed_mime_types=${bk.allowed_mime_types===null?'NULL':"ARRAY['"+bk.allowed_mime_types.join("','")+"']"} WHERE id='logos';`,
 ...pol.map(p=>`DROP POLICY IF EXISTS "${p.polname}" ON public.admin_settings;\nCREATE POLICY "${p.polname}" ON public.admin_settings FOR ${({r:'SELECT',a:'INSERT',w:'UPDATE',d:'DELETE','*':'ALL'})[p.polcmd]}${p.u?`\n  USING (${p.u})`:''}${p.w?`\n  WITH CHECK (${p.w})`:''};`)];
fs.writeFileSync('sql/rollback/pre_batch_E_2026-09-04.sql', snap.join('\n')+'\n');
const sql=fs.readFileSync('sql/batch_E_hygiene.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
await c.query('BEGIN');
try{
  await c.query(sql); console.log('\n-- migration applied inside transaction --\n');
  const b=(await c.query(`SELECT file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='logos'`)).rows[0];
  ok('logo bucket: 2 MB limit', +b.file_size_limit===2097152);
  ok('logo bucket: images only', Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.every(m=>m.startsWith('image/')), JSON.stringify(b.allowed_mime_types));
  const n=(await c.query(`SELECT string_agg(polname,', ' ORDER BY polname) s, count(*) n FROM pg_policy WHERE polrelid='public.admin_settings'::regclass`)).rows[0];
  ok('admin_settings: three policies remain', +n.n===3, n.s);
  await as(fx.owner); let r=await tryq(`SELECT jazzcash_number FROM admin_settings WHERE id='global'`); ok('school owner can still read payment details (buy page)', r.ok && r.r.rowCount===1, r.ok?'':r.err);
  r=await tryq(`UPDATE admin_settings SET updated_at=now() WHERE id='global'`); ok('school owner cannot edit payment details', r.ok && r.r.rowCount===0, r.ok?`rows=${r.r.rowCount}`:r.err); await reset();
  await as(fx.admin); r=await tryq(`UPDATE admin_settings SET updated_at=now() WHERE id='global'`); ok('platform admin can edit payment details', r.ok && r.r.rowCount===1, r.ok?'':r.err); await reset();
  await as(null,'anon'); r=await tryq(`SELECT id FROM admin_settings`); ok('anon cannot read admin_settings', !r.ok || r.r.rowCount===0, r.ok?'':r.err); await reset();
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch E. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
