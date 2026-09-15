/* =============================================================
   JSON file storage adapter (zero-setup fallback)
   Persists the whole database to a single JSON file in a writable
   directory. Used automatically when no MySQL connection is
   configured, so the system runs out of the box for development
   and small single-server deployments.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const os = require('os');

function pickDir() {
  const candidates = [
    process.env.APPRAISAL_DATA_DIR,
    path.join(process.cwd(), 'data'),
    path.join(os.tmpdir(), 'maysan-appraisal-data'),
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch (e) { /* try next */ }
  }
  return os.tmpdir();
}

function createJsonStore() {
  const dir = pickDir();
  const file = path.join(dir, 'appraisal-db.json');
  let db = { appraisals: [], performance_reviews: [], invites: [], settings: {} };
  let writeTimer = null;

  function load() {
    try {
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        db = Object.assign(db, parsed);
      }
    } catch (e) { /* keep defaults on corrupt file */ }
    db.appraisals = db.appraisals || [];
    db.performance_reviews = db.performance_reviews || [];
    db.invites = db.invites || [];
    db.settings = db.settings || {};
  }
  function flush() {
    try { fs.writeFileSync(file, JSON.stringify(db, null, 2)); } catch (e) { /* read-only FS: stay in memory */ }
  }
  function persist() {
    // debounce writes; also flush synchronously so a crash keeps recent data
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(flush, 40);
    flush();
  }

  load();

  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

  return {
    kind: 'json',
    dataLocation: file,
    async init() { return true; },

    settings: {
      async get(key, fallback) { return key in db.settings ? clone(db.settings[key]) : fallback; },
      async set(key, value) { db.settings[key] = clone(value); persist(); return value; },
    },
    async nextSeq(name) {
      const k = 'seq:' + name;
      const next = (Number(db.settings[k]) || 0) + 1;
      db.settings[k] = next; persist();
      return next;
    },

    appraisals: {
      async list() { return clone(db.appraisals); },
      async get(id) { return clone(db.appraisals.find((a) => a.id === id) || null); },
      async save(obj) {
        const idx = db.appraisals.findIndex((a) => a.id === obj.id);
        if (idx >= 0) db.appraisals[idx] = clone(obj); else db.appraisals.push(clone(obj));
        persist(); return clone(obj);
      },
      async remove(id) { db.appraisals = db.appraisals.filter((a) => a.id !== id); persist(); },
    },

    performance: {
      async list() { return clone(db.performance_reviews); },
      async get(id) { return clone(db.performance_reviews.find((a) => a.id === id) || null); },
      async save(obj) {
        const idx = db.performance_reviews.findIndex((a) => a.id === obj.id);
        if (idx >= 0) db.performance_reviews[idx] = clone(obj); else db.performance_reviews.push(clone(obj));
        persist(); return clone(obj);
      },
      async remove(id) { db.performance_reviews = db.performance_reviews.filter((a) => a.id !== id); persist(); },
    },

    invites: {
      async list() { return clone(db.invites); },
      async get(token) { return clone(db.invites.find((i) => i.token === token) || null); },
      async create(obj) { db.invites.push(clone(obj)); persist(); return clone(obj); },
      async update(token, patch) {
        const idx = db.invites.findIndex((i) => i.token === token);
        if (idx < 0) return null;
        db.invites[idx] = Object.assign({}, db.invites[idx], clone(patch));
        persist(); return clone(db.invites[idx]);
      },
      async remove(token) { db.invites = db.invites.filter((i) => i.token !== token); persist(); },
    },
  };
}

module.exports = { createJsonStore };
