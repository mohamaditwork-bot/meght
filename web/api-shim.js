// api-shim.js — runs the platform's backend logic entirely in the browser for
// the standalone hosted demo. Replicates the server's REST routes over the
// embedded snapshots. (Login here is a client-side demo gate; the full app uses
// a hashed server passcode.)
import { SNAPSHOTS as SEED_SNAPSHOTS, META as SEED_META, RULES as SEED_RULES } from './embed-data.js';
import { proposeMapping } from '../src/mapping.js';
import { buildRecords } from '../src/transform.js';
import { validate } from '../src/validation.js';
import { computeKPIs, groupBy, crossTab, salaryHistogram, tenureBuckets } from '../src/analytics.js';
import { compareSnapshots, movementSummary, buildTimeline } from '../src/movements.js';
import { complianceMatrix, buildAlerts, missingDocuments, docStatus } from '../src/expiry.js';
import { internalRatios, overallInternalRatio, gapAnalysis, ruleForPosition } from '../src/localization.js';
import { generateInsights, executiveSummary } from '../src/insights.js';
import { daysUntil } from '../src/util.js';
import { EXPIRY_FIELDS } from '../src/schema.js';

// Mutable in-memory store (seeded from the embedded data). Uploads add snapshots
// here so the user can update the data entirely in the browser.
const SNAPSHOTS = Object.assign({}, SEED_SNAPSHOTS);
const META = { snapshots: SEED_META.snapshots.slice(), activeSnapshotId: SEED_META.activeSnapshotId };

// Inlined from dataset.js (pure — avoids pulling Node-only store.js into the bundle).
function applyFilters(records, q = {}) {
  let out = records;
  const eq = (key, val) => { if (val) out = out.filter((r) => String(r[key] ?? '').trim() === String(val).trim()); };
  eq('division', q.division); eq('section', q.department || q.section); eq('position', q.position);
  eq('nationality', q.nationality); eq('level_code', q.level);
  if (q.gender) { const g = String(q.gender).toLowerCase();
    out = out.filter((r) => { const s = String(r.gender ?? '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
      if (['male', 'ذكر', 'ذكور', 'm'].includes(g)) return ['ذكر', 'male', 'm', 'ذكور'].includes(s);
      if (['female', 'انثى', 'اناث', 'f'].includes(g)) return ['انثي', 'انثى', 'female', 'f', 'اناث'].includes(s);
      return true; }); }
  if (q.saudi === 'saudi' || q.saudi === 'yes') out = out.filter((r) => r.is_saudi);
  if (q.saudi === 'non_saudi' || q.saudi === 'no') out = out.filter((r) => !r.is_saudi);
  if (q.employee) { const t = String(q.employee).trim().toLowerCase();
    out = out.filter((r) => String(r.employee_code ?? '').toLowerCase().includes(t) || String(r.name ?? '').toLowerCase().includes(t) || String(r.arabic_name ?? '').includes(q.employee.trim())); }
  return out;
}
function filterOptions(records) {
  const set = (key) => [...new Set(records.map((r) => (r[key] == null ? '' : String(r[key]).trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  return { division: set('division'), department: set('section'), position: set('position'), nationality: set('nationality'), level: set('level_code'), gender: set('gender') };
}

const DEMO_PASSCODE = '056023';
const ADMIN = {
  id: 'admin', username: 'admin', name: 'System Administrator', role: 'admin',
  roleLabel: 'Admin — مدير النظام',
  permissions: ['view_dashboard', 'view_workforce', 'view_saudization', 'view_nationality',
    'view_departments', 'view_jobtitles', 'view_leave', 'view_expiry', 'view_employees',
    'view_movements', 'view_comparison', 'view_salary', 'upload_data', 'manage_mapping',
    'approve_validation', 'manage_movements', 'manage_leavers', 'manage_localization_rules',
    'view_insights', 'view_reports', 'export_reports', 'view_audit', 'manage_users'],
};
let session = { user: null };
let RULES = (typeof SEED_RULES !== 'undefined' && SEED_RULES) ? SEED_RULES.slice() : [];
const ordered = () => META.snapshots.slice().sort((a, b) => ((a.period || '') + (a.asOf || '')).localeCompare((b.period || '') + (b.asOf || ''))); // chronological
const activeId = () => META.activeSnapshotId;

function resolve(period) {
  const id = (period && SNAPSHOTS[period]) ? period : activeId();
  return SNAPSHOTS[id];
}
function prevOf(id) {
  const list = ordered();
  const i = list.findIndex((s) => s.id === id);
  return i > 0 ? list[i - 1] : null;
}
function slim(r) {
  return { employee_code: r.employee_code, name: r.name, arabic_name: r.arabic_name, section: r.section,
    position: r.position, division: r.division, level_code: r.level_code, nationality: r.nationality,
    gender: r.gender, is_saudi: r.is_saudi, end_annual_balance: r.end_annual_balance,
    end_holiday_balance: r.end_holiday_balance, hiring_date: r.hiring_date,
    contract_expire_date: r.contract_expire_date, residence_expire_date: r.residence_expire_date,
    health_card_expire_date: r.health_card_expire_date, passport_expire_date: r.passport_expire_date,
    probation_date: r.probation_date };
}

function movementsFor(period) {
  const cur = resolve(period); if (!cur) return null;
  const prevEntry = prevOf(cur.meta.id);
  if (!prevEntry) {
    return { first: true, curMeta: cur.meta, prevMeta: null,
      result: { newHires: cur.records.map(slim), missing: [], movements: [] } };
  }
  const prev = SNAPSHOTS[prevEntry.id]; // resolve actual records for the previous snapshot
  const result = compareSnapshots(prev.records, cur.records, cur.asOf);
  return { first: false, curMeta: cur.meta, prevMeta: prev.meta, prevCount: prev.records.length, result };
}

const R = {}; // route table: 'METHOD /path' → handler(q, body, params)

R['POST /api/login'] = (q, body) => {
  if (String(body.passcode || '').trim() === DEMO_PASSCODE) { session.user = ADMIN; return { status: 200, body: { user: ADMIN } }; }
  return { status: 401, body: { error: 'invalid' } };
};
R['POST /api/logout'] = () => { session.user = null; return { status: 200, body: { ok: true } }; };
R['GET /api/me'] = () => session.user ? { status: 200, body: { user: session.user } } : { status: 401, body: { error: 'unauthenticated' } };

R['GET /api/state'] = () => {
  const active = SNAPSHOTS[activeId()];
  return { status: 200, body: {
    hasData: true,
    active: { id: active.meta.id, period: active.meta.period, periodLabel: active.meta.periodLabel, asOf: active.asOf },
    snapshots: META.snapshots,
    options: filterOptions(active.records),
    quality: active.quality, user: session.user,
  } };
};

function fq(q) { const ds = resolve(q.period); return { asOf: ds.asOf, records: applyFilters(ds.records, q) }; }

R['GET /api/kpis'] = (q) => { const d = fq(q); return ok({ kpis: computeKPIs(d.records, d.asOf), asOf: d.asOf, count: d.records.length }); };
R['GET /api/workforce'] = (q) => { const d = fq(q); return ok({
  bySection: groupBy(d.records, 'section', d.asOf), byPosition: groupBy(d.records, 'position', d.asOf),
  byNationality: groupBy(d.records, 'nationality', d.asOf), byGender: groupBy(d.records, 'gender', d.asOf),
  byLevel: groupBy(d.records, 'level_code', d.asOf), byDivision: groupBy(d.records, 'division', d.asOf),
  kpis: computeKPIs(d.records, d.asOf) }); };
R['GET /api/saudization'] = (q) => { const d = fq(q);
  const build = (k) => internalRatios(d.records, k);
  const positions = build('position').map((g) => { const rule = ruleForPosition(RULES, g.key); return gapAnalysis({ key: g.key, total: g.total, saudi: g.saudi }, rule ? rule.required_pct : null); });
  return ok({ overall: overallInternalRatio(d.records), bySection: build('section'), byPosition: positions, byLevel: build('level_code'), byDivision: build('division'), rulesCount: RULES.filter((r) => r.status === 'active').length }); };
R['GET /api/nationality'] = (q) => { const d = fq(q); const groups = groupBy(d.records, 'nationality', d.asOf); const total = d.records.length;
  return ok({ total, distinct: groups.length, groups: groups.map((g) => ({ ...g, pct: total ? g.total / total * 100 : 0 })),
    bySectionCross: crossTab(d.records, 'nationality', 'section'), byPositionCross: crossTab(d.records, 'nationality', 'position') }); };
R['GET /api/departments'] = (q) => { const d = fq(q); return ok({ departments: groupBy(d.records, 'section', d.asOf) }); };
R['GET /api/jobtitles'] = (q) => { const d = fq(q);
  const groups = groupBy(d.records, 'position', d.asOf).map((g) => { const recs = d.records.filter((r) => String(r.position ?? '').trim() === (g.key === '— غير محدد —' ? '' : g.key)); return { ...g, levels: groupBy(recs, 'level_code', d.asOf).map((l) => ({ key: l.key, total: l.total })) }; });
  return ok({ positions: groups }); };
R['GET /api/leave'] = (q) => { const d = fq(q); const num = (v) => typeof v === 'number' && isFinite(v) ? v : null;
  const wa = d.records.filter((r) => num(r.end_annual_balance) !== null); const wh = d.records.filter((r) => num(r.end_holiday_balance) !== null);
  const top = (arr, key) => arr.map((r) => ({ code: r.employee_code, name: r.arabic_name || r.name, section: r.section, value: r[key] })).sort((a, b) => b.value - a.value).slice(0, 10);
  const k = computeKPIs(d.records, d.asOf);
  return ok({ kpis: { annual_total: k.annual_balance_total, annual_avg: k.annual_balance_avg, annual_max: wa.length ? Math.max(...wa.map((r) => r.end_annual_balance)) : null, annual_min: wa.length ? Math.min(...wa.map((r) => r.end_annual_balance)) : null, holiday_total: k.holiday_balance_total, holiday_avg: k.holiday_balance_avg },
    topAnnual: top(wa, 'end_annual_balance'), topHoliday: top(wh, 'end_holiday_balance'),
    bySection: groupBy(d.records, 'section', d.asOf).map((g) => ({ key: g.key, total: g.annual_total, avg: g.annual_avg })),
    byPosition: groupBy(d.records, 'position', d.asOf).map((g) => ({ key: g.key, total: g.annual_total, avg: g.annual_avg })),
    byNationality: groupBy(d.records, 'nationality', d.asOf).map((g) => ({ key: g.key, total: g.annual_total, avg: g.annual_avg })),
    byTenure: tenureBuckets(d.records, d.asOf) }); };
R['GET /api/salary'] = (q) => { const d = fq(q); const k = computeKPIs(d.records, d.asOf);
  return ok({ kpis: { total_payroll: k.total_payroll, average_salary: k.average_salary, median_salary: k.median_salary, min_salary: k.min_salary, max_salary: k.max_salary },
    byDepartment: groupBy(d.records, 'section', d.asOf).map((g) => ({ key: g.key, payroll: g.payroll, avg: g.avg_salary, total: g.total })),
    byLevel: groupBy(d.records, 'level_code', d.asOf).map((g) => ({ key: g.key, payroll: g.payroll, avg: g.avg_salary, total: g.total })),
    byPosition: groupBy(d.records, 'position', d.asOf).map((g) => ({ key: g.key, payroll: g.payroll, avg: g.avg_salary, min: g.min_salary, max: g.max_salary, total: g.total })),
    histogram: salaryHistogram(d.records) }); };
R['GET /api/expiry'] = (q) => { const d = fq(q); return ok({ matrix: complianceMatrix(d.records, d.asOf), missing: missingDocuments(d.records, d.asOf), fields: EXPIRY_FIELDS }); };
R['GET /api/alerts'] = (q) => { const d = fq(q); return ok({ alerts: buildAlerts(d.records, d.asOf) }); };
R['GET /api/employees'] = (q) => { const d = fq(q); const term = String(q.q || '').trim().toLowerCase(); let recs = d.records;
  if (term) recs = recs.filter((r) => String(r.employee_code ?? '').toLowerCase().includes(term) || String(r.name ?? '').toLowerCase().includes(term) || String(r.arabic_name ?? '').includes(q.q.trim()) || String(r.section ?? '').includes(q.q.trim()) || String(r.position ?? '').includes(q.q.trim()));
  return ok({ total: recs.length, employees: recs.slice(0, 300).map(slim) }); };
R['GET /api/insights'] = (q) => { const d = fq(q); const m = movementsFor(q.period); const ms = m && !m.first ? movementSummary(m.prevCount, m.result.newHires, m.result.missing, m.result.movements) : null; return ok({ insights: generateInsights(d.records, { asOfISO: d.asOf, movementSummary: ms }) }); };
R['GET /api/summary'] = (q) => { const d = fq(q); const active = SNAPSHOTS[activeId()]; const m = movementsFor(q.period); const ms = m && !m.first ? movementSummary(m.prevCount, m.result.newHires, m.result.missing, m.result.movements) : null; return ok({ summary: executiveSummary(d.records, { asOfISO: d.asOf, movementSummary: ms, quality: active.quality }) }); };
R['GET /api/uploads'] = () => ok({ uploads: META.snapshots.slice().reverse().map((s) => ({ ...s, active: s.id === activeId() })) });
R['GET /api/rules'] = () => ok({ rules: RULES });
R['GET /api/audit'] = () => ok({ audit: [
  { at: SNAPSHOTS[activeId()].meta.uploadedAt, action: 'data_committed', actor: 'admin', detail: 'سبتمبر 2026 — 104 موظف — جودة 95.7%' },
  { at: new Date().toISOString(), action: 'login', actor: 'admin', detail: 'تسجيل دخول ناجح (عرض تجريبي)' },
] });
R['GET /api/users'] = () => ok({ users: [ADMIN], roles: { admin: { label: 'Admin — مدير النظام' }, hr_manager: { label: 'HR Manager' }, hr_officer: { label: 'HR Officer' }, dept_manager: { label: 'Department Manager' }, viewer: { label: 'Viewer' } } });
R['GET /api/monthly-movement'] = (q) => { const m = movementsFor(q.period); if (!m) return ok({ empty: true }); if (m.first) return ok({ first: true, period: m.curMeta.periodLabel }); return ok({ period: m.curMeta.periodLabel, previousPeriod: m.prevMeta.periodLabel, summary: movementSummary(m.prevCount, m.result.newHires, m.result.missing, m.result.movements) }); };
R['GET /api/movements'] = (q) => { const m = movementsFor(q.period); if (!m) return ok({ empty: true });
  return ok({ first: !!m.first, period: m.curMeta.periodLabel, previousPeriod: m.prevMeta ? m.prevMeta.periodLabel : null, newHires: m.result.newHires, missing: m.result.missing.map((x) => ({ ...x, reason: null })), movements: m.result.movements }); };
R['GET /api/compare'] = (q) => { const a = SNAPSHOTS[q.from], b = SNAPSHOTS[q.to]; if (!a || !b) return { status: 400, body: { error: 'invalid_periods' } };
  const ka = computeKPIs(a.records, a.asOf), kb = computeKPIs(b.records, b.asOf); const cmp = compareSnapshots(a.records, b.records, b.asOf);
  const delta = (x, y) => ({ from: x, to: y, change: (x != null && y != null) ? y - x : null });
  return ok({ from: { id: q.from, label: a.meta.periodLabel }, to: { id: q.to, label: b.meta.periodLabel },
    metrics: { headcount: delta(ka.total_employees, kb.total_employees), saudi: delta(ka.saudi_employees, kb.saudi_employees), saudi_pct: delta(ka.saudi_pct, kb.saudi_pct), payroll: delta(ka.total_payroll, kb.total_payroll), annual_balance: delta(ka.annual_balance_total, kb.annual_balance_total), departments: delta(ka.departments, kb.departments), documents_expiring: delta(ka.documents_expiring_soon, kb.documents_expiring_soon) },
    newHires: cmp.newHires.length, missing: cmp.missing.length, promotions: cmp.movements.filter((x) => x.classification.type === 'Promotion').length, positionChanges: cmp.movements.filter((x) => x.changes.some((c) => c.field === 'position')).length, salaryChanges: cmp.movements.filter((x) => x.changes.some((c) => c.field === 'total_salary')).length }); };

function ok(body) { return { status: 200, body }; }

// Dynamic-path routes handled here.
function dynamic(method, pathname, q) {
  let m;
  if (method === 'GET' && (m = pathname.match(/^\/api\/department\/(.+)$/))) {
    const name = decodeURIComponent(m[1]); const ds = resolve(q.period);
    const recs = ds.records.filter((r) => String(r.section ?? '').trim() === name);
    return ok({ name, summary: groupBy(recs, 'section', ds.asOf)[0] || null, kpis: computeKPIs(recs, ds.asOf),
      byPosition: groupBy(recs, 'position', ds.asOf), byNationality: groupBy(recs, 'nationality', ds.asOf), byLevel: groupBy(recs, 'level_code', ds.asOf),
      probation: recs.filter((r) => { const dd = daysUntil(r.probation_date, ds.asOf); return dd !== null && dd >= 0 && dd <= 90; }).length,
      employees: recs.map(slim) });
  }
  if (method === 'GET' && (m = pathname.match(/^\/api\/employee\/(.+)$/))) {
    const code = decodeURIComponent(m[1]); const active = SNAPSHOTS[q.period && SNAPSHOTS[q.period] ? q.period : activeId()];
    const rec = active.records.find((r) => String(r.employee_code) === String(code));
    if (!rec) return { status: 404, body: { error: 'not_found' } };
    const docs = EXPIRY_FIELDS.map((f) => { const dd = daysUntil(rec[f.key], active.asOf); return { key: f.key, label: f.label, labelEn: f.labelEn, date: rec[f.key], days: dd, status: docStatus(rec, f.key, active.asOf) }; });
    const snaps = ordered().map((s) => ({ period: s.periodLabel, date: s.asOf, record: SNAPSHOTS[s.id].records.find((x) => String(x.employee_code) === String(code)) || null }));
    return ok({ employee: rec, documents: docs, timeline: buildTimeline(code, snaps), canSalary: true });
  }
  if (method === 'POST' && (pathname.match(/^\/api\/movement\/classify$/) || pathname.match(/^\/api\/leaver\/reason$/) || pathname.match(/^\/api\/uploads\/.+\/activate$/))) {
    return ok({ ok: true }); // demo: accepted, not persisted
  }
  return { status: 404, body: { error: 'not_found' } };
}

export async function clientApi(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const url = new URL(path, 'http://demo.local');
  const pathname = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  const body = opts.body ? JSON.parse(opts.body) : {};
  // auth gate (login/me/logout exempt)
  const open = pathname === '/api/login' || pathname === '/api/logout' || pathname === '/api/me';
  if (!open && !session.user) return { status: 401, body: { error: 'unauthenticated' } };
  const key = `${method} ${pathname}`;
  if (R[key]) { try { return R[key](q, body); } catch (e) { return { status: 500, body: { error: String(e.message || e) } }; } }
  try { return dynamic(method, pathname, q); } catch (e) { return { status: 500, body: { error: String(e.message || e) } }; }
}

window.clientApi = clientApi;

// ---- Client-side upload engine (runs the whole parser/validator in-browser) ----
function detectPeriod(fileName) {
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  const arMonths = { يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, أبريل: 4, مايو: 5, يونيو: 6, يوليو: 7, اغسطس: 8, أغسطس: 8, سبتمبر: 9, اكتوبر: 10, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
  const name = String(fileName || '').toLowerCase();
  let year = null, month = null, confident = false;
  let m = name.match(/(20\d{2})[-_ ]?(0[1-9]|1[0-2])/) || name.match(/(0[1-9]|1[0-2])[-_ ](20\d{2})/);
  if (m) { if (m[1].length === 4) { year = +m[1]; month = +m[2]; } else { month = +m[1]; year = +m[2]; } confident = true; }
  if (!confident) { const y = name.match(/20\d{2}/); if (y) year = +y[0]; for (const [k, v] of Object.entries(months)) if (name.includes(k)) { month = v; break; } for (const [k, v] of Object.entries(arMonths)) if (String(fileName).includes(k)) { month = v; break; } if (year && month) confident = true; }
  const now = new Date();
  if (!year) year = now.getFullYear(); if (!month) month = now.getMonth() + 1;
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const value = `${year}-${String(month).padStart(2, '0')}`;
  return { value, label: `${monthNames[month - 1]} ${year}`, year, month, confident, asOf: `${value}-01` };
}

function addSnapshot({ id, period, periodLabel, asOf, fileName }, records, dynamicFields, validation) {
  const k = computeKPIs(records, asOf);
  SNAPSHOTS[id] = { records, asOf, quality: validation.quality, meta: { id, period, periodLabel, asOf, fileName, uploadedAt: new Date().toISOString(), uploadedBy: 'admin', employeeCount: records.length, saudiPct: k.saudi_pct, payroll: k.total_payroll, qualityScore: validation.quality.score } };
  // replace an existing snapshot with the same period, else append
  const existing = META.snapshots.findIndex((s) => s.period === period);
  const metaEntry = SNAPSHOTS[id].meta;
  if (existing >= 0) { delete SNAPSHOTS[META.snapshots[existing].id]; META.snapshots[existing] = metaEntry; }
  else META.snapshots.push(metaEntry);
  META.activeSnapshotId = id;
  return metaEntry;
}

// Exposed so the standalone upload UI can parse/validate/commit fully in-browser.
window.HR = {
  proposeMapping, buildRecords, validate, computeKPIs, filterOptions,
  detectPeriod, addSnapshot,
  setActive(id) { if (SNAPSHOTS[id]) { META.activeSnapshotId = id; return true; } return false; },
  resetToSeed() { for (const k of Object.keys(SNAPSHOTS)) delete SNAPSHOTS[k]; Object.assign(SNAPSHOTS, SEED_SNAPSHOTS); META.snapshots = SEED_META.snapshots.slice(); META.activeSnapshotId = SEED_META.activeSnapshotId; },
  uuid() { return (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : 's' + Date.now() + Math.random().toString(16).slice(2); },
};
