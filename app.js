// server.js — MAYSAN INT. GROUP HR Intelligence Platform API + static host.
import express from 'express';
import cookieSession from 'cookie-session';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import { readWorkbook } from './src/workbook.js';
import { proposeMapping } from './src/mapping.js';
import { buildRecords } from './src/transform.js';
import { validate } from './src/validation.js';
import { computeKPIs, groupBy, crossTab, salaryHistogram, tenureBuckets } from './src/analytics.js';
import { compareSnapshots, movementSummary, buildTimeline } from './src/movements.js';
import { complianceMatrix, buildAlerts, missingDocuments, docStatus } from './src/expiry.js';
import { internalRatios, overallInternalRatio, gapAnalysis, ruleForPosition } from './src/localization.js';
import { standardize, mappingRows } from './src/jobmap.js';
import { generateInsights, executiveSummary } from './src/insights.js';
import * as store from './src/store.js';
import * as auth from './src/auth.js';
import { resolveSnapshot, applyFilters, filterOptions } from './src/dataset.js';
import { daysUntil } from './src/util.js';
import { EXPIRY_FIELDS } from './src/schema.js';

// Resolve __dirname safely. When this app is bundled to CommonJS (e.g. Netlify's
// esbuild function bundler), import.meta.url is empty and fileURLToPath() throws
// at load time — which would crash the whole serverless function and make EVERY
// /api call (login included) fail. Fall back to cwd in that case.
let __dirname;
try { __dirname = path.dirname(fileURLToPath(import.meta.url)); }
catch { __dirname = process.cwd(); }
const app = express();

try { auth.ensureSeeded(); } catch (e) { /* never block startup on seed */ }

// Behind Netlify's proxy for correct secure-cookie handling.
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));
// Stateless signed-cookie sessions so auth works on serverless (no shared
// server memory). secure:false so the session cookie is ALWAYS set (Netlify is
// HTTPS-only regardless) — avoids a class of "logged out immediately" failures
// where secure-cookie detection behind a proxy is flaky.
app.use(cookieSession({
  name: 'hrsess',
  keys: [process.env.SESSION_SECRET || 'maysan-hr-intelligence-default-key-change-me'],
  httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 60 * 1000,
}));
// Refresh the idle window on each authenticated request (rolling session).
app.use((req, res, next) => { if (req.session && req.session.user) req.session.touchedAt = Date.now(); next(); });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ---- Auth middleware -----------------------------------------------------
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'unauthenticated' });
}
function requirePerm(perm) {
  return (req, res, next) => {
    const u = req.session?.user;
    if (!u) return res.status(401).json({ error: 'unauthenticated' });
    if (!auth.can(u, perm)) return res.status(403).json({ error: 'forbidden', perm });
    next();
  };
}
const ip = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0];

// ---- Auth routes ---------------------------------------------------------
// Single universal passcode (no user accounts needed). The correct passcode
// grants full admin. This runs FIRST and depends on nothing that can throw, so
// login can never fail with a false "wrong passcode" after deployment.
const ADMIN_PASSCODE = process.env.HR_ADMIN_PASSCODE || '056023';
function adminUser() {
  return auth.publicUser({
    id: 'admin', username: process.env.HR_ADMIN_USERNAME || 'mohamad.hr',
    name: process.env.HR_ADMIN_NAME || 'مدير الموارد البشرية', role: 'admin',
  });
}
app.post('/api/login', (req, res) => {
  const passcode = String((req.body && req.body.passcode) || '').trim();
  if (!passcode) return res.status(400).json({ error: 'passcode_required' });
  if (passcode === ADMIN_PASSCODE) {
    const user = adminUser();
    req.session.user = user;
    try { store.appendAudit({ action: 'login', actor: user.username, ip: ip(req) }); } catch {}
    return res.json({ user });
  }
  // Any additional accounts (optional) still work, but never 500 the login.
  try {
    const r = auth.loginByPasscode(passcode, ip(req));
    if (r.ok) { req.session.user = r.user; return res.json({ user: r.user }); }
    return res.status(401).json({ error: r.locked ? 'locked' : 'invalid', lockMinutes: r.lockMinutes });
  } catch (e) {
    return res.status(401).json({ error: 'invalid' });
  }
});
app.post('/api/logout', (req, res) => {
  const u = req.session?.user;
  if (u) store.appendAudit({ action: 'logout', actor: u.username, ip: ip(req) });
  req.session = null;
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'unauthenticated' });
  res.json({ user: req.session.user });
});

// ---- Active dataset helper ----------------------------------------------
function activeRecords(req) {
  const snap = resolveSnapshot(req.query.period);
  if (!snap || !snap.data) return null;
  return { meta: snap.meta, records: snap.data.records, dynamicFields: snap.data.dynamicFields || [], asOf: snap.meta.asOf || snap.data.asOf || null };
}
function filtered(req) {
  const ds = activeRecords(req);
  if (!ds) return null;
  return { ...ds, records: applyFilters(ds.records, req.query) };
}

// ---- State ---------------------------------------------------------------
app.get('/api/state', requireAuth, (req, res) => {
  const snapshots = store.listSnapshots().map((s) => ({
    id: s.id, period: s.period, periodLabel: s.periodLabel, fileName: s.fileName,
    uploadedAt: s.uploadedAt, uploadedBy: s.uploadedBy, employeeCount: s.employeeCount,
    saudiPct: s.saudiPct, payroll: s.payroll, qualityScore: s.qualityScore, status: s.status,
  }));
  const active = store.getActiveSnapshot();
  const ds = active ? { records: active.data.records } : null;
  res.json({
    hasData: !!active,
    active: active ? { id: active.meta.id, period: active.meta.period, periodLabel: active.meta.periodLabel, asOf: active.meta.asOf } : null,
    snapshots,
    options: ds ? filterOptions(ds.records) : {},
    quality: active ? active.data.validation?.quality : null,
    user: req.session.user,
  });
});

// ---- KPIs & dashboards ---------------------------------------------------
app.get('/api/kpis', requireAuth, (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  res.json({ kpis: computeKPIs(ds.records, ds.asOf), asOf: ds.asOf, count: ds.records.length });
});

app.get('/api/workforce', requirePerm('view_workforce'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  res.json({
    bySection: groupBy(ds.records, 'section', ds.asOf),
    byPosition: groupBy(ds.records, 'position', ds.asOf),
    byNationality: groupBy(ds.records, 'nationality', ds.asOf),
    byGender: groupBy(ds.records, 'gender', ds.asOf),
    byLevel: groupBy(ds.records, 'level_code', ds.asOf),
    byDivision: groupBy(ds.records, 'division', ds.asOf),
    kpis: computeKPIs(ds.records, ds.asOf),
  });
});

app.get('/api/saudization', requirePerm('view_saudization'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const rules = store.getRules();
  const jobmap = store.getJobMap();
  const overall = overallInternalRatio(ds.records);
  const build = (key) => internalRatios(ds.records, key);
  // Gap analysis only where a verified official rule applies. The employee's
  // position is first standardized via the Job Mapping table, so title variants
  // ("موظف استقبال" / "استقبال" / "Front Desk") resolve to one rule.
  const positions = build('position').map((g) => {
    const std = standardize(g.key, jobmap);
    const rule = ruleForPosition(rules, std);
    return { ...gapAnalysis({ key: g.key, total: g.total, saudi: g.saudi }, rule ? rule.required_pct : null), standardized: std, rule_name: rule ? rule.name : null };
  });
  res.json({
    overall, bySection: build('section'), byPosition: positions,
    byLevel: build('level_code'), byDivision: build('division'),
    rulesCount: rules.filter((r) => r.status === 'active').length,
  });
});

app.get('/api/nationality', requirePerm('view_nationality'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const groups = groupBy(ds.records, 'nationality', ds.asOf);
  const total = ds.records.length;
  res.json({
    total, distinct: groups.length,
    groups: groups.map((g) => ({ ...g, pct: total ? g.total / total * 100 : 0 })),
    bySectionCross: crossTab(ds.records, 'nationality', 'section'),
    byPositionCross: crossTab(ds.records, 'nationality', 'position'),
  });
});

app.get('/api/departments', requirePerm('view_departments'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  res.json({ departments: groupBy(ds.records, 'section', ds.asOf) });
});
app.get('/api/department/:name', requirePerm('view_departments'), (req, res) => {
  const ds = activeRecords(req); if (!ds) return res.json({ empty: true });
  const recs = ds.records.filter((r) => String(r.section ?? '').trim() === req.params.name);
  const g = groupBy(recs, 'section', ds.asOf)[0] || null;
  res.json({
    name: req.params.name, summary: g,
    kpis: computeKPIs(recs, ds.asOf),
    byPosition: groupBy(recs, 'position', ds.asOf),
    byNationality: groupBy(recs, 'nationality', ds.asOf),
    byLevel: groupBy(recs, 'level_code', ds.asOf),
    probation: recs.filter((r) => { const d = daysUntil(r.probation_date, ds.asOf); return d !== null && d >= 0 && d <= 90; }).length,
    employees: recs.map(slimEmployee),
  });
});

app.get('/api/jobtitles', requirePerm('view_jobtitles'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const groups = groupBy(ds.records, 'position', ds.asOf).map((g) => {
    const recs = ds.records.filter((r) => String(r.position ?? '').trim() === (g.key === '— غير محدد —' ? '' : g.key));
    return { ...g, levels: groupBy(recs, 'level_code', ds.asOf).map((l) => ({ key: l.key, total: l.total })) };
  });
  res.json({ positions: groups });
});

app.get('/api/leave', requirePerm('view_leave'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const withAnnual = ds.records.filter((r) => num(r.end_annual_balance) !== null);
  const withHoliday = ds.records.filter((r) => num(r.end_holiday_balance) !== null);
  const top = (arr, key) => arr.map((r) => ({ code: r.employee_code, name: r.arabic_name || r.name, section: r.section, value: r[key] }))
    .sort((a, b) => b.value - a.value).slice(0, 10);
  const k = computeKPIs(ds.records, ds.asOf);
  res.json({
    kpis: {
      annual_total: k.annual_balance_total, annual_avg: k.annual_balance_avg,
      annual_max: withAnnual.length ? Math.max(...withAnnual.map((r) => r.end_annual_balance)) : null,
      annual_min: withAnnual.length ? Math.min(...withAnnual.map((r) => r.end_annual_balance)) : null,
      holiday_total: k.holiday_balance_total, holiday_avg: k.holiday_balance_avg,
    },
    topAnnual: top(withAnnual, 'end_annual_balance'),
    topHoliday: top(withHoliday, 'end_holiday_balance'),
    bySection: groupBy(ds.records, 'section', ds.asOf).map((g) => ({ key: g.key, total: g.annual_total, avg: g.annual_avg })),
    byPosition: groupBy(ds.records, 'position', ds.asOf).map((g) => ({ key: g.key, total: g.annual_total, avg: g.annual_avg })),
    byNationality: groupBy(ds.records, 'nationality', ds.asOf).map((g) => ({ key: g.key, total: g.annual_total, avg: g.annual_avg })),
    byTenure: tenureBuckets(ds.records, ds.asOf),
  });
});

app.get('/api/salary', requirePerm('view_salary'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const k = computeKPIs(ds.records, ds.asOf);
  res.json({
    kpis: { total_payroll: k.total_payroll, average_salary: k.average_salary, median_salary: k.median_salary, min_salary: k.min_salary, max_salary: k.max_salary },
    byDepartment: groupBy(ds.records, 'section', ds.asOf).map((g) => ({ key: g.key, payroll: g.payroll, avg: g.avg_salary, total: g.total })),
    byLevel: groupBy(ds.records, 'level_code', ds.asOf).map((g) => ({ key: g.key, payroll: g.payroll, avg: g.avg_salary, total: g.total })),
    byPosition: groupBy(ds.records, 'position', ds.asOf).map((g) => ({ key: g.key, payroll: g.payroll, avg: g.avg_salary, min: g.min_salary, max: g.max_salary, total: g.total })),
    histogram: salaryHistogram(ds.records),
  });
});

app.get('/api/expiry', requirePerm('view_expiry'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  res.json({
    matrix: complianceMatrix(ds.records, ds.asOf),
    missing: missingDocuments(ds.records, ds.asOf),
    fields: EXPIRY_FIELDS,
  });
});
app.get('/api/alerts', requirePerm('view_expiry'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  res.json({ alerts: buildAlerts(ds.records, ds.asOf) });
});

// ---- Employees -----------------------------------------------------------
app.get('/api/employees', requirePerm('view_employees'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const term = String(req.query.q || '').trim().toLowerCase();
  let recs = ds.records;
  if (term) recs = recs.filter((r) =>
    String(r.employee_code ?? '').toLowerCase().includes(term) ||
    String(r.name ?? '').toLowerCase().includes(term) ||
    String(r.arabic_name ?? '').includes(req.query.q.trim()) ||
    String(r.section ?? '').includes(req.query.q.trim()) ||
    String(r.position ?? '').includes(req.query.q.trim()));
  res.json({ total: recs.length, employees: recs.slice(0, 300).map(slimEmployee) });
});

app.get('/api/employee/:code', requirePerm('view_employees'), (req, res) => {
  const active = store.getActiveSnapshot();
  if (!active) return res.json({ empty: true });
  const code = req.params.code;
  const rec = active.data.records.find((r) => String(r.employee_code) === String(code));
  if (!rec) return res.status(404).json({ error: 'not_found' });
  const asOf = active.meta.asOf;
  const docs = EXPIRY_FIELDS.map((f) => { const d = daysUntil(rec[f.key], asOf); return { key: f.key, label: f.label, labelEn: f.labelEn, date: rec[f.key], days: d, status: docStatus(rec, f.key, asOf) }; });
  // Timeline across all snapshots
  const snaps = store.listSnapshots().map((s) => {
    const data = store.loadSnapshot(s.id);
    const r = data?.records.find((x) => String(x.employee_code) === String(code)) || null;
    return { period: s.periodLabel || s.period, date: s.asOf, record: r };
  });
  const canSalary = auth.can(req.session.user, 'view_salary');
  const out = { ...rec };
  if (!canSalary) delete out.total_salary;
  res.json({ employee: out, documents: docs, timeline: buildTimeline(code, snaps), canSalary });
});

function slimEmployee(r) {
  return { employee_code: r.employee_code, name: r.name, arabic_name: r.arabic_name,
    section: r.section, position: r.position, division: r.division, level_code: r.level_code,
    nationality: r.nationality, gender: r.gender, is_saudi: r.is_saudi,
    end_annual_balance: r.end_annual_balance, end_holiday_balance: r.end_holiday_balance,
    hiring_date: r.hiring_date, contract_expire_date: r.contract_expire_date,
    residence_expire_date: r.residence_expire_date, health_card_expire_date: r.health_card_expire_date,
    passport_expire_date: r.passport_expire_date, probation_date: r.probation_date };
}

// ---- Movements -----------------------------------------------------------
function movementsFor(periodId) {
  const cur = periodId ? { id: periodId } : store.getActiveSnapshot()?.meta;
  if (!cur) return null;
  const curMeta = store.listSnapshots().find((s) => s.id === cur.id) || store.getActiveSnapshot()?.meta;
  if (!curMeta) return null;
  const prevMeta = store.previousSnapshotOf(curMeta.id);
  const curData = store.loadSnapshot(curMeta.id);
  if (!prevMeta) return { curMeta, prevMeta: null, result: { newHires: curData.records.map((r) => ({ employee_code: r.employee_code, name: r.name, arabic_name: r.arabic_name, section: r.section, position: r.position, division: r.division, hiring_date: r.hiring_date, total_salary: r.total_salary, nationality: r.nationality, is_saudi: r.is_saudi, level_code: r.level_code })), missing: [], movements: [] }, first: true };
  const prevData = store.loadSnapshot(prevMeta.id);
  const result = compareSnapshots(prevData.records, curData.records, curMeta.asOf);
  return { curMeta, prevMeta, result, prevCount: prevData.records.length };
}

app.get('/api/movements', requirePerm('view_movements'), (req, res) => {
  const m = movementsFor(req.query.period);
  if (!m) return res.json({ empty: true });
  const classes = store.getClassifications();
  const leaverReasons = store.getLeaverReasons();
  const canSalary = auth.can(req.session.user, 'view_salary');
  const movements = m.result.movements.map((mv) => {
    const key = `${m.curMeta.id}:${mv.employee_code}`;
    const override = classes[key];
    const out = { ...mv, classification: override ? { ...mv.classification, ...override, overridden: true } : mv.classification };
    if (!canSalary) { out.salary_delta = null; out.salary_pct = null; out.previous = { ...out.previous, total_salary: null }; out.current = { ...out.current, total_salary: null }; out.changes = out.changes.filter((c) => c.field !== 'total_salary'); }
    return out;
  });
  const missing = m.result.missing.map((x) => ({ ...x, reason: leaverReasons[`${m.curMeta.id}:${x.employee_code}`] || null }));
  res.json({
    first: !!m.first, period: m.curMeta.periodLabel, previousPeriod: m.prevMeta?.periodLabel || null,
    newHires: m.result.newHires, missing, movements,
  });
});

app.post('/api/movement/classify', requirePerm('manage_movements'), (req, res) => {
  const { period, code, type, label } = req.body || {};
  if (!period || !code || !type) return res.status(400).json({ error: 'missing_fields' });
  const classes = store.getClassifications();
  classes[`${period}:${code}`] = { type, label: label || type, confidence: 'hr_confirmed' };
  store.saveClassifications(classes);
  store.appendAudit({ action: 'movement_classified', actor: req.session.user.username, detail: `تصنيف حركة ${code} → ${type}` });
  res.json({ ok: true });
});

app.post('/api/leaver/reason', requirePerm('manage_leavers'), (req, res) => {
  const { period, code, reason } = req.body || {};
  if (!period || !code || !reason) return res.status(400).json({ error: 'missing_fields' });
  const reasons = store.getLeaverReasons();
  reasons[`${period}:${code}`] = reason;
  store.saveLeaverReasons(reasons);
  store.appendAudit({ action: 'leaver_reason_set', actor: req.session.user.username, detail: `سبب مغادرة ${code} → ${reason}` });
  res.json({ ok: true });
});

app.get('/api/monthly-movement', requirePerm('view_movements'), (req, res) => {
  const m = movementsFor(req.query.period);
  if (!m) return res.json({ empty: true });
  if (m.first) return res.json({ first: true, period: m.curMeta.periodLabel });
  res.json({ period: m.curMeta.periodLabel, previousPeriod: m.prevMeta.periodLabel, summary: movementSummary(m.prevCount, m.result.newHires, m.result.missing, m.result.movements) });
});

// ---- Month-to-month comparison ------------------------------------------
app.get('/api/compare', requirePerm('view_comparison'), (req, res) => {
  const { from, to } = req.query;
  const fromMeta = store.listSnapshots().find((s) => s.id === from);
  const toMeta = store.listSnapshots().find((s) => s.id === to);
  if (!fromMeta || !toMeta) return res.status(400).json({ error: 'invalid_periods' });
  const a = store.loadSnapshot(from), b = store.loadSnapshot(to);
  const ka = computeKPIs(a.records, fromMeta.asOf), kb = computeKPIs(b.records, toMeta.asOf);
  const cmp = compareSnapshots(a.records, b.records, toMeta.asOf);
  const canSalary = auth.can(req.session.user, 'view_salary');
  const delta = (x, y) => ({ from: x, to: y, change: (x != null && y != null) ? y - x : null });
  res.json({
    from: { id: from, label: fromMeta.periodLabel }, to: { id: to, label: toMeta.periodLabel },
    metrics: {
      headcount: delta(ka.total_employees, kb.total_employees),
      saudi: delta(ka.saudi_employees, kb.saudi_employees),
      saudi_pct: delta(ka.saudi_pct, kb.saudi_pct),
      payroll: canSalary ? delta(ka.total_payroll, kb.total_payroll) : null,
      annual_balance: delta(ka.annual_balance_total, kb.annual_balance_total),
      departments: delta(ka.departments, kb.departments),
      documents_expiring: delta(ka.documents_expiring_soon, kb.documents_expiring_soon),
    },
    newHires: cmp.newHires.length, missing: cmp.missing.length,
    promotions: cmp.movements.filter((x) => x.classification.type === 'Promotion').length,
    positionChanges: cmp.movements.filter((x) => x.changes.some((c) => c.field === 'position')).length,
    salaryChanges: canSalary ? cmp.movements.filter((x) => x.changes.some((c) => c.field === 'total_salary')).length : null,
  });
});

// ---- Insights & summary --------------------------------------------------
app.get('/api/insights', requirePerm('view_insights'), (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const m = movementsFor(req.query.period);
  const ms = m && !m.first ? movementSummary(m.prevCount, m.result.newHires, m.result.missing, m.result.movements) : null;
  res.json({ insights: generateInsights(ds.records, { asOfISO: ds.asOf, movementSummary: ms }) });
});
app.get('/api/summary', requireAuth, (req, res) => {
  const ds = filtered(req); if (!ds) return res.json({ empty: true });
  const active = store.getActiveSnapshot();
  const m = movementsFor(req.query.period);
  const ms = m && !m.first ? movementSummary(m.prevCount, m.result.newHires, m.result.missing, m.result.movements) : null;
  res.json({ summary: executiveSummary(ds.records, { asOfISO: ds.asOf, movementSummary: ms, quality: active?.data.validation?.quality }) });
});

// ---- Upload history ------------------------------------------------------
app.get('/api/uploads', requireAuth, (req, res) => {
  res.json({ uploads: store.listSnapshots().slice().reverse().map((s) => ({
    id: s.id, fileName: s.fileName, period: s.period, periodLabel: s.periodLabel,
    uploadedAt: s.uploadedAt, uploadedBy: s.uploadedBy, employeeCount: s.employeeCount,
    saudiPct: s.saudiPct, payroll: s.payroll, qualityScore: s.qualityScore, status: s.status,
    active: store.getMeta().activeSnapshotId === s.id,
  })) });
});
app.post('/api/uploads/:id/activate', requirePerm('view_dashboard'), (req, res) => {
  if (store.setActiveSnapshot(req.params.id)) { store.appendAudit({ action: 'snapshot_activated', actor: req.session.user.username, detail: req.params.id }); return res.json({ ok: true }); }
  res.status(404).json({ error: 'not_found' });
});
app.delete('/api/uploads/:id', requirePerm('manage_users'), (req, res) => {
  store.deleteSnapshot(req.params.id);
  store.appendAudit({ action: 'snapshot_deleted', actor: req.session.user.username, detail: req.params.id });
  res.json({ ok: true });
});

// ---- Localization rules --------------------------------------------------
app.get('/api/rules', requireAuth, (req, res) => res.json({ rules: store.getRules() }));
app.post('/api/rules', requirePerm('manage_localization_rules'), (req, res) => {
  const rules = store.getRules();
  const rule = { ...req.body, id: crypto.randomUUID(), system_updated: new Date().toISOString() };
  rules.push(rule); store.saveRules(rules);
  store.appendAudit({ action: 'rule_created', actor: req.session.user.username, detail: rule.name || rule.id });
  res.json({ rule });
});
app.put('/api/rules/:id', requirePerm('manage_localization_rules'), (req, res) => {
  const rules = store.getRules();
  const i = rules.findIndex((r) => r.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not_found' });
  rules[i] = { ...rules[i], ...req.body, id: req.params.id, system_updated: new Date().toISOString() };
  store.saveRules(rules);
  store.appendAudit({ action: 'rule_updated', actor: req.session.user.username, detail: rules[i].name || rules[i].id });
  res.json({ rule: rules[i] });
});
app.delete('/api/rules/:id', requirePerm('manage_localization_rules'), (req, res) => {
  let rules = store.getRules();
  rules = rules.filter((r) => r.id !== req.params.id);
  store.saveRules(rules);
  store.appendAudit({ action: 'rule_deleted', actor: req.session.user.username, detail: req.params.id });
  res.json({ ok: true });
});

// ---- Job title mapping ---------------------------------------------------
app.get('/api/jobmap', requireAuth, (req, res) => {
  const map = store.getJobMap();
  const active = store.getActiveSnapshot();
  const positions = active ? active.data.records.map((r) => r.position).filter(Boolean) : [];
  res.json({ map, rows: mappingRows(positions, map), standardTitles: [...new Set(Object.values(map).filter(Boolean))] });
});
app.put('/api/jobmap', requirePerm('manage_localization_rules'), (req, res) => {
  const map = req.body && req.body.map;
  if (!map || typeof map !== 'object') return res.status(400).json({ error: 'invalid_map' });
  store.saveJobMap(map);
  store.appendAudit({ action: 'jobmap_updated', actor: req.session.user.username, detail: `${Object.keys(map).length} تعيين` });
  res.json({ ok: true, map });
});

// ---- Users ---------------------------------------------------------------
app.get('/api/users', requirePerm('manage_users'), (req, res) => res.json({ users: auth.listUsers(), roles: auth.ROLES }));
app.post('/api/users', requirePerm('manage_users'), (req, res) => {
  try { res.json({ user: auth.createUser(req.body, req.session.user.username) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/users/:id', requirePerm('manage_users'), (req, res) => {
  try { res.json({ user: auth.updateUser(req.params.id, req.body, req.session.user.username) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Audit ---------------------------------------------------------------
app.get('/api/audit', requirePerm('view_audit'), (req, res) => res.json({ audit: store.getAudit() }));

// ---- Upload flow ---------------------------------------------------------
app.post('/api/upload', requirePerm('upload_data'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  try {
    const { headers, rows } = readWorkbook(req.file.buffer);
    if (!rows.length) return res.status(400).json({ error: 'empty_file' });
    const mapping = proposeMapping(headers, rows);
    const period = detectPeriod(req.file.originalname);
    const pendingId = crypto.randomUUID();
    // preliminary validation on auto-mapping
    const { records } = buildRecords(headers, rows, mapping, {});
    const validation = validate(records, mapping);
    const pending = store.getPending();
    pending[pendingId] = {
      id: pendingId, fileName: req.file.originalname, uploadedAt: new Date().toISOString(),
      uploadedBy: req.session.user.username, headers, rows, mapping, period,
    };
    store.savePending(pending);
    store.appendAudit({ action: 'file_uploaded', actor: req.session.user.username, detail: `${req.file.originalname} (${records.length} سجل)`, ip: ip(req) });
    res.json({
      pendingId, fileName: req.file.originalname, headers, rowCount: rows.length,
      mapping, period, validation,
      sample: records.slice(0, 8).map((r) => r.raw),
    });
  } catch (e) {
    res.status(400).json({ error: 'parse_failed', message: e.message });
  }
});

app.post('/api/upload/:id/analyze', requirePerm('upload_data'), (req, res) => {
  const pending = store.getPending();
  const p = pending[req.params.id];
  if (!p) return res.status(404).json({ error: 'not_found' });
  const mapping = req.body.mapping || p.mapping;
  const normalizationMaps = req.body.normalizationMaps || {};
  const { records } = buildRecords(p.headers, p.rows, mapping, normalizationMaps);
  const validation = validate(records, mapping);
  const kpis = computeKPIs(records, null);
  p.mapping = mapping; store.savePending(pending);
  res.json({ validation, kpis, count: records.length });
});

app.post('/api/upload/:id/commit', requirePerm('approve_validation'), (req, res) => {
  const pending = store.getPending();
  const p = pending[req.params.id];
  if (!p) return res.status(404).json({ error: 'not_found' });
  const mapping = req.body.mapping || p.mapping;
  const normalizationMaps = req.body.normalizationMaps || {};
  const period = req.body.period || p.period.value;
  const periodLabel = req.body.periodLabel || p.period.label;
  const asOf = req.body.asOf || p.period.asOf || new Date().toISOString().slice(0, 10);
  const { records, dynamicFields } = buildRecords(p.headers, p.rows, mapping, normalizationMaps);
  const validation = validate(records, mapping);
  const kpis = computeKPIs(records, asOf);
  const id = crypto.randomUUID();
  store.saveSnapshot(id, { records, dynamicFields, validation, asOf, mapping, normalizationMaps });
  const meta = store.getMeta();
  const entry = {
    id, period, periodLabel, asOf, fileName: p.fileName, uploadedAt: p.uploadedAt,
    committedAt: new Date().toISOString(), uploadedBy: p.uploadedBy,
    employeeCount: records.length, saudiPct: kpis.saudi_pct, payroll: kpis.total_payroll,
    qualityScore: validation.quality.score, status: 'committed',
  };
  // Update-not-duplicate: re-uploading a file for a period that already exists
  // REPLACES that period's snapshot instead of creating a duplicate month.
  const existingIdx = meta.snapshots.findIndex((s) => s.period === period);
  if (existingIdx >= 0) {
    const old = meta.snapshots[existingIdx];
    if (old.id !== id) store.deleteSnapshot(old.id);
    meta.snapshots[existingIdx] = entry;
  } else {
    meta.snapshots.push(entry);
  }
  meta.activeSnapshotId = id;
  store.saveMeta(meta);
  delete pending[req.params.id]; store.savePending(pending);
  store.appendAudit({ action: 'data_committed', actor: req.session.user.username, detail: `${periodLabel} — ${records.length} موظف — جودة ${validation.quality.score}%`, ip: ip(req) });
  res.json({ ok: true, snapshotId: id, kpis, quality: validation.quality });
});

app.delete('/api/upload/:id', requirePerm('upload_data'), (req, res) => {
  const pending = store.getPending();
  delete pending[req.params.id]; store.savePending(pending);
  res.json({ ok: true });
});

// Period detection from filename
function detectPeriod(fileName) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const arMonths = { يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, أبريل: 4, مايو: 5, يونيو: 6, يوليو: 7, اغسطس: 8, أغسطس: 8, سبتمبر: 9, اكتوبر: 10, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
  const name = fileName.toLowerCase();
  let year = null, month = null, confident = false;
  let m = name.match(/(20\d{2})[-_ ]?(0[1-9]|1[0-2])/) || name.match(/(0[1-9]|1[0-2])[-_ ](20\d{2})/);
  if (m) { if (m[1].length === 4) { year = +m[1]; month = +m[2]; } else { month = +m[1]; year = +m[2]; } confident = true; }
  if (!confident) {
    const y = name.match(/20\d{2}/); if (y) year = +y[0];
    for (const [k, v] of Object.entries(months)) if (name.includes(k)) { month = v; break; }
    for (const [k, v] of Object.entries(arMonths)) if (fileName.includes(k)) { month = v; break; }
    if (year && month) confident = true;
  }
  const now = new Date();
  if (!year) year = now.getFullYear();
  if (!month) month = now.getMonth() + 1;
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const value = `${year}-${String(month).padStart(2, '0')}`;
  return { value, label: `${monthNames[month - 1]} ${year}`, year, month, confident, asOf: `${value}-01` };
}

// ---- Static & SPA --------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;
