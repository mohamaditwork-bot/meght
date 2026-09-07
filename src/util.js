// util.js — parsing, similarity and smart formatting helpers.
// All internal math uses exact original values; formatting is presentation only.

import { normHeader } from './schema.js';

// ---- String similarity (Levenshtein ratio 0..1) --------------------------
export function levenshtein(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export function similarity(a, b) {
  const na = normHeader(a), nb = normHeader(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

// ---- Number parsing ------------------------------------------------------
export function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  // strip currency words, keep digits, dot, minus
  s = s.replace(/[^\d.,\-]/g, '');
  // handle thousands separators: if both , and . present, assume , thousands
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    s = s.replace(/,/g, '');
  } else if (s.indexOf(',') > -1 && s.indexOf('.') === -1) {
    // comma could be decimal or thousands; if single comma with <=2 trailing digits treat decimal
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = parts.join('.');
    else s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---- Date parsing (returns ISO yyyy-mm-dd or null) -----------------------
// Handles Excel serial numbers, JS Dates, and common textual formats.
export function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return toISO(v);
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial date (1900 date system). 25569 = days between 1899-12-30 and 1970-01-01.
    if (v > 59 && v < 60000) {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d)) return toISO(d);
    }
    return null;
  }
  let s = String(v).trim();
  if (!s || /^0+$/.test(s)) return null;
  // ISO
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return safeISO(+m[1], +m[2], +m[3]);
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m; d = +d; mo = +mo; y = +y;
    if (y < 100) y += y < 50 ? 2000 : 1900;
    // Disambiguate: if first > 12 it must be day; else assume dd/mm (common in region)
    if (d > 12 && mo <= 12) return safeISO(y, mo, d);
    if (mo > 12 && d <= 12) return safeISO(y, d, mo);
    return safeISO(y, mo, d);
  }
  const d2 = new Date(s);
  if (!isNaN(d2)) return toISO(d2);
  return null;
}

function safeISO(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dt)) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return toISO(dt);
}
function toISO(d) {
  const y = d.getUTCFullYear ? d.getUTCFullYear() : d.getFullYear();
  const mo = (d.getUTCMonth ? d.getUTCMonth() : d.getMonth()) + 1;
  const da = d.getUTCDate ? d.getUTCDate() : d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

export function daysUntil(iso, fromISO) {
  if (!iso) return null;
  const from = fromISO ? new Date(fromISO + 'T00:00:00Z') : new Date();
  const to = new Date(iso + 'T00:00:00Z');
  if (isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

// ---- Formatting (presentation only) --------------------------------------
export function fmtNumber(n, decimals = 0) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}
export function fmtMoney(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return fmtNumber(Math.round(Number(n))) + ' SAR';
}
export function fmtPct(n, decimals = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(decimals) + '%';
}
export function fmtDays(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(2) + ' Days';
}
