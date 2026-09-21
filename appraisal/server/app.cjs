/* =============================================================
   MAYSAN INTERNATIONAL GROUP — Appraisal server
   Serves the appraisal web app and a REST API with central
   storage (MySQL in production, JSON file otherwise) plus the
   shareable manager-evaluation-link workflow.
   ============================================================= */
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { getStore } = require('./store');
const { D, SCORING, departmentById, hotelById } = require('./appraisal-model');

function createAppraisalApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 8090);
const ADMIN_PIN = String(process.env.APPRAISAL_ADMIN_PIN || '0560239005');
const STAFF_PIN = String(process.env.APPRAISAL_STAFF_PIN || '1234');

// ---- Session (signed cookie) --------------------------------------------
let SECRET = null;
async function secret() {
  if (SECRET) return SECRET;
  const store = await getStore();
  let s = await store.settings.get('session_secret', null);
  if (!s) { s = crypto.randomBytes(32).toString('hex'); await store.settings.set('session_secret', s); }
  SECRET = s; return s;
}
function sign(value, key) { return crypto.createHmac('sha256', key).update(value).digest('hex'); }
async function makeToken(role) {
  const key = await secret();
  const payload = `${role}.${Date.now()}`;
  return `${payload}.${sign(payload, key)}`;
}
async function readToken(tok) {
  if (!tok) return null;
  const key = await secret();
  const parts = String(tok).split('.');
  if (parts.length !== 3) return null;
  const [role, ts, mac] = parts;
  if (sign(`${role}.${ts}`, key) !== mac) return null;
  // 30-day validity
  if (Date.now() - Number(ts) > 30 * 24 * 3600 * 1000) return null;
  return { role };
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
async function currentRole(req) {
  // Single sign-on & unified permissions: any user created in the HR platform
  // automatically works in the appraisal system with a matching role. The HR
  // session carries the user's role and permission list; an HR administrator
  // (or anyone who can manage users) becomes an appraisal admin, everyone else
  // is an appraisal manager (create & view, but no deletes / account management).
  const u = req.session && req.session.user;
  if (u) {
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const isAdmin = u.role === 'admin' || perms.includes('manage_users');
    return isAdmin ? 'admin' : 'manager';
  }
  const s = await readToken(parseCookies(req).mig_sess);
  return s ? s.role : null;
}
function setSession(res, token) {
  res.setHeader('Set-Cookie', `mig_sess=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', 'mig_sess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
function requireAdmin(handler) {
  return async (req, res) => {
    const role = await currentRole(req);
    if (role !== 'admin') return res.status(401).json({ error: 'unauthorized' });
    return handler(req, res);
  };
}
function requireAuth(handler) {
  return async (req, res) => {
    const role = await currentRole(req);
    if (role !== 'admin' && role !== 'staff' && role !== 'manager') return res.status(401).json({ error: 'unauthorized' });
    return handler(req, res);
  };
}
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { console.error(e); res.status(500).json({ error: 'server_error', detail: String(e.message || e) }); }
};

// ---- Auth ----------------------------------------------------------------
app.post('/api/auth/login', wrap(async (req, res) => {
  const pin = String((req.body && req.body.pin) || '').trim();
  let role = null;
  if (pin && pin === ADMIN_PIN) role = 'admin';
  else if (pin && pin === STAFF_PIN) role = 'manager';
  else if (pin) {
    const store = await getStore();
    const users = await store.settings.get('users', []);
    const u = (users || []).find((x) => x.active !== false && String(x.passcode) === pin);
    if (u) role = u.role === 'admin' ? 'admin' : 'manager';
  }
  if (!role) return res.status(401).json({ error: 'bad_pin' });
  setSession(res, await makeToken(role));
  res.json({ ok: true, role });
}));
app.get('/api/auth/me', wrap(async (req, res) => {
  const role = await currentRole(req);
  if (!role) return res.status(401).json({ error: 'unauthenticated' });
  res.json({ role });
}));
app.post('/api/auth/logout', wrap(async (req, res) => { clearSession(res); res.json({ ok: true }); }));

// ---- Users & roles (admin only) -----------------------------------------
app.get('/api/users', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  const users = await store.settings.get('users', []);
  res.json({ users: (users || []).map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active !== false })) });
})));
app.post('/api/users', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  const b = req.body || {};
  const passcode = String(b.passcode || '').trim();
  if (!passcode) return res.status(400).json({ error: 'passcode_required' });
  const users = await store.settings.get('users', []);
  const taken = (users || []).some((u) => String(u.passcode) === passcode) || passcode === ADMIN_PIN || passcode === STAFF_PIN;
  if (taken) return res.status(400).json({ error: 'passcode_taken' });
  const u = { id: 'u_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex'), name: b.name || '', username: b.username || '', passcode, role: b.role === 'admin' ? 'admin' : 'manager', active: true, createdAt: new Date().toISOString() };
  users.push(u); await store.settings.set('users', users);
  res.json({ user: { id: u.id, name: u.name, username: u.username, role: u.role, active: true } });
})));
app.post('/api/users/:id/toggle', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  const users = await store.settings.get('users', []);
  const u = (users || []).find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'not_found' });
  u.active = u.active === false; await store.settings.set('users', users);
  res.json({ ok: true, active: u.active });
})));
app.delete('/api/users/:id', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  const users = (await store.settings.get('users', [])).filter((x) => x.id !== req.params.id);
  await store.settings.set('users', users);
  res.json({ ok: true });
})));

// ---- Report-number helpers ----------------------------------------------
async function appraisalReportNo() {
  const store = await getStore();
  const n = await store.nextSeq('appraisal');
  return `MIG-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}
async function performanceReportNo() {
  const store = await getStore();
  const n = await store.nextSeq('performance');
  return `MHS-PERF-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}

// ---- Appraisals (numeric) — admin ---------------------------------------
app.get('/api/appraisals', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  res.json({ appraisals: await store.appraisals.list() });
})));
app.get('/api/appraisals/:id', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  const a = await store.appraisals.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found' });
  res.json({ appraisal: a });
})));
app.post('/api/appraisals', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  const a = req.body || {};
  if (!a.id) { a.id = 'apr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'); a.createdAt = new Date().toISOString(); }
  if (!a.reportNo) a.reportNo = await appraisalReportNo();
  // recompute score server-side for consistency
  if (a.deptId) a.score = SCORING.compute(a.deptId, a.ratings || {});
  a.source = a.source || 'admin';
  await store.appraisals.save(a);
  res.json({ appraisal: a });
})));
app.delete('/api/appraisals/:id', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  await store.appraisals.remove(req.params.id);
  res.json({ ok: true });
})));

// ---- Performance reviews (qualitative) — admin --------------------------
app.get('/api/performance', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  res.json({ performanceReviews: await store.performance.list() });
})));
app.post('/api/performance', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  const r = req.body || {};
  if (!r.id) { r.id = 'perf_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'); r.createdAt = new Date().toISOString(); }
  if (!r.reportNo) r.reportNo = await performanceReportNo();
  await store.performance.save(r);
  res.json({ performanceReview: r });
})));
app.delete('/api/performance/:id', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  await store.performance.remove(req.params.id);
  res.json({ ok: true });
})));

// ---- Invites (shareable manager evaluation links) — admin ---------------
function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}
function inviteLink(req, token) { return `${baseUrl(req)}${req.baseUrl || ''}/e/${token}`; }

app.get('/api/invites', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  const invites = await store.invites.list();
  res.json({ invites: invites.map((i) => ({ ...i, url: inviteLink(req, i.token) })) });
})));

app.post('/api/invites', requireAuth(wrap(async (req, res) => {
  const store = await getStore();
  const b = req.body || {};
  const hotel = b.hotelId ? hotelById(b.hotelId) : null;
  const dept = b.deptId ? departmentById(b.deptId) : null;
  if (b.deptId && !dept) return res.status(400).json({ error: 'bad_department' });
  const token = crypto.randomBytes(9).toString('base64url'); // ~12 url-safe chars
  const invite = {
    token,
    status: 'open',
    hotelId: b.hotelId || null,
    hotelName: b.hotelName || (hotel ? (hotel.ar || hotel.en) : null),
    deptId: b.deptId || null,
    lockDept: b.deptId ? (b.lockDept !== false) : false, // if a dept is chosen, lock it unless explicitly open
    employeeName: b.employeeName || null,
    employeeNo: b.employeeNo || null,
    jobTitle: b.jobTitle || null,
    managerName: b.managerName || null,
    periodId: b.periodId || null,
    note: b.note || null,
    resultId: null,
    reusable: b.reusable === true,   // multi-use link: accepts more than one evaluation
    submitCount: 0,
    createdBy: 'admin',
    createdAt: new Date().toISOString(),
    submittedAt: null,
    expiresAt: b.expiresAt || null,
  };
  await store.invites.create(invite);
  res.json({ invite: { ...invite, url: inviteLink(req, token) } });
})));

app.post('/api/invites/:token/revoke', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  const updated = await store.invites.update(req.params.token, { status: 'revoked' });
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json({ invite: updated });
})));
app.delete('/api/invites/:token', requireAdmin(wrap(async (req, res) => {
  const store = await getStore();
  await store.invites.remove(req.params.token);
  res.json({ ok: true });
})));

// ---- Public invite endpoints (no login — the token is the key) ----------
function publicInviteView(invite) {
  return {
    token: invite.token,
    status: invite.status,
    hotelId: invite.hotelId,
    hotelName: invite.hotelName,
    deptId: invite.deptId,
    lockDept: !!invite.lockDept,
    employeeName: invite.employeeName,
    employeeNo: invite.employeeNo,
    jobTitle: invite.jobTitle,
    managerName: invite.managerName,
    periodId: invite.periodId,
    note: invite.note,
    reusable: !!invite.reusable,
    submitCount: invite.submitCount || 0,
    expiresAt: invite.expiresAt,
  };
}
function inviteUsable(invite) {
  if (!invite) return { ok: false, reason: 'not_found' };
  if (invite.status === 'revoked') return { ok: false, reason: 'revoked' };
  if (invite.status === 'submitted' && !invite.reusable) return { ok: false, reason: 'submitted' };
  if (invite.expiresAt && Date.now() > Date.parse(invite.expiresAt)) return { ok: false, reason: 'expired' };
  return { ok: true };
}

app.get('/api/public/invite/:token', wrap(async (req, res) => {
  const store = await getStore();
  const invite = await store.invites.get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'not_found' });
  const usable = inviteUsable(invite);
  res.json({ invite: publicInviteView(invite), usable: usable.ok, reason: usable.reason || null });
}));

app.post('/api/public/invite/:token/submit', wrap(async (req, res) => {
  const store = await getStore();
  const invite = await store.invites.get(req.params.token);
  const usable = inviteUsable(invite);
  if (!usable.ok) return res.status(usable.reason === 'not_found' ? 404 : 409).json({ error: usable.reason });

  const b = req.body || {};
  // Locked fields come from the invite; open fields come from the manager.
  const deptId = invite.lockDept && invite.deptId ? invite.deptId : (b.deptId || invite.deptId);
  if (!deptId || !departmentById(deptId)) return res.status(400).json({ error: 'department_required' });

  const employeeName = invite.employeeName || b.employeeName || '';
  if (!String(employeeName).trim()) return res.status(400).json({ error: 'employee_name_required' });

  const ratings = (b.ratings && typeof b.ratings === 'object') ? b.ratings : {};
  const score = SCORING.compute(deptId, ratings); // authoritative, clamps out-of-range values

  const now = new Date().toISOString();
  const appraisal = {
    id: 'apr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    reportNo: await appraisalReportNo(),
    createdAt: now,
    source: 'invite',
    inviteToken: invite.token,
    hotelName: invite.hotelName || b.hotelName || '',
    employeeName,
    employeeNo: invite.employeeNo || b.employeeNo || '',
    jobTitle: invite.jobTitle || b.jobTitle || '',
    managerName: invite.managerName || b.managerName || '',
    deptId,
    periodId: invite.periodId || b.periodId || '',
    evalDateFrom: b.evalDateFrom || '',
    evalDateTo: b.evalDateTo || '',
    joiningDate: b.joiningDate || '',
    ratings,
    remarks: b.remarks || {},
    score,
    // development / notes / signatures captured by the manager
    strengths: b.strengths || '',
    improvements: b.improvements || '',
    objectives: b.objectives || '',
    trainingNeeds: b.trainingNeeds || [],
    promotion: b.promotion || '',
    contractRenewal: b.contractRenewal || '',
    managerNotes: b.managerNotes || '',
    managerRecommendation: b.managerRecommendation || '',
    signatures: b.signatures || {},
    lang: b.lang || 'ar',
  };
  await store.appraisals.save(appraisal);
  const count = (invite.submitCount || 0) + 1;
  // A reusable link stays open (accepts more evaluations); a single-use link closes.
  await store.invites.update(invite.token, {
    status: invite.reusable ? 'open' : 'submitted',
    submittedAt: now, resultId: appraisal.id, submitCount: count,
  });

  res.json({ ok: true, reportNo: appraisal.reportNo, score: { total: score.total, pct: score.pct }, reusable: !!invite.reusable });
}));

// ---- Static + invite page routing ---------------------------------------
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
// Pretty link for managers: /e/<token> serves the invite page.
app.get('/e/:token', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'invite.html')));
app.get('/healthz', (req, res) => res.json({ ok: true }));

return app;
}

module.exports = { createAppraisalApp };
