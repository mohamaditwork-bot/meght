// transform.js — apply an approved mapping + normalization maps to raw rows,
// producing typed employee records. Original raw values are kept alongside
// normalized/parsed values. No value is invented; unknowns stay null.

import { CORE_BY_KEY, FIELD_TYPES } from './schema.js';
import { parseNumber, parseDate } from './util.js';
import { applyNormalization } from './normalize.js';

// Saudi nationality detection (normalized comparison).
const SAUDI_TOKENS = ['سعودي', 'سعوديه', 'سعودية', 'السعودية', 'السعوديه', 'saudi', 'ksa', 'saudi arabia'];
export function isSaudiNationality(natRaw) {
  if (!natRaw) return false;
  const s = String(natRaw).trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').toLowerCase();
  return SAUDI_TOKENS.some((t) => s === t.replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').toLowerCase());
}

// mapping: array from proposeMapping (possibly user-edited). normalizationMaps:
// { field: { rawValue: canonical } }. Returns { records, dynamicFields }.
export function buildRecords(headers, rows, mapping, normalizationMaps = {}) {
  const colToKey = {};       // column name -> canonical key
  const keyToCol = {};       // canonical key -> column name
  const dynamicFields = [];  // {key, label, type}
  for (const m of mapping) {
    if (!m.mappedKey || m.status === 'ignore' || m.mappedKey === '__ignore__') continue;
    colToKey[m.column] = m.mappedKey;
    keyToCol[m.mappedKey] = m.column;
    if (m.isDynamic) dynamicFields.push({ key: m.mappedKey, label: m.label, type: m.dataType });
  }

  const records = rows.map((row, i) => {
    const raw = {};
    const rec = { _row: i + 1, dynamic: {}, normalized: {} };
    for (const [col, val] of Object.entries(row)) raw[col] = val;
    rec.raw = raw;

    for (const m of mapping) {
      if (!m.mappedKey || m.status === 'ignore' || m.mappedKey === '__ignore__') continue;
      const val = row[m.column];
      if (m.isDynamic) {
        rec.dynamic[m.mappedKey] = coerce(val, m.dataType);
        continue;
      }
      const field = CORE_BY_KEY[m.mappedKey];
      if (!field) { rec.dynamic[m.mappedKey] = val; continue; }
      let out;
      if (field.type === FIELD_TYPES.NUMBER) out = parseNumber(val);
      else if (field.type === FIELD_TYPES.DATE) out = parseDate(val);
      else out = val === null || val === undefined ? null : String(val).trim() || null;

      // Apply approved normalization for string category fields.
      if ((field.type === FIELD_TYPES.STRING || field.type === FIELD_TYPES.KEY)
          && normalizationMaps[m.mappedKey] && out) {
        const canon = applyNormalization(out, normalizationMaps[m.mappedKey]);
        if (canon !== out) rec.normalized[m.mappedKey] = { raw: out, value: canon };
        out = canon;
      }
      rec[m.mappedKey] = out;
    }
    // Derived
    rec.is_saudi = isSaudiNationality(rec.nationality);
    return rec;
  });

  return { records: dedupeByCode(records), dynamicFields };
}

// Update-not-duplicate: when the same employee_code appears more than once
// (e.g. a corrected row later in the same file, or a re-listed employee),
// keep the LAST occurrence so the newest values win. Rows with no code are
// left untouched (cannot be safely de-duplicated).
export function dedupeByCode(records) {
  const seen = new Map();
  const noCode = [];
  for (const r of records) {
    const code = r.employee_code == null ? '' : String(r.employee_code).trim();
    if (!code) { noCode.push(r); continue; }
    seen.set(code, r); // later wins
  }
  return [...seen.values(), ...noCode];
}

function coerce(val, type) {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  if (type === FIELD_TYPES.NUMBER) return parseNumber(val);
  if (type === FIELD_TYPES.DATE) return parseDate(val);
  return String(val).trim();
}
