// Rebuild the ilmsoft database in a NEW Supabase project from a backup folder, then verify it against
// the OLD (live) project, which is only ever read.
//
//   node scripts/migrate_to_project.mjs backups/<stamp>          # restore + verify (refuses a non-empty target)
//   node scripts/migrate_to_project.mjs backups/<stamp> --reload  # target already has our schema: reload data only
//
// Reads .env.local: SUPABASE_DB_* = OLD project (read-only here), SUPABASE_PRDB_* = NEW project (written).
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const dir = process.argv[2]; const reload = process.argv.includes('--reload');
if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) { console.error('usage: node scripts/migrate_to_project.mjs backups/<stamp> [--reload]'); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const OLD = new pg.Client({ host: env.SUPABASE_DB_HOST, port: +env.SUPABASE_DB_PORT, database: env.SUPABASE_DB_NAME, user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
const NEW = new pg.Client({ host: env.SUPABASE_PRDB_HOST, port: +env.SUPABASE_PRDB_PORT, database: env.SUPABASE_PRDB_NAME, user: env.SUPABASE_PRDB_USER, password: env.SUPABASE_PRDB_PASSWORD, ssl: { rejectUnauthorized: false } });
await OLD.connect(); await OLD.query('SET default_transaction_read_only = on');
await NEW.connect(); await NEW.query('SET default_transaction_read_only = off');
let failures = 0; const ok = (n, cond, d = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); if (!cond) failures++; };
const step = (s) => console.log(`\n== ${s}`);

const publicTables = manifest.restore_order.filter(t => t.startsWith('public.')).map(t => t.slice(7));

// ------------------------------------------------------------------ preflight
step('preflight');
const oldRef = env.SUPABASE_DB_USER.split('.')[1], newRef = env.SUPABASE_PRDB_USER.split('.')[1];
ok('old and new are different projects', oldRef && newRef && oldRef !== newRef, `${oldRef} -> ${newRef}`);
const existing = +(await NEW.query(`SELECT count(*) n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`)).rows[0].n;
if (!reload) ok('new project has no public tables', existing === 0, `found ${existing}`);
else ok('new project already has our tables (reload mode)', existing === publicTables.length, `found ${existing}, expected ${publicTables.length}`);
if (failures) { console.log('\nABORTED before any change.'); process.exit(1); }

if (!reload) {
  // ---------------------------------------------------------------- schema
  step('schema');
  let schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  // the auth.users trigger is created last (after data load), storage lines are comments
  const authTrigger = (schema.match(/^CREATE TRIGGER on_auth_user_created[^\n]*$/m) || [])[0];
  schema = schema.replace(/^CREATE TRIGGER on_auth_user_created[^\n]*\n/m, '');
  // grants are applied from the live old project below, not from the file
  schema = schema.split('\n-- grants (anon / authenticated / service_role)')[0];
  await NEW.query('BEGIN');
  try {
    await NEW.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    // serial columns reference their sequence in the DEFAULT; create those sequences first
    const seqs = [...new Set([...schema.matchAll(/nextval\('([a-z_]+)'::regclass\)/g)].map(m => m[1]))];
    for (const q of seqs) await NEW.query(`CREATE SEQUENCE IF NOT EXISTS public.${q}`);
    await NEW.query(schema);
    for (const m of schema.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+) \(([^;]*?)\);/gs)) {
      const [, tbl, body] = m; for (const cm of body.matchAll(/^\s*(\w+) .*nextval\('([a-z_]+)'::regclass\)/gm)) await NEW.query(`ALTER SEQUENCE public.${cm[2]} OWNED BY public.${tbl}.${cm[1]}`);
    }
    // pg_get_viewdef drops WITH (security_invoker); without it the views would bypass row security
    const invokerViews = (await OLD.query(`SELECT c.relname FROM pg_class c WHERE c.relkind='v' AND c.relnamespace='public'::regnamespace AND 'security_invoker=true' = ANY(c.reloptions)`)).rows.map(r => r.relname);
    for (const v of invokerViews) await NEW.query(`ALTER VIEW public.${v} SET (security_invoker = true)`);
    await NEW.query('COMMIT'); console.log(`schema applied; security_invoker restored on: ${invokerViews.join(', ')}`);
  } catch (e) { await NEW.query('ROLLBACK'); console.log('schema FAILED:', e.message); process.exit(1); }

  // ---------------------------------------------------------------- grants exactly as the old project
  step('grants (copied from the live old project)');
  const tg = (await OLD.query(`SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) privs FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY 1,2`)).rows;
  const cg = (await OLD.query(`SELECT table_name, grantee, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) cols FROM information_schema.column_privileges cp WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.table_name=cp.table_name AND g.grantee=cp.grantee AND g.privilege_type=cp.privilege_type) GROUP BY 1,2,3`)).rows;
  const fg = (await OLD.query(`SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig, (SELECT string_agg(r, ', ') FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r::text, p.oid, 'EXECUTE')) roles FROM pg_proc p WHERE p.pronamespace='public'::regnamespace`)).rows;
  await NEW.query('BEGIN');
  try {
    const rels = (await NEW.query(`SELECT relname, relkind FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','v','S')`)).rows;
    for (const r of rels) await NEW.query(`REVOKE ALL ON ${r.relkind === 'S' ? 'SEQUENCE' : 'TABLE'} public.${r.relname} FROM anon, authenticated, service_role`);
    for (const g of tg) await NEW.query(`GRANT ${g.privs} ON public.${g.table_name} TO ${g.grantee}`);
    for (const g of cg) await NEW.query(`GRANT ${g.privilege_type} (${g.cols}) ON public.${g.table_name} TO ${g.grantee}`);
    await NEW.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role`);
    for (const f of (await NEW.query(`SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' sig FROM pg_proc p WHERE p.pronamespace='public'::regnamespace`)).rows) await NEW.query(`REVOKE EXECUTE ON FUNCTION public.${f.sig} FROM PUBLIC, anon, authenticated, service_role`);
    for (const f of fg) if (f.roles) await NEW.query(`GRANT EXECUTE ON FUNCTION public.${f.sig} TO ${f.roles}`);
    await NEW.query('COMMIT'); console.log(`grants applied: ${tg.length} table, ${cg.length} column-level, ${fg.filter(f => f.roles).length} function`);
  } catch (e) { await NEW.query('ROLLBACK'); console.log('grants FAILED:', e.message); process.exit(1); }
  fs.writeFileSync(path.join(dir, 'auth_trigger.sql'), (authTrigger || '') + '\n');
}

// ------------------------------------------------------------------ data
step(reload ? 'data (reload: truncate + insert)' : 'data');
const load = async (fq) => {
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'data', `${fq}.json`), 'utf8'));
  const [schema, table] = fq.split('.');
  // insert only real columns (auth.users.confirmed_at is GENERATED and must not be supplied)
  const cols = (await NEW.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND is_generated='NEVER' ORDER BY ordinal_position`, [schema, table])).rows.map(r => `"${r.column_name}"`).join(', ');
  for (const r of rows) await NEW.query(`INSERT INTO ${fq} (${cols}) SELECT ${cols} FROM json_populate_record(NULL::${fq}, $1)`, [JSON.stringify(r)]);
  return rows.length;
};
await NEW.query('BEGIN');
try {
  // user triggers would double-post ledger rows, allocations, audit rows, default classes/categories
  for (const t of publicTables) await NEW.query(`ALTER TABLE public.${t} DISABLE TRIGGER USER`);
  if (reload) { for (const t of [...publicTables].reverse()) await NEW.query(`TRUNCATE TABLE public.${t} CASCADE`); }
  const authTrig = (await NEW.query(`SELECT count(*) n FROM pg_trigger WHERE tgname='on_auth_user_created'`)).rows[0].n;
  if (+authTrig) await NEW.query(`DROP TRIGGER on_auth_user_created ON auth.users`);
  if (reload) { await NEW.query(`DELETE FROM auth.identities`); await NEW.query(`DELETE FROM auth.users`); }
  let n = 0;
  n += await load('auth.users'); n += await load('auth.identities');
  for (const t of publicTables) n += await load('public.' + t);
  for (const t of publicTables) await NEW.query(`ALTER TABLE public.${t} ENABLE TRIGGER USER`);
  // serial sequences
  await NEW.query(`SELECT setval('public.keep_alive_id_seq', COALESCE((SELECT max(id) FROM public.keep_alive), 0) + 1, false)`);
  const authTriggerSql = fs.existsSync(path.join(dir, 'auth_trigger.sql')) ? fs.readFileSync(path.join(dir, 'auth_trigger.sql'), 'utf8').trim() : (await OLD.query(`SELECT pg_get_triggerdef(oid) d FROM pg_trigger WHERE tgname='on_auth_user_created'`)).rows[0].d;
  await NEW.query(authTriggerSql);
  await NEW.query('COMMIT'); console.log(`data loaded: ${n} rows; triggers re-enabled; auth trigger created`);
} catch (e) { await NEW.query('ROLLBACK'); console.log('data FAILED:', e.message); process.exit(1); }

// ------------------------------------------------------------------ storage bucket
step('storage');
try {
  const b = (await OLD.query(`SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets`)).rows;
  for (const x of b) await NEW.query(`INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types`, [x.id, x.name, x.public, x.file_size_limit, x.allowed_mime_types]);
  const pols = (await OLD.query(`SELECT p.polname, p.polcmd, pg_get_expr(p.polqual,p.polrelid) u, pg_get_expr(p.polwithcheck,p.polrelid) w FROM pg_policy p WHERE p.polrelid='storage.objects'::regclass`)).rows;
  let created = 0;
  for (const p of pols) { const cmd = { r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE', '*': 'ALL' }[p.polcmd]; try { await NEW.query(`CREATE POLICY "${p.polname}" ON storage.objects FOR ${cmd}${p.u ? ` USING (${p.u})` : ''}${p.w ? ` WITH CHECK (${p.w})` : ''}`); created++; } catch (e) { if (!/already exists/.test(e.message)) console.log(`  storage policy "${p.polname}" not created (${e.message.split('\n')[0]}); create it in the dashboard`); } }
  console.log(`buckets: ${b.length}; storage policies created: ${created}/${pols.length}`);
} catch (e) { console.log('storage: ' + e.message.split('\n')[0] + ' — create bucket "logos" (public, 2 MB, images) in the dashboard'); }

// ------------------------------------------------------------------ verify: new vs old
step('verify against the live old project');
const both = async (sql) => [(await OLD.query(sql)).rows, (await NEW.query(sql)).rows];
const [oc, nc] = await both(`SELECT relname, (xpath('/row/c/text()', query_to_xml('SELECT count(*) c FROM public.'||relname, false, true, '')))[1]::text::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1`);
ok('row counts equal for every table', JSON.stringify(oc) === JSON.stringify(nc), JSON.stringify(nc.filter((r, i) => oc[i]?.n !== r.n)));
const cmp = async (label, sql) => { const [o, n] = await both(sql); ok(label, JSON.stringify(o) === JSON.stringify(n), JSON.stringify(o) === JSON.stringify(n) ? `${o.length} identical` : `old=${JSON.stringify(o).slice(0, 200)} new=${JSON.stringify(n).slice(0, 200)}`); };
await cmp('auth users + identities', `SELECT (SELECT count(*) FROM auth.users) u, (SELECT count(*) FROM auth.identities) i, (SELECT count(*) FROM auth.users WHERE encrypted_password IS NOT NULL) with_pw`);
await cmp('tables + RLS flags', `SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1`);
await cmp('policies (name, command, expressions)', `SELECT c.relname, p.polname, p.polcmd, pg_get_expr(p.polqual,p.polrelid), pg_get_expr(p.polwithcheck,p.polrelid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace ORDER BY 1,2`);
await cmp('functions (name, args, security definer)', `SELECT proname, pg_get_function_identity_arguments(oid), prosecdef FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY 1,2`);
await cmp('triggers (public + auth)', `SELECT c.relname, t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace IN ('public'::regnamespace,'auth'::regnamespace) ORDER BY 1,2`);
await cmp('views + security_invoker', `SELECT relname, reloptions FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='v' ORDER BY 1`);
await cmp('constraints', `SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`);
await cmp('indexes', `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2`);
await cmp('table grants', `SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role') GROUP BY 1,2 ORDER BY 1,2`);
await cmp('column grants', `SELECT table_name, grantee, privilege_type, string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.column_privileges cp WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants g WHERE g.table_schema='public' AND g.table_name=cp.table_name AND g.grantee=cp.grantee AND g.privilege_type=cp.privilege_type) GROUP BY 1,2,3 ORDER BY 1,2,3`);
await cmp('function execute grants', `SELECT p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', (SELECT string_agg(r, ',') FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r::text, p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY 1`);
await cmp('storage buckets', `SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY 1`);
await cmp('storage policies', `SELECT polname, polcmd FROM pg_policy WHERE polrelid='storage.objects'::regclass ORDER BY 1`);
await cmp('ledger balance totals', `SELECT sum(balance), count(*) FROM parent_balances`);
await cmp('active billing', `SELECT sum(current_monthly_fee) FROM students WHERE active`);
await cmp('a sample of real data (checksums)', `SELECT md5(string_agg(id::text||amount::text||entry_type, ',' ORDER BY id)) FROM ledger`);
console.log(`\n${failures ? 'VERIFY FAILED: ' + failures : 'VERIFIED: new project matches the old one'}`);
await OLD.end(); await NEW.end(); process.exit(failures ? 1 : 0);
