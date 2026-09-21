// validation.js — AI Data Validation & Cleaning + HR Data Quality Score.
// Reports issues without mutating source data. Score is computed from real
// checks with a transparent breakdown of every lost point.

import { CORE_BY_KEY, FIELD_TYPES, DATE_KEYS } from './schema.js';
import { suggestNormalization, NORMALIZE_FIELDS } from './normalize.js';
import { docCategory } from './expiry.js';

export function validate(records, mapping) {
  const mappedKeys = new Set(mapping.filter((m) => !m.isDynamic).map((m) => m.mappedKey));
  const total = records.length;
  const issues = {
    duplicate_code: [], missing_code: [], missing_name: [], missing_section: [],
    missing_position: [], illogical_salary: [], invalid_date: [], missing_document: [],
  };

  // Duplicate / missing employee code
  const codeSeen = new Map();
  for (const r of records) {
    const code = r.employee_code == null ? '' : String(r.employee_code).trim();
    if (!code) { issues.missing_code.push(r._row); continue; }
    if (codeSeen.has(code)) issues.duplicate_code.push({ code, rows: [codeSeen.get(code), r._row] });
    else codeSeen.set(code, r._row);
  }

  for (const r of records) {
    if (mappedKeys.has('name') && !valOf(r.name)) issues.missing_name.push(r._row);
    if (mappedKeys.has('section') && !valOf(r.section)) issues.missing_section.push(r._row);
    if (mappedKeys.has('position') && !valOf(r.position)) issues.missing_position.push(r._row);
    if (mappedKeys.has('total_salary')) {
      const s = r.total_salary;
      if (s !== null && s !== undefined && (s < 0 || s > 500000)) issues.illogical_salary.push({ row: r._row, value: s });
    }
    // Invalid dates: raw present but could not be parsed
    for (const dk of DATE_KEYS) {
      if (!mappedKeys.has(dk)) continue;
      const col = mapping.find((m) => m.mappedKey === dk)?.column;
      const rawVal = col ? r.raw?.[col] : undefined;
      if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '' && r[dk] === null) {
        issues.invalid_date.push({ row: r._row, field: dk, raw: String(rawVal) });
      }
    }
  }

  // Genuinely-missing documents only (a Saudi's blank contract is an indefinite
  // term, blank iqama/passport do not apply to Saudis — none of these are gaps).
  const docFields = ['contract_expire_date', 'health_card_expire_date', 'residence_expire_date', 'passport_expire_date'];
  let missingDocCount = 0;
  for (const r of records) {
    for (const df of docFields) {
      if (mappedKeys.has(df) && docCategory(r, df, null) === 'missing') missingDocCount++;
    }
  }

  // Normalization suggestions per category field. Thresholds are field-specific:
  // stricter for positions/level (distinct titles must not be merged), looser for
  // nationalities/sections where spelling variance is common. Suggestions are only
  // ever proposed — never auto-applied.
  const FIELD_THRESHOLDS = { nationality: 0.82, section: 0.86, division: 0.86, position: 0.92, level_code: 0.95, gender: 0.9 };
  const normalization = {};
  for (const f of NORMALIZE_FIELDS) {
    if (!mappedKeys.has(f)) continue;
    const vals = records.map((r) => r.raw?.[mapping.find((m) => m.mappedKey === f)?.column]).filter(Boolean);
    const sug = suggestNormalization(vals.map(String), FIELD_THRESHOLDS[f] ?? 0.88);
    if (sug.suggestions.length) normalization[f] = sug;
  }

  // Valid record = has code, name (if mapped), section (if mapped), no illogical salary
  const badRows = new Set([
    ...issues.missing_code, ...issues.missing_name, ...issues.missing_section,
    ...issues.illogical_salary.map((x) => x.row),
    ...issues.invalid_date.map((x) => x.row),
    ...issues.duplicate_code.flatMap((x) => x.rows),
  ]);
  const validCount = records.filter((r) => !badRows.has(r._row)).length;

  const score = computeQualityScore({ records, mapping, mappedKeys, issues, normalization, missingDocCount, total });

  return {
    total, valid: validCount, invalid: total - validCount,
    issues: {
      duplicate_code: issues.duplicate_code,
      missing_code: issues.missing_code,
      missing_name: issues.missing_name,
      missing_section: issues.missing_section,
      missing_position: issues.missing_position,
      illogical_salary: issues.illogical_salary,
      invalid_date: issues.invalid_date,
    },
    counts: {
      duplicate_code: issues.duplicate_code.length,
      missing_code: issues.missing_code.length,
      missing_name: issues.missing_name.length,
      missing_section: issues.missing_section.length,
      missing_position: issues.missing_position.length,
      illogical_salary: issues.illogical_salary.length,
      invalid_date: issues.invalid_date.length,
      missing_document: missingDocCount,
    },
    normalization,
    quality: score,
  };
}

function valOf(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }

function computeQualityScore({ records, mappedKeys, issues, normalization, missingDocCount, total }) {
  if (total === 0) return { score: 0, breakdown: [], reasons: ['لا توجد سجلات.'] };
  const parts = [];
  const add = (label, weight, value, reason) => parts.push({ label, weight, value, reason });

  // Data Quality here measures the INTEGRITY of the data that is present — not
  // document coverage. A blank optional/not-applicable document (e.g. a Saudi's
  // indefinite contract, or iqama/passport that don't apply to Saudis) is not a
  // quality defect, so it does not reduce the score. Empty-document coverage and
  // spelling-normalisation suggestions are reported separately as guidance.

  // Completeness of core identity fields (code, name, section, position)
  const identityFields = ['employee_code', 'name', 'section', 'position'].filter((k) => mappedKeys.has(k));
  let filled = 0, cells = 0;
  for (const r of records) for (const k of identityFields) { cells++; if (valOf(r[k])) filled++; }
  const completeness = cells ? filled / cells : 1;
  add('اكتمال البيانات الأساسية', 35, completeness,
    completeness < 1 ? `${cells - filled} خانة أساسية ناقصة` : null);

  // Unique keys
  const dup = issues.duplicate_code.length;
  const uniq = 1 - Math.min(1, dup / total);
  add('تفرد الرقم الوظيفي', 25, uniq, dup ? `${dup} رقم وظيفي مكرر` : null);

  // Valid dates (a date value present in the file that cannot be parsed)
  const invDates = issues.invalid_date.length;
  const dateScore = 1 - Math.min(1, invDates / Math.max(1, total));
  add('صحة التواريخ', 20, dateScore, invDates ? `${invDates} تاريخ غير صالح` : null);

  // Logical salary values
  const badSal = issues.illogical_salary.length;
  const salScore = 1 - Math.min(1, badSal / Math.max(1, total));
  add('منطقية القيم', 20, salScore, badSal ? `${badSal} راتب غير منطقي` : null);

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const scorePct = parts.reduce((a, p) => a + p.weight * p.value, 0) / totalWeight * 100;
  const reasons = parts.filter((p) => p.reason).map((p) => `${p.reason} (−${Math.round(p.weight * (1 - p.value))}%)`);
  return {
    score: Math.round(scorePct * 10) / 10,
    breakdown: parts.map((p) => ({
      label: p.label, weight: p.weight,
      earned: Math.round(p.weight * p.value * 10) / 10,
      lost: Math.round(p.weight * (1 - p.value) * 10) / 10,
      reason: p.reason,
    })),
    reasons,
  };
}
