// Restore rows from a backup made by scripts/db_dump.mjs into the CURRENT database.
// This is a data restore for the public schema: it assumes the tables already exist
// (re-create them from schema.sql first if they do not).
//
// It is deliberately NOT automatic and NOT destructive by default:
//   node scripts/db_restore.mjs backups/<stamp>                 -> prints the plan only
//   node scripts/db_restore.mjs backups/<stamp> --table ledger  -> restores ONE table (truncate + insert), asks for CONFIRM
//   node scripts/db_restore.mjs backups/<stamp> --all           -> restores every public table in FK order, asks for CONFIRM
// auth.* tables are never restored by this script (Supabase manages them); use the dashboard.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import pg from 'pg';

const [dir, flag, tableArg] = process.argv.slice(2);
if (!dir) { console.error('usage: node scripts/db_restore.mjs backups/<stamp> [--all | --table <name>]'); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const targets = flag === '--all' ? manifest.restore_order.filter(t => t.startsWith('public.'))
  : flag === '--table' ? ['public.' + tableArg] : [];

console.log('backup:', manifest.stamp);
for (const t of manifest.restore_order) console.log(`  ${t.padEnd(32)} ${manifest.counts[t]} rows`);
if (!targets.length) { console.log('\nDry listing only. Pass --all or --table <name> to restore.'); process.exit(0); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ans = await rl.question(`\nThis will TRUNCATE and re-insert: ${targets.join(', ')}\nType CONFIRM to proceed: `);
rl.close();
if (ans !== 'CONFIRM') { console.log('aborted'); process.exit(1); }

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const client = new pg.Client({ host: env.SUPABASE_DB_HOST, port: +env.SUPABASE_DB_PORT, database: env.SUPABASE_DB_NAME, user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query('SET default_transaction_read_only = off');
await client.query('BEGIN');
try {
  // Restore in reverse FK order for truncation, forward order for insert.
  for (const t of [...targets].reverse()) await client.query(`TRUNCATE TABLE ${t} CASCADE`);
  for (const t of targets) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, 'data', `${t}.json`), 'utf8'));
    for (const r of rows) await client.query(`INSERT INTO ${t} SELECT * FROM json_populate_record(NULL::${t}, $1)`, [JSON.stringify(r)]);
    const n = (await client.query(`SELECT count(*) n FROM ${t}`)).rows[0].n;
    if (+n !== rows.length) throw new Error(`${t}: inserted ${n}, expected ${rows.length}`);
    console.log(`restored ${t}: ${n} rows`);
  }
  await client.query('COMMIT');
  console.log('COMMITTED');
} catch (e) { await client.query('ROLLBACK'); console.error('ROLLED BACK:', e.message); process.exit(1); }
await client.end();
