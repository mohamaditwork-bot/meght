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
// Accept the common connection-URL variable names used by cloud hosts. Railway's
// MySQL plugin, for example, exposes MYSQL_URL / MYSQL_PUBLIC_URL rather than
// DATABASE_URL — accepting all of them means the app connects to the persistent
// database automatically and never silently falls back to ephemeral file storage.
function firstEnvUrl() {
  const names = ['DATABASE_URL', 'MYSQL_URL', 'DATABASE_PRIVATE_URL', 'MYSQL_PRIVATE_URL',
    'MYSQL_PUBLIC_URL', 'JAWSDB_URL', 'CLEARDB_DATABASE_URL'];
  for (const n of names) { const v = process.env[n]; if (v && String(v).trim()) return String(v).trim(); }
  return null;
}
function mysqlConfig() {
  const url = firstEnvUrl();
  if (url) return url;
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
// Export so the launcher can warn loudly if it is about to run without a database.
export const usingDatabase = USE_DB;

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
  const removed = meta.snapshots.find((s) => s.id === id);
  const kind = snapKind(removed);
  meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
  meta.activeByKind = meta.activeByKind || {};
  if (meta.activeByKind[kind] === id) meta.activeByKind[kind] = (latestSnapshotMeta(meta, kind) || {}).id || null;
  if (meta.activeSnapshotId === id) meta.activeSnapshotId = (latestSnapshotMeta(meta, 'permanent') || {}).id || null;
  saveMeta(meta);
  deleteFile(path.join(SNAP_DIR, `${id}.json`));
}

// Every snapshot belongs to a KIND: 'permanent' (direct employees, with leaves)
// or 'contractor' (company/labor-supply staff). Older snapshots without a kind
// are treated as permanent. Each kind keeps its own independent history and its
// own "active" pointer, so uploading a contractor file never overwrites the
// permanent data and vice versa.
export function snapKind(s) { return (s && s.kind === 'contractor') ? 'contractor' : 'permanent'; }

export function listSnapshots(kind) {
  const meta = getMeta();
  let list = meta.snapshots.slice();
  if (kind) list = list.filter((s) => snapKind(s) === kind);
  return list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
function sortKey(s) { return (s.period || '') + '|' + (s.uploadedAt || ''); }
function latestSnapshotMeta(meta, kind) {
  let list = meta.snapshots.slice();
  if (kind) list = list.filter((s) => snapKind(s) === kind);
  return list.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))[0];
}

// getActiveSnapshot(kind): with no kind, returns the active PERMANENT snapshot
// (backward compatible with every existing dashboard). With a kind, returns that
// kind's active snapshot (or the latest of that kind).
export function getActiveSnapshot(kind) {
  const meta = getMeta();
  const k = kind || 'permanent';
  const byKind = meta.activeByKind && meta.activeByKind[k];
  // legacy: fall back to the old single activeSnapshotId for permanent
  const legacy = (k === 'permanent') ? meta.activeSnapshotId : null;
  const id = byKind || legacy || (latestSnapshotMeta(meta, k) || {}).id || null;
  const m = id ? meta.snapshots.find((s) => s.id === id) : null;
  return m ? { meta: m, data: loadSnapshot(m.id) } : null;
}
export function setActiveSnapshot(id) {
  const meta = getMeta();
  const s = meta.snapshots.find((x) => x.id === id);
  if (!s) return false;
  meta.activeByKind = meta.activeByKind || {};
  meta.activeByKind[snapKind(s)] = id;
  if (snapKind(s) === 'permanent') meta.activeSnapshotId = id; // keep legacy pointer in sync
  saveMeta(meta);
  return true;
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

// ---- Full backup / restore ----------------------------------------------
// dumpAll() returns EVERYTHING the HR store holds as one plain object, keyed by
// logical document name (meta, users, audit, ... and snapshot:<id> for each
// snapshot). restoreAll() writes such an object back, replacing current data.
// Used by the admin one-click "Backup" (download) and "Restore" (upload).
export function dumpAll() {
  if (USE_DB) {
    // mem is the authoritative in-memory cache in DB mode.
    return JSON.parse(JSON.stringify(mem));
  }
  const out = {};
  for (const [name, file] of Object.entries(F)) {
    const v = readJSON(file, undefined);
    if (v !== undefined) out[name] = v;
  }
  try {
    for (const f of fs.readdirSync(SNAP_DIR)) {
      if (!f.endsWith('.json')) continue;
      const doc = readJSON(path.join(SNAP_DIR, f), undefined);
      if (doc !== undefined) out['snapshot:' + path.basename(f, '.json')] = doc;
    }
  } catch {}
  return out;
}

export function restoreAll(obj) {
  if (!obj || typeof obj !== 'object') return { restored: 0 };
  let n = 0;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (key.startsWith('snapshot:')) {
      const id = key.slice('snapshot:'.length);
      if (USE_DB) dbWrite(key, value);
      else writeJSON(path.join(SNAP_DIR, `${id}.json`), value);
    } else if (F[key]) {
      writeJSON(F[key], value);
    } else if (USE_DB) {
      // Unknown top-level key in DB mode — preserve it verbatim.
      dbWrite(key, value);
    } else {
      writeJSON(path.join(ROOT, `${key}.json`), value);
    }
    n++;
  }
  return { restored: n };
}

// FILE mode: seed at module load so read-only/serverless hosts show demo data
// immediately (matches the platform's original behavior).
if (!USE_DB) seedFilesIfEmpty();

export const paths = { ROOT, SNAP_DIR, UP_DIR };
export const backend = USE_DB ? 'mysql' : 'file';
export { initStore };
