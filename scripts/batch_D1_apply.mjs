// Batch D1 applier with verification.  node scripts/batch_D1_apply.mjs dryrun|apply
// Simulates: owner invites, anon cannot list tokens, verify_invite, signup-with-token (auth.users insert
// fires the onboarding trigger), claim by the signed-in user, wrong-email claim, re-claim, regular signup.
// All behavioural rows are rolled back to a savepoint; apply commits only the migration.
import fs from 'node:fs'; import pg from 'pg';
const mode=process.argv[2]; if(!['dryrun','apply'].includes(mode)){console.error('usage: dryrun|apply');process.exit(2);}
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const c=new pg.Client({host:env.SUPABASE_DB_HOST,port:+env.SUPABASE_DB_PORT,database:env.SUPABASE_DB_NAME,user:env.SUPABASE_DB_USER,password:env.SUPABASE_DB_PASSWORD,ssl:{rejectUnauthorized:false}});
await c.connect(); await c.query('SET default_transaction_read_only = off');
let failures=0; const ok=(n,cond,d='')=>{console.log(`${cond?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`); if(!cond)failures++;};
const as=async(uid,role='authenticated')=>{await c.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await c.query(`SET LOCAL ROLE ${role}`);};
const reset=async()=>{await c.query('RESET ROLE');await c.query(`SELECT set_config('request.jwt.claims','',true)`);};
const tryq=async(sql,p=[])=>{await c.query('SAVEPOINT t');try{const r=await c.query(sql,p);await c.query('RELEASE SAVEPOINT t');return{ok:true,r};}catch(e){await c.query('ROLLBACK TO SAVEPOINT t');return{ok:false,err:e.message};}};
const fx=(await c.query(`SELECT s.id school_id, s.user_id owner_uid,
  (SELECT s2.id FROM schools s2 WHERE s2.id<>s.id AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=s2.user_id) ORDER BY s2.created_at LIMIT 1) school2_id,
  (SELECT s2.user_id FROM schools s2 WHERE s2.id<>s.id AND NOT EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id=s2.user_id) ORDER BY s2.created_at LIMIT 1) owner2_uid
  FROM schools s WHERE s.id='3a13ea3e-b5c2-4129-8313-58e034a84141'`)).rows[0];
const sql=fs.readFileSync('sql/batch_D1_invites.sql','utf8').replace(/^BEGIN;/m,'').replace(/COMMIT;\s*$/m,'');
const newUser=async(id,email,meta)=>c.query(`INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),'{"provider":"email","providers":["email"]}',$3,now(),now())`,[id,email,JSON.stringify(meta)]);
await c.query('BEGIN');
try{
  const pre=(await c.query(`SELECT (SELECT count(*) FROM school_members) sm,(SELECT count(*) FROM schools) s,(SELECT count(*) FROM auth.users) u,(SELECT count(*) FROM school_members WHERE invite_token IS NOT NULL) tokens`)).rows[0];
  await c.query(sql); console.log('\n-- migration applied inside transaction --\n');
  const cat=(await c.query(`SELECT
    (SELECT count(*) FROM pg_policy WHERE polrelid='public.school_members'::regclass AND polname='Public invite token lookup') pub_pol,
    (SELECT string_agg(proname||'('||pg_get_function_identity_arguments(oid)||')', ', ') FROM pg_proc WHERE proname IN ('verify_invite','claim_invite') AND pronamespace='public'::regnamespace) sigs,
    has_function_privilege('anon','public.verify_invite(text)','EXECUTE') anon_verify,
    has_function_privilege('anon','public.claim_invite(text)','EXECUTE') anon_claim,
    has_function_privilege('authenticated','public.claim_invite(text)','EXECUTE') auth_claim,
    (SELECT count(*) FROM school_members WHERE invite_token IS NOT NULL AND status<>'pending') stale_tokens,
    (SELECT prosecdef FROM pg_proc WHERE proname='handle_new_user_onboarding') onboarding_secdef`)).rows[0];
  ok('public token-listing policy gone', +cat.pub_pol===0);
  ok('only text-signature invite functions exist', cat.sigs==='claim_invite(p_token text), verify_invite(p_token text)', cat.sigs);
  ok('anon can verify, cannot claim; authenticated can claim', cat.anon_verify===true && cat.anon_claim===false && cat.auth_claim===true);
  ok('no tokens left on non-pending rows', +cat.stale_tokens===0, `was ${pre.tokens}`);
  ok('onboarding trigger fn is SECURITY DEFINER', cat.onboarding_secdef===true);
  await c.query('SAVEPOINT behav');

  // owner invites a manager (as the app now does: upsert)
  const tokA=crypto.randomUUID(), emailX='dryrun.manager@example.com';
  await as(fx.owner_uid);
  let r=await tryq(`INSERT INTO school_members (school_id,email,role,status,invite_token,user_id) VALUES ($1,$2,'manager','pending',$3,NULL) ON CONFLICT (school_id,email) DO UPDATE SET role='manager', status='pending', invite_token=EXCLUDED.invite_token, user_id=NULL, updated_at=now() RETURNING id`,[fx.school_id,emailX,tokA]);
  ok('owner can create a pending invite (upsert)', r.ok, r.ok?'':r.err);
  r=await tryq(`SELECT count(*) n FROM school_members WHERE school_id=$1 AND status='pending'`,[fx.school_id]); ok('owner sees the pending invite', r.ok && +r.r.rows[0].n>=1);
  await reset();
  // anon
  await as(null,'anon');
  r=await tryq(`SELECT count(*) n FROM school_members WHERE status='pending'`); ok('anon cannot list pending invites', !r.ok || +r.r.rows[0].n===0, r.ok?`rows=${r.r.rows[0].n}`:r.err);
  r=await tryq(`SELECT * FROM verify_invite($1)`,[tokA]); ok('anon verify_invite(token) returns the invite', r.ok && r.r.rowCount===1 && r.r.rows[0].email===emailX, r.ok?JSON.stringify(r.r.rows[0]):r.err);
  r=await tryq(`SELECT * FROM verify_invite('not-a-token')`); ok('verify_invite(bad token) returns nothing', r.ok && r.r.rowCount===0);
  r=await tryq(`SELECT claim_invite($1)`,[tokA]); ok('anon cannot claim', !r.ok, r.err);
  await reset();
  // signup with the token: the trigger links the account, no school is created
  const uidX=crypto.randomUUID();
  r=await tryq(`SELECT 1`); await newUser(uidX,emailX,{invite_token:tokA,email:emailX});
  let chk=(await c.query(`SELECT (SELECT status FROM school_members WHERE invite_token IS NULL AND user_id=$1 AND school_id=$2) status,(SELECT count(*) FROM schools WHERE user_id=$1) schools_created,(SELECT count(*) FROM school_members WHERE user_id=$1) memberships`,[uidX,fx.school_id])).rows[0];
  ok('signup with token: membership active, token cleared', chk.status==='active');
  ok('signup with token: NO throwaway school created', +chk.schools_created===0, `schools_created=${chk.schools_created}`);
  ok('signup with token: exactly one membership', +chk.memberships===1);
  // the manager now sees the school (AuthContext path) and its data
  await as(uidX);
  r=await tryq(`SELECT school_id, role FROM school_members WHERE user_id=$1 AND status='active' ORDER BY role DESC, created_at LIMIT 1`,[uidX]); ok('manager resolves their school (AuthContext query)', r.ok && r.r.rowCount===1 && r.r.rows[0].school_id===fx.school_id && r.r.rows[0].role==='manager');
  r=await tryq(`SELECT count(*) n FROM parents WHERE school_id=$1`,[fx.school_id]); ok('manager can read the school parents', r.ok && +r.r.rows[0].n>0, r.ok?`n=${r.r.rows[0].n}`:r.err);
  r=await tryq(`SELECT claim_invite($1)`,[tokA]); ok('re-claiming a used token fails', !r.ok, r.err);
  await reset();
  // second invite from another school to the same person; claimed while signed in
  const tokB=crypto.randomUUID();
  await as(fx.owner2_uid);
  r=await tryq(`INSERT INTO school_members (school_id,email,role,status,invite_token) VALUES ($1,$2,'manager','pending',$3)`,[fx.school2_id,emailX,tokB]); ok('second school invites the same email', r.ok, r.ok?'':r.err);
  await reset(); await as(uidX);
  r=await tryq(`SELECT claim_invite($1) sid`,[tokB]); ok('signed-in user claims the second invite', r.ok && r.r.rows[0].sid===fx.school2_id, r.ok?'':r.err);
  r=await tryq(`SELECT school_id, role FROM school_members WHERE user_id=$1 AND status='active' ORDER BY role DESC, created_at LIMIT 1`,[uidX]); ok('with two memberships AuthContext query still returns exactly one', r.ok && r.r.rowCount===1);
  await reset();
  // wrong email cannot claim
  const tokC=crypto.randomUUID();
  await as(fx.owner_uid); await tryq(`INSERT INTO school_members (school_id,email,role,status,invite_token) VALUES ($1,'someone.else@example.com','manager','pending',$2)`,[fx.school_id,tokC]); await reset();
  await as(uidX); r=await tryq(`SELECT claim_invite($1)`,[tokC]); ok('claim with a different email is refused', !r.ok && /different email/.test(r.err), r.err); await reset();
  // removed member can be re-invited (upsert path) and the old row is reused
  const removedRow=(await c.query(`SELECT id, school_id, email FROM school_members WHERE status='removed' LIMIT 1`)).rows[0];
  if (removedRow) { const ownerR=(await c.query(`SELECT user_id FROM schools WHERE id=$1`,[removedRow.school_id])).rows[0].user_id; await as(ownerR);
    r=await tryq(`INSERT INTO school_members (school_id,email,role,status,invite_token,user_id) VALUES ($1,$2,'manager','pending',$3,NULL) ON CONFLICT (school_id,email) DO UPDATE SET role='manager', status='pending', invite_token=EXCLUDED.invite_token, user_id=NULL, updated_at=now() RETURNING id, status`,[removedRow.school_id,removedRow.email,crypto.randomUUID()]);
    ok('re-inviting a removed email reuses the row as pending', r.ok && r.r.rows[0].id===removedRow.id && r.r.rows[0].status==='pending', r.ok?'':r.err); await reset(); }
  // regular signup still creates a school + owner membership
  const uidY=crypto.randomUUID(); await newUser(uidY,'dryrun.owner@example.com',{school_name:'Dry Run School',contact:'000'});
  chk=(await c.query(`SELECT (SELECT count(*) FROM schools WHERE user_id=$1) schools,(SELECT role FROM school_members WHERE user_id=$1) role,(SELECT total_credits FROM schools WHERE user_id=$1) credits`,[uidY])).rows[0];
  ok('regular signup: school + owner membership + 30 credits', +chk.schools===1 && chk.role==='owner' && +chk.credits===30, JSON.stringify(chk));
  // signup with a bogus token: no school, no membership (JoinInvite verifies first, so this is the edge case)
  const uidZ=crypto.randomUUID(); await newUser(uidZ,'dryrun.bogus@example.com',{invite_token:'bogus'});
  chk=(await c.query(`SELECT (SELECT count(*) FROM schools WHERE user_id=$1) schools,(SELECT count(*) FROM school_members WHERE user_id=$1) m`,[uidZ])).rows[0];
  ok('signup with bogus token: nothing created (no free school)', +chk.schools===0 && +chk.m===0, JSON.stringify(chk));

  await c.query('ROLLBACK TO SAVEPOINT behav');
  const fin=(await c.query(`SELECT (SELECT count(*) FROM school_members) sm,(SELECT count(*) FROM schools) s,(SELECT count(*) FROM auth.users) u`)).rows[0];
  const same=fin.sm===pre.sm&&fin.s===pre.s&&fin.u===pre.u;
  ok('behavioural rows discarded; counts equal pre-state', same, JSON.stringify(fin));
  if(mode==='dryrun'){await c.query('ROLLBACK');console.log('\nROLLED BACK (dry run). failures =',failures);}
  else if(failures>0||!same){await c.query('ROLLBACK');console.log('\nROLLED BACK because of failures =',failures);}
  else{await c.query('COMMIT');console.log('\nCOMMITTED Batch D1. failures =',failures);}
}catch(e){await c.query('ROLLBACK');console.log('\nROLLED BACK on exception:',e.message);failures++;}
await c.end(); process.exit(failures?1:0);
