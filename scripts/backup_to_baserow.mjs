// Zip the newest backups/<stamp>/ folder and store it as a row + file in a Baserow table.
// Env: BASEROW_TOKEN, BASEROW_TABLE_ID (table with fields: Name (text), Taken at (text), Tables (number),
//      Rows (number), Note (long text), File (file)). Keeps the newest KEEP rows (default 30).
// Usage: node scripts/backup_to_baserow.mjs [backups/<stamp>]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const envFile = fs.existsSync('.env.local')
  ? Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
const TOKEN = process.env.BASEROW_TOKEN || envFile.BASEROW_TOKEN;
const TABLE = process.env.BASEROW_TABLE_ID || envFile.BASEROW_TABLE_ID;
const KEEP = Number(process.env.BASEROW_KEEP || 30);
const API = 'https://api.baserow.io/api';
if (!TOKEN || !TABLE) { console.error('Missing BASEROW_TOKEN or BASEROW_TABLE_ID'); process.exit(2); }

const dir = process.argv[2] || fs.readdirSync('backups').filter(d => fs.existsSync(path.join('backups', d, 'manifest.json'))).sort().map(d => path.join('backups', d)).pop();
if (!dir) { console.error('no backup folder found'); process.exit(2); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const stamp = path.basename(dir);
const zipPath = path.join('backups', `${stamp}.zip`);
execSync(`cd backups && zip -qr "${stamp}.zip" "${stamp}"`);
const size = fs.statSync(zipPath).size;
const rowsTotal = Object.values(manifest.counts).reduce((a, b) => a + b, 0);

const auth = { Authorization: `Token ${TOKEN}` };
const fail = async (r, what) => { throw new Error(`${what}: ${r.status} ${await r.text()}`); };

// 1. upload the zip as a user file
const form = new FormData();
form.append('file', new Blob([fs.readFileSync(zipPath)], { type: 'application/zip' }), `ilmsoft-backup-${stamp}.zip`);
let r = await fetch(`${API}/user-files/upload-file/`, { method: 'POST', headers: auth, body: form });
if (!r.ok) await fail(r, 'upload');
const uploaded = await r.json();

// 2. one row per backup
r = await fetch(`${API}/database/rows/table/${TABLE}/?user_field_names=true`, {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Name: `ilmsoft backup ${stamp}`,
    'Taken at': manifest.stamp,
    Tables: Object.keys(manifest.counts).length,
    Rows: rowsTotal,
    Note: `zip ${Math.round(size / 1024)} KB; counts: ${JSON.stringify(manifest.counts)}`,
    File: [{ name: uploaded.name, visible_name: uploaded.original_name || `ilmsoft-backup-${stamp}.zip` }],
  }),
});
if (!r.ok) await fail(r, 'create row');
const row = await r.json();
console.log(`Baserow: row ${row.id} created, file ${Math.round(size / 1024)} KB, ${Object.keys(manifest.counts).length} tables, ${rowsTotal} rows`);
fs.unlinkSync(zipPath);

// 3. prune: keep the newest KEEP rows (by id)
r = await fetch(`${API}/database/rows/table/${TABLE}/?user_field_names=true&size=200&order_by=-id`, { headers: auth });
if (r.ok) {
  const list = await r.json();
  const old = (list.results || []).slice(KEEP);
  for (const o of old) { await fetch(`${API}/database/rows/table/${TABLE}/${o.id}/`, { method: 'DELETE', headers: auth }); }
  if (old.length) console.log(`Baserow: pruned ${old.length} old backup row(s)`);
}
