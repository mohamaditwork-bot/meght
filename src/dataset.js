// dataset.js — resolve the active (or requested) snapshot and apply the shared
// global filters used across every dashboard.

import { getActiveSnapshot, loadSnapshot, getMeta } from './store.js';

export function resolveSnapshot(periodId) {
  if (periodId) {
    const meta = getMeta();
    const m = meta.snapshots.find((s) => s.id === periodId);
    if (m) return { meta: m, data: loadSnapshot(periodId) };
  }
  return getActiveSnapshot();
}

export function applyFilters(records, q = {}) {
  let out = records;
  const eq = (key, val) => { if (val) out = out.filter((r) => String(r[key] ?? '').trim() === String(val).trim()); };
  eq('division', q.division);
  eq('section', q.department || q.section);
  eq('position', q.position);
  eq('nationality', q.nationality);
  eq('level_code', q.level);
  if (q.gender) {
    const g = String(q.gender).toLowerCase();
    out = out.filter((r) => {
      const s = String(r.gender ?? '').trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
      if (['male', 'ذكر', 'ذكور', 'm'].includes(g)) return ['ذكر', 'male', 'm', 'ذكور'].includes(s);
      if (['female', 'انثى', 'اناث', 'f'].includes(g)) return ['انثي', 'انثى', 'female', 'f', 'اناث'].includes(s);
      return true;
    });
  }
  if (q.saudi === 'saudi' || q.saudi === 'yes') out = out.filter((r) => r.is_saudi);
  if (q.saudi === 'non_saudi' || q.saudi === 'no') out = out.filter((r) => !r.is_saudi);
  if (q.employee) {
    const t = String(q.employee).trim().toLowerCase();
    out = out.filter((r) =>
      String(r.employee_code ?? '').toLowerCase().includes(t) ||
      String(r.name ?? '').toLowerCase().includes(t) ||
      String(r.arabic_name ?? '').includes(q.employee.trim()));
  }
  return out;
}

// Distinct filter option lists for the UI.
export function filterOptions(records) {
  const set = (key) => [...new Set(records.map((r) => (r[key] == null ? '' : String(r[key]).trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  return {
    division: set('division'), department: set('section'), position: set('position'),
    nationality: set('nationality'), level: set('level_code'),
    gender: set('gender'),
  };
}
