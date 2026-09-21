// jobmap.js — Job Title Mapping. Recognises different spellings/variants of the
// same job (e.g. "موظف استقبال", "استقبال", "Receptionist", "Front Desk Agent")
// and maps them to ONE standardized job title used for localization matching.
// The map is data (editable from the admin panel), never hard-coded logic.

export function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase()
    .replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْـ]/g, '').replace(/\s+/g, ' ');
}

// map: { normalizedVariant: standardizedTitle }. Returns the standardized title
// for a position, or the position itself when no mapping exists (never invents).
export function standardize(position, map) {
  if (!position) return position;
  const key = norm(position);
  if (map && map[key]) return map[key];
  return String(position).trim();
}

// Build the admin view: every distinct position in the data with its current
// standardized title and whether it is explicitly mapped.
export function mappingRows(positions, map) {
  const seen = new Set();
  const rows = [];
  for (const p of positions) {
    const key = norm(p);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ position: p, key, standardized: (map && map[key]) || '', mapped: !!(map && map[key]) });
  }
  return rows.sort((a, b) => a.position.localeCompare(b.position, 'ar'));
}

// Distinct standardized titles currently in the map (for suggestions/dropdowns).
export function standardTitles(map) {
  return [...new Set(Object.values(map || {}).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
}
