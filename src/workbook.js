// workbook.js — Excel reading (Node uses the xlsx package; the browser build
// passes the global SheetJS as `xlsxLib`). Kept separate from mapping.js so the
// column-matching logic can be bundled for the browser without pulling xlsx.
import XLSX from 'xlsx';

// Read a workbook buffer -> { headers, rows(objects keyed by header), sheetName }.
// Pass an alternative XLSX implementation (e.g. window.XLSX) as the 2nd arg.
export function readWorkbook(buffer, xlsxLib) {
  const X = xlsxLib || XLSX;
  const wb = X.read(buffer, { type: buffer instanceof ArrayBuffer ? 'array' : 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('لا يحتوي الملف على أي ورقة عمل صالحة.');
  // Header row detection: the row with the most non-empty string cells.
  const grid = X.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
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
