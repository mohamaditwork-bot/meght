/* =============================================================
   Client-only store for the standalone (Artifact) build.
   Implements the same window.STORE interface as the server-backed
   api.js, but persists everything in the browser (localStorage).
   Used for the shareable preview link — data entry, dashboard and
   report preview work offline on any device. (Shareable manager
   links + Excel/PDF download require the deployed server build.)
   ============================================================= */
(function () {
  var SC = window.SCORING;
  var KEY = 'maysan_appraisal_artifact_v1';
  var db = { appraisals: [], performance: [], invites: [], seq: 0, perfSeq: 0 };
  var role = null;

  function load() { try { var raw = localStorage.getItem(KEY); if (raw) db = Object.assign(db, JSON.parse(raw)); } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  load();

  function uid(p) { return p + Date.now() + '_' + Math.random().toString(16).slice(2, 8); }
  function reportNo() { db.seq += 1; return 'MIG-' + new Date().getFullYear() + '-' + String(db.seq).padStart(4, '0'); }
  function perfNo() { db.perfSeq += 1; return 'MHS-PERF-' + new Date().getFullYear() + '-' + String(db.perfSeq).padStart(4, '0'); }

  window.STORE = {
    ensureSeeded: function () {},
    role: function () { return role; },
    login: function (pin) { pin = String(pin).trim(); if (pin === '056023') role = 'admin'; else if (pin === '1234') role = 'staff'; else return Promise.reject(new Error('bad_pin')); return Promise.resolve({ role: role }); },
    me: function () { return Promise.resolve(role); },
    logout: function () { role = null; return Promise.resolve(); },
    refresh: function () { load(); return Promise.resolve(); },

    getAppraisals: function () { return db.appraisals.slice(); },
    getAppraisal: function (id) { return db.appraisals.find(function (x) { return x.id === id; }) || null; },
    saveAppraisal: function (a) {
      if (!a.id) { a.id = uid('apr_'); a.createdAt = new Date().toISOString(); }
      if (!a.reportNo) a.reportNo = reportNo();
      if (a.deptId && SC) a.score = SC.compute(a.deptId, a.ratings || {});
      a.source = a.source || 'admin';
      var i = db.appraisals.findIndex(function (x) { return x.id === a.id; });
      if (i >= 0) db.appraisals[i] = a; else db.appraisals.push(a);
      save(); return Promise.resolve(a);
    },
    deleteAppraisal: function (id) { db.appraisals = db.appraisals.filter(function (x) { return x.id !== id; }); save(); return Promise.resolve(); },

    getPerformanceReviews: function () { return db.performance.slice(); },
    getPerformanceReview: function (id) { return db.performance.find(function (x) { return x.id === id; }) || null; },
    savePerformanceReview: function (r) {
      if (!r.id) { r.id = uid('perf_'); r.createdAt = new Date().toISOString(); }
      if (!r.reportNo) r.reportNo = perfNo();
      var i = db.performance.findIndex(function (x) { return x.id === r.id; });
      if (i >= 0) db.performance[i] = r; else db.performance.push(r);
      save(); return Promise.resolve(r);
    },
    deletePerformanceReview: function (id) { db.performance = db.performance.filter(function (x) { return x.id !== id; }); save(); return Promise.resolve(); },

    // Links are local-only in the preview build (no server to share them).
    listInvites: function () { return Promise.resolve(db.invites.slice()); },
    createInvite: function (p) {
      var inv = Object.assign({ token: uid('lk_'), status: 'open', createdAt: new Date().toISOString(), local: true }, p);
      inv.url = location.origin + location.pathname + '#/preview-link';
      db.invites.unshift(inv); save(); return Promise.resolve(inv);
    },
    revokeInvite: function (t) { var v = db.invites.find(function (x) { return x.token === t; }); if (v) { v.status = 'revoked'; save(); } return Promise.resolve(v); },
    deleteInvite: function (t) { db.invites = db.invites.filter(function (x) { return x.token !== t; }); save(); return Promise.resolve(); },

    getLang: function () { try { return localStorage.getItem('mig_lang') || 'ar'; } catch (e) { return 'ar'; } },
    setLang: function (l) { try { localStorage.setItem('mig_lang', l); } catch (e) {} },
    exportAll: function () { return { appraisals: db.appraisals.slice(), performanceReviews: db.performance.slice(), exportedAt: new Date().toISOString() }; },
    importAll: function (obj) { if (obj.appraisals) db.appraisals = obj.appraisals; if (obj.performanceReviews) db.performance = obj.performanceReviews; save(); return Promise.resolve(); }
  };
})();
