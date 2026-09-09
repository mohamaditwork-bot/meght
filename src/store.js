// store.js — simple, dependency-free JSON persistence on disk. Each monthly
// upload is stored as an immutable snapshot; metadata, users, audit, mappings,
// normalization maps, localization rules and pending items live in JSON files.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Data dir is configurable so the app can run on a writable path in serverless
// environments (e.g. Netlify functions -> /tmp). Defaults to ./data locally.
const ROOT = process.env.HR_DATA_DIR || path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data', 'seed');
const SNAP_DIR = path.join(ROOT, 'snapshots');
const UP_DIR = path.join(ROOT, 'uploads');

for (const d of [ROOT, SNAP_DIR, UP_DIR]) { try { fs.mkdirSync(d, { recursive: true }); } catch {} }

// On first run in an ephemeral env, copy bundled demo seed so the platform
// shows data immediately (dashboards/movements work out of the box).
(function seedIfEmpty() {
  try {
    if (ROOT === SEED_DIR) return;
    const metaPath = path.join(ROOT, 'meta.json');
    if (fs.existsSync(metaPath)) return;
    if (!fs.existsSync(SEED_DIR)) return;
    for (const f of fs.readdirSync(SEED_DIR)) {
      const src = path.join(SEED_DIR, f), dst = path.join(ROOT, f);
      const st = fs.statSync(src);
      if (st.isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        for (const g of fs.readdirSync(src)) fs.copyFileSync(path.join(src, g), path.join(dst, g));
      } else fs.copyFileSync(src, dst);
    }
  } catch {}
})();

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
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
// meta: { snapshots: [{ id, period, periodLabel, fileName, uploadedAt, uploadedBy,
//   employeeCount, saudiPct, payroll, qualityScore, status, mapping, dynamicFields }] }
export function getMeta() { return readJSON(F.meta, { snapshots: [], activeSnapshotId: null }); }
export function saveMeta(m) { writeJSON(F.meta, m); }

export function saveSnapshot(id, payload) {
  writeJSON(path.join(SNAP_DIR, `${id}.json`), payload);
}
export function loadSnapshot(id) {
  return readJSON(path.join(SNAP_DIR, `${id}.json`), null);
}
export function deleteSnapshot(id) {
  const meta = getMeta();
  meta.snapshots = meta.snapshots.filter((s) => s.id !== id);
  if (meta.activeSnapshotId === id) meta.activeSnapshotId = meta.snapshots.length ? latestSnapshotMeta(meta).id : null;
  saveMeta(meta);
  try { fs.unlinkSync(path.join(SNAP_DIR, `${id}.json`)); } catch {}
}

export function listSnapshots() {
  const meta = getMeta();
  return meta.snapshots.slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}
function sortKey(s) { return (s.period || '') + '|' + (s.uploadedAt || ''); }
function latestSnapshotMeta(meta) {
  return meta.snapshots.slice().sort((a, b) => sortKey(b).localeCompare(sortKey(a)))[0];
}

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

// ---- Pending uploads (awaiting mapping/validation confirmation) ----------
export function getPending() { return readJSON(F.pending, {}); }
export function savePending(p) { writeJSON(F.pending, p); }

// ---- Users ---------------------------------------------------------------
export function getUsers() { return readJSON(F.users, null); }
export function saveUsers(u) { writeJSON(F.users, u); }

// ---- Audit ---------------------------------------------------------------
export function appendAudit(entry) {
  const log = readJSON(F.audit, []);
  log.push({ ...entry, at: new Date().toISOString() });
  writeJSON(F.audit, log);
}
export function getAudit(limit = 500) {
  const log = readJSON(F.audit, []);
  return log.slice(-limit).reverse();
}

// ---- Localization rules --------------------------------------------------
export function getRules() { return readJSON(F.rules, []); }
export function saveRules(r) { writeJSON(F.rules, r); }

// ---- Job title mapping (variant -> standardized) -------------------------
export function getJobMap() { return readJSON(F.jobmap, {}); }
export function saveJobMap(m) { writeJSON(F.jobmap, m); }

// ---- Movement classifications (HR overrides) -----------------------------
export function getClassifications() { return readJSON(F.classifications, {}); }
export function saveClassifications(c) { writeJSON(F.classifications, c); }

// ---- Leaver reasons ------------------------------------------------------
export function getLeaverReasons() { return readJSON(F.leavers, {}); }
export function saveLeaverReasons(r) { writeJSON(F.leavers, r); }

export const paths = { ROOT, SNAP_DIR, UP_DIR };
