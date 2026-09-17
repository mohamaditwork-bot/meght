// store.js — persistence for the HR platform.
//
// Two backends, chosen automatically:
//   • DATABASE (MySQL): when a MySQL connection is configured (DATABASE_URL or
//     MYSQL_* env vars). All documents live in a single `hr_kv` table as JSON.
//     Reads are served synchronously from an in-memory cache that is loaded once
//     at startup (await initStore()); writes update the cache and are persisted
//     to MySQL in the background (write-through). This keeps the existing
//     synchronous API used across app.js unchanged, while every Excel upload and
//     change is saved centrally and durably.
//   • FILE (default): dependency-free JSON files on disk (used locally and on
//     hosts without MySQL). Unchanged behavior.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Safe __dirname (empty import.meta.url when bundled to CJS → fall back to cwd).
let __dirname;
try { __dirname = path.dirname(fileURLToPath(import.meta.url)); }
catch { __dirname = process.cwd(); }

function firstExisting(paths, fallback) { for (const p of paths) { try { if (fs.existsSync(p)) return p; } catch {} } return fallback; }
const SEED_DIR = firstExisting([
  path.join(__dirname, '..', 'data', 'seed'),
  path.join(process.cwd(), 'data', 'seed'),
], path.join(__dirname, '..', 'data', 'seed'));

function pickWritableRoot() {
  const candidates = [process.env.HR_DATA_DIR, path.join(__dirname, '..', 'data'), path.join(os.tmpdir(), 'maysan-hr-data')].filter(Boolean);
  for (const dir of candidates) {
    try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return dir; } catch { /* next */ }
  }
  return path.join(os.tmpdir(), 'maysan-hr-data');
}
const ROOT = pickWritableRoot();
const SNAP_DIR = path.join(ROOT, 'snapshots');
const UP_DIR = path.join(ROOT, 'uploads');
for (const d of [ROOT, SNAP_DIR, UP_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }

// ---- Backend selection ---------------------------------------------------
function mysqlConfig() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.MYSQL_HOST || process.env.MYSQLHOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.MYSQL_USER || process.env.MYSQLUSER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'maysan',
  };
}
const USE_DB = !!mysqlConfig();

// In-memory cache for DB mode: logical key -> parsed JSON document.
const mem = {};
let pool = null;

function keyForFile(file) {
  if (file.startsWith(SNAP_DIR)) return 'snapshot:' + path.basename(file, '.json');
  return path.basename(file, '.json'); // meta, users, audit, localization-rules, ...
}

async function initStore() {
  if (!USE_DB) return; // file mode seeds at module load (below)
  const mysql = (await import('mysql2/promise')).default;
  const cfg = mysqlConfig();
  pool = mysql.createPool(
    typeof cfg === 'string'
      ? cfg + (cfg.includes('?') ? '&' : '?') + 'connectionLimit=8&waitForConnections=true'
      : Object.assign({}, cfg, { connectionLimit: 8, waitForConnections: true })
  );
  await pool.query('CREATE TABLE IF NOT EXISTS hr_kv (k VARCHAR(191) PRIMARY KEY, v JSON NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
  const [rows] = await pool.query('SELECT k, v FROM hr_kv');
  // mysql2 auto-parses JSON columns; only JSON.parse a string that is valid JSON.
  for (const r of rows) { mem[r.k] = (typeof r.v === 'string') ? (() => { try { return JSON.parse(r.v); } catch { return r.v; } })() : r.v; }
  if (mem['meta'] === undefined) await seedDbFromDisk();
  console.log('[store] MySQL connected —', typeof cfg === 'string' ? cfg.replace(/:[^:@/]*@/, ':****@') : `${cfg.host}/${cfg.database}`);
}

function dbWrite(key, data) {
  mem[key] = data;
  if (pool) pool.query('INSERT INTO hr_kv (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [key, JSON.stringify(data)])
    .catch((e) => { try { console.warn('[store] db write failed', key, e.message); } catch {} });
}
function dbDelete(key) {
  delete mem[key];
  if (pool) pool.query('DELETE FROM hr_kv WHERE k=?', [key]).catch(() => {});
}

// Seed the DB from the bundled demo seed on first run so dashboards work.
async function seedDbFromDisk() {
  try {
    if (!fs.existsSync(SEED_DIR)) return;
    for (const f of fs.readdirSync(SEED_DIR)) {
      const src = path.join(SEED_DIR, f);
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        for (const g of fs.readdirSync(src)) {
          try { const doc = JSON.parse(fs.readFileSync(path.join(src, g), 'utf8')); dbWrite('snapshot:' + path.basename(g, '.json'), doc); } catch {}
        }
      } else if (f.endsWith('.json')) {
        try { const doc = JSON.parse(fs.readFileSync(src, 'utf8')); dbWrite(path.basename(f, '.json'), doc); } catch {}
      }
    }
  } catch {}
}

// FILE mode: copy bundled seed into the data dir on first run (original behavior).
function seedFilesIfEmpty() {
  try {
    if (ROOT === SEED_DIR) return;
    if (fs.existsSync(path.join(ROOT, 'meta.json'))) return;
    if (!fs.existsSync(SEED_DIR)) return;
    for (const f of fs.readdirSync(SEED_DIR)) {
      const src = path.join(SEED_DIR, f), dst = path.join(ROOT, f);
      const st = fs.statSync(src);
      if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const g of fs.readdirSync(src)) fs.copyFileSync(path.join(src, g), path.join(dst, g)); }
      else fs.copyFileSync(src, dst);
    }
  } catch {}
}

// ---- Read / write dispatch ----------------------------------------------
function readJSON(file, fallback) {
  if (USE_DB) { const k = keyForFile(file); return (k in mem && mem[k] !== undefined) ? mem[k] : fallback; }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  if (USE_DB) { dbWrite(keyForFile(file), data); return true; }
  try {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    try { console.warn('[store] write failed (read-only FS?):', file, e.message); } catch {}
    return false;
  }
}
function deleteFile(file) {
  if (USE_DB) { dbDelete(keyForFile(file)); return; }
  try { fs.unlinkSync(file); } catch {}
}

const F = {
  meta: path.join(ROOT, 'meta.json'),
  users: path.join(ROOT, 'users.json'),
  audit: path.join(ROOT, 'audit.json'),
  rules: path.join(ROOT, 'localization-rules.json'),
  pending: path.join(ROOT, 'pending-uploads.json'),
  classifications: path.join(ROOT, 'movement-classifications.json'),
  leavers: path.join(ROOT, 'leaver-reasons.json'),
  jobmap: path.join(ROOT, 'job-map.json'),
};

// ---- Snapshots -----------------------------------------------------------
export function getMeta() { return readJSON(F.meta, { snapshots: [], activeSnapshotId: null }); }
export function saveMeta(m) { writeJSON(F.meta, m); }

export function saveSnapshot(id, payload) { writeJSON(path.join(SNAP_DIR, `${id}.json`), payload); }
export function loadSnapshot(id) { return readJSON(path.join(SNAP_DIR, `${id}.json`), null); }
export function deleteSnapshot(id) {
  const meta = getMeta();
  meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
  if (meta.activeSnapshotId === id) meta.activeSnapshotId = meta.snapshots.length ? latestSnapshotMeta(meta).id : null;
  saveMeta(meta);
  deleteFile(path.join(SNAP_DIR, `${id}.json`));
}

export function listSnapshots() {
  const meta = getMeta();
  return meta.snapshots.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
function sortKey(s) { return (s.period || '') + '|' + (s.uploadedAt || ''); }
function latestSnapshotMeta(meta) { return meta.snapshots.slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a)))[0]; }

export function getActiveSnapshot() {
  const meta = getMeta();
  const id = meta.activeSnapshotId || (meta.snapshots.length ? latestSnapshotMeta(meta).id : null);
  return id ? { meta: meta.snapshots.find((s) => s.id === id), data: loadSnapshot(id) } : null;
}
export function setActiveSnapshot(id) {
  const meta = getMeta();
  if (meta.snapshots.some((s) => s.id === id)) { meta.activeSnapshotId = id; saveMeta(meta); return true; }
  return false;
}
export function previousSnapshotOf(id) {
  const list = listSnapshots();
  const idx = list.findIndex((s) => s.id === id);
  return idx > 0 ? list[idx - 1] : null;
}

// ---- Pending uploads -----------------------------------------------------
export function getPending() { return readJSON(F.pending, {}); }
export function savePending(p) { writeJSON(F.pending, p); }

// ---- Users ---------------------------------------------------------------
export function getUsers() { return readJSON(F.users, null); }
export function saveUsers(u) { writeJSON(F.users, u); }

// ---- Audit ---------------------------------------------------------------
export function appendAudit(entry) {
  const log = readJSON(F.audit, []);
  log.push({ ...entry, at: new Date().toISOString() });
  // keep the audit log bounded so the single JSON document stays small
  writeJSON(F.audit, log.slice(-2000));
}
export function getAudit(limit = 500) {
  const log = readJSON(F.audit, []);
  return log.slice(-limit).reverse();
}

// ---- Localization rules --------------------------------------------------
export function getRules() { return readJSON(F.rules, []); }
export function saveRules(r) { writeJSON(F.rules, r); }

// ---- Job title mapping ---------------------------------------------------
export function getJobMap() { return readJSON(F.jobmap, {}); }
export function saveJobMap(m) { writeJSON(F.jobmap, m); }

// ---- Movement classifications --------------------------------------------
export function getClassifications() { return readJSON(F.classifications, {}); }
export function saveClassifications(c) { writeJSON(F.classifications, c); }

// ---- Leaver reasons ------------------------------------------------------
export function getLeaverReasons() { return readJSON(F.leavers, {}); }
export function saveLeaverReasons(r) { writeJSON(F.leavers, r); }

// FILE mode: seed at module load so read-only/serverless hosts show demo data
// immediately (matches the platform's original behavior).
if (!USE_DB) seedFilesIfEmpty();

export const paths = { ROOT, SNAP_DIR, UP_DIR };
export const backend = USE_DB ? 'mysql' : 'file';
export { initStore };
