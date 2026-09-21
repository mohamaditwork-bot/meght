// normalize.js — detects near-duplicate categorical values and proposes a
// canonical (normalized) form. The RAW value is always preserved; normalization
// is a suggestion the user approves. Nothing in the source is silently changed.

import { similarity } from './util.js';
import { normHeader } from './schema.js';

// Fields where normalization is meaningful.
export const NORMALIZE_FIELDS = ['nationality', 'section', 'position', 'division', 'gender', 'level_code'];

// Build normalization suggestions for one field's value distribution.
// values: array of raw strings (may repeat). Returns { suggestions:[{from,to,count,similarity}], groups }.
export function suggestNormalization(rawValues, threshold = 0.82) {
  const counts = new Map();
  for (const v of rawValues) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const distinct = [...counts.keys()];
  // Greedy clustering: the most frequent spelling becomes the canonical anchor.
  const anchors = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  const canonicalOf = new Map();
  const clusters = [];
  for (const val of anchors) {
    if (canonicalOf.has(val)) continue;
    // start a new cluster anchored at val
    const cluster = { canonical: val, members: [val], count: counts.get(val) };
    canonicalOf.set(val, val);
    for (const other of anchors) {
      if (canonicalOf.has(other) || other === val) continue;
      const sim = similarity(val, other);
      if (sim >= threshold) {
        canonicalOf.set(other, val);
        cluster.members.push(other);
        cluster.count += counts.get(other);
      }
    }
    clusters.push(cluster);
  }
  const suggestions = [];
  for (const c of clusters) {
    for (const m of c.members) {
      if (m !== c.canonical) {
        suggestions.push({
          from: m, to: c.canonical, count: counts.get(m),
          similarity: Math.round(similarity(m, c.canonical) * 100) / 100,
        });
      }
    }
  }
  const map = {};
  for (const [k, v] of canonicalOf.entries()) map[k] = v;
  return { suggestions, map, distinct: distinct.length };
}

// Apply an approved normalization map (raw -> canonical) safely.
export function applyNormalization(raw, map) {
  if (raw === null || raw === undefined) return raw;
  const s = String(raw).trim();
  return (map && map[s]) || s;
}
