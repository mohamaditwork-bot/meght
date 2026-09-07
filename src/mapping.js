// mapping.js — AI-style column mapping engine.
// Matches columns by NAME + DATA TYPE, never by position. Unconfirmed matches
// are surfaced (never auto-applied). Unknown columns become dynamic fields.

import XLSX from 'xlsx';
import { CORE_FIELDS, FIELD_TYPES, normHeader } from './schema.js';
import { similarity, parseNumber, parseDate } from './util.js';

const CONFIDENCE = { CONFIRMED: 0.99, HIGH: 0.86, REVIEW: 0.62 };

// Read a workbook buffer -> { headers, rows(objects keyed by header), sheetName }
export function readWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('لا يحتوي الملف على أي ورقة عمل صالحة.');
  // Header row detection: find the row with the most non-empty string cells
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  let headerRow = 0, best = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = grid[i] || [];
    const score = cells.filter((c) => typeof c === 'string' && c.trim().length > 0).length;
    if (score > best) { best = score; headerRow = i; }
  }
  const headers = (grid[headerRow] || []).map((h, i) =>
    (h === null || h === undefined || String(h).trim() === '') ? `Column ${i + 1}` : String(h).trim());
  const rows = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const arr = grid[r] || [];
    if (arr.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = arr[i] === undefined ? null : arr[i]; });
    rows.push(obj);
  }
  return { headers, rows, sheetName };
}

// Infer the dominant data type of a column from sample values.
export function inferType(values) {
  const sample = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 200);
  if (sample.length === 0) return { type: FIELD_TYPES.STRING, confidence: 0 };
  let num = 0, date = 0;
  for (const v of sample) {
    const d = parseDate(v);
    const n = parseNumber(v);
    // Count as a date only when it looks like one (Date object, contains a
    // separator, or an Excel serial in the plausible date range) — this avoids
    // misreading plain integer IDs as dates.
    if (d !== null && (v instanceof Date || /[-/.]/.test(String(v)) || (typeof v === 'number' && v > 30000 && v < 60000))) date++;
    else if (n !== null) num++;
  }
  const total = sample.length;
  if (date / total > 0.6) return { type: FIELD_TYPES.DATE, confidence: date / total };
  if (num / total > 0.75) return { type: FIELD_TYPES.NUMBER, confidence: num / total };
  return { type: FIELD_TYPES.STRING, confidence: 1 };
}

// Build a proposed mapping. Returns array of { column, index, mappedKey, label,
// confidence, status, dataType, isDynamic, candidates[] }.
export function proposeMapping(headers, rows) {
  const columnValues = headers.map((h) => rows.map((r) => r[h]));
  const usedKeys = new Set();
  const result = [];

  // First pass: score every (column, coreField) pair.
  const scored = [];
  headers.forEach((h, idx) => {
    CORE_FIELDS.forEach((f) => {
      let s = 0;
      for (const alias of f.aliases) {
        s = Math.max(s, similarity(h, alias));
        if (s === 1) break;
      }
      // exact normalized alias match => confirmed
      const exact = f.aliases.some((a) => normHeader(a) === normHeader(h));
      scored.push({ idx, h, key: f.key, field: f, score: exact ? 1 : s });
    });
  });
  scored.sort((a, b) => b.score - a.score);

  const columnAssigned = new Set();
  const assignment = {}; // idx -> chosen
  for (const cand of scored) {
    if (columnAssigned.has(cand.idx) || usedKeys.has(cand.key)) continue;
    if (cand.score < CONFIDENCE.REVIEW) continue;
    assignment[cand.idx] = cand;
    columnAssigned.add(cand.idx);
    usedKeys.add(cand.key);
  }

  headers.forEach((h, idx) => {
    const inferred = inferType(columnValues[idx]);
    const chosen = assignment[idx];
    if (chosen) {
      let status, confidence = chosen.score;
      // Type agreement boosts/penalizes confidence.
      const typeOk = chosen.field.type === FIELD_TYPES.KEY || chosen.field.type === FIELD_TYPES.STRING
        || inferred.type === chosen.field.type;
      if (chosen.score >= 1) status = 'confirmed';
      else if (chosen.score >= CONFIDENCE.HIGH && typeOk) status = 'high';
      else status = 'review';
      // candidate alternatives for the review UI
      const candidates = scored
        .filter((c) => c.idx === idx && c.score >= CONFIDENCE.REVIEW)
        .slice(0, 4)
        .map((c) => ({ key: c.key, label: c.field.label, score: round2(c.score) }));
      result.push({
        column: h, index: idx, mappedKey: chosen.key, label: chosen.field.label,
        labelAr: chosen.field.labelAr, confidence: round2(confidence), status,
        dataType: chosen.field.type, inferredType: inferred.type, isDynamic: false,
        candidates,
      });
    } else {
      // Dynamic field — unknown column preserved for future-proof schema.
      result.push({
        column: h, index: idx, mappedKey: dynamicKey(h), label: h, labelAr: h,
        confidence: 0, status: 'dynamic', dataType: inferred.type,
        inferredType: inferred.type, isDynamic: true, candidates: [],
      });
    }
  });
  return result;
}

export function dynamicKey(header) {
  const base = normHeader(header).replace(/[^\da-z؀-ۿ]+/g, '_').replace(/^_+|_+$/g, '');
  return 'dyn_' + (base || 'field');
}

function round2(n) { return Math.round(n * 100) / 100; }
