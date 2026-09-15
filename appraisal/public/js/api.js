/* =============================================================
   Server-backed store (central persistence)
   Replaces the old localStorage store. All appraisals, performance
   reviews and evaluation links live on the server (MySQL in
   production). Reads are served synchronously from an in-memory
   cache that is refreshed from the server after login; writes go
   to the server and update the cache.
   Language preference stays in localStorage (per-device UI choice).
   ============================================================= */
(function () {
  const cache = { appraisals: [], performance: [], role: null };
  const BASE = '/appraisal'; // the appraisal app is mounted under /appraisal

  async function req(method, url, body) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(BASE + url, opt);
    let data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) { const err = new Error((data && data.error) || ('http_' + r.status)); err.status = r.status; err.data = data; throw err; }
    return data;
  }

  // ---- Auth ----
  async function login(pin) { const d = await req('POST', '/api/auth/login', { pin: String(pin) }); cache.role = d.role; return d; }
  async function me() { try { const d = await req('GET', '/api/auth/me'); cache.role = d.role; return d.role; } catch (e) { cache.role = null; return null; } }
  async function logout() { try { await req('POST', '/api/auth/logout'); } catch (e) {} cache.role = null; }

  // ---- Refresh cache from server ----
  async function refresh() {
    const [a, p] = await Promise.all([
      req('GET', '/api/appraisals').catch(() => ({ appraisals: [] })),
      req('GET', '/api/performance').catch(() => ({ performanceReviews: [] })),
    ]);
    cache.appraisals = (a && a.appraisals) || [];
    cache.performance = (p && p.performanceReviews) || [];
    return cache;
  }

  // ---- Appraisals (numeric) ----
  const getAppraisals = () => cache.appraisals.slice();
  const getAppraisal = (id) => cache.appraisals.find((x) => x.id === id) || null;
  async function saveAppraisal(a) {
    const d = await req('POST', '/api/appraisals', a);
    const saved = d.appraisal;
    const idx = cache.appraisals.findIndex((x) => x.id === saved.id);
    if (idx >= 0) cache.appraisals[idx] = saved; else cache.appraisals.push(saved);
    // keep the caller's object reference in sync (used right after save)
    Object.assign(a, saved);
    return saved;
  }
  async function deleteAppraisal(id) {
    await req('DELETE', '/api/appraisals/' + encodeURIComponent(id));
    cache.appraisals = cache.appraisals.filter((x) => x.id !== id);
  }

  // ---- Performance reviews (qualitative) ----
  const getPerformanceReviews = () => cache.performance.slice();
  const getPerformanceReview = (id) => cache.performance.find((x) => x.id === id) || null;
  async function savePerformanceReview(review) {
    const d = await req('POST', '/api/performance', review);
    const saved = d.performanceReview;
    const idx = cache.performance.findIndex((x) => x.id === saved.id);
    if (idx >= 0) cache.performance[idx] = saved; else cache.performance.push(saved);
    Object.assign(review, saved);
    return saved;
  }
  async function deletePerformanceReview(id) {
    await req('DELETE', '/api/performance/' + encodeURIComponent(id));
    cache.performance = cache.performance.filter((x) => x.id !== id);
  }

  // ---- Evaluation links (invites) ----
  async function listInvites() { const d = await req('GET', '/api/invites'); return (d && d.invites) || []; }
  async function createInvite(payload) { const d = await req('POST', '/api/invites', payload); return d.invite; }
  async function revokeInvite(token) { const d = await req('POST', '/api/invites/' + encodeURIComponent(token) + '/revoke'); return d.invite; }
  async function deleteInvite(token) { await req('DELETE', '/api/invites/' + encodeURIComponent(token)); }

  // ---- Language (per-device) ----
  const getLang = () => { try { return localStorage.getItem('mig_lang') || 'ar'; } catch (e) { return 'ar'; } };
  const setLang = (l) => { try { localStorage.setItem('mig_lang', l); } catch (e) {} };

  // ---- Bulk (backup) ----
  function exportAll() {
    return { appraisals: cache.appraisals.slice(), performanceReviews: cache.performance.slice(), exportedAt: new Date().toISOString() };
  }
  async function importAll(obj) {
    if (obj.appraisals) for (const a of obj.appraisals) { try { await saveAppraisal(a); } catch (e) {} }
    if (obj.performanceReviews) for (const p of obj.performanceReviews) { try { await savePerformanceReview(p); } catch (e) {} }
    await refresh();
  }

  window.STORE = {
    // compatibility no-ops / helpers used by the app
    ensureSeeded() {},
    role: () => cache.role,
    login, me, logout, refresh,
    getAppraisals, getAppraisal, saveAppraisal, deleteAppraisal,
    getPerformanceReviews, getPerformanceReview, savePerformanceReview, deletePerformanceReview,
    listInvites, createInvite, revokeInvite, deleteInvite,
    getLang, setLang, exportAll, importAll,
  };
})();
