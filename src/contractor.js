// contractor.js — Contractor (labor-supply company) classification & compliance.
// An employee with a `contractor` value belongs to an external contracted
// company; an empty value means a DIRECT/permanent employee ("لا ينطبق – N/A").
// Builds a professional compliance dashboard: per-company Iqama/Health validity,
// overall compliance %, violations (expired/missing required docs) and a ranking.

import { docCategory, isFoodHandler } from './expiry.js';
import { daysUntil } from './util.js';

export const DIRECT_LABEL = 'لا ينطبق – N/A';
const NEAR_DAYS = 60; // "قريب من الانتهاء" threshold

// Reduce the detailed expiry category to a clear 4-state for dashboards.
//   valid | near | expired | missing | na
export function docState(emp, field, asOfISO) {
  const cat = docCategory(emp, field, asOfISO);
  if (cat === 'not_applicable') return 'na';
  if (cat === 'indefinite' || cat === 'valid' || cat === 'd91_180' || cat === 'd61_90') return 'valid';
  if (cat === 'd0_30' || cat === 'd31_60') {
    // refine by the real threshold
    const d = daysUntil(emp[field], asOfISO);
    return (d !== null && d <= NEAR_DAYS) ? 'near' : 'valid';
  }
  if (cat === 'expired') return 'expired';
  return 'missing';
}

const emptyBucket = () => ({ valid: 0, near: 0, expired: 0, missing: 0, na: 0, applicable: 0 });
function add(bucket, state) {
  bucket[state] = (bucket[state] || 0) + 1;
  if (state !== 'na') bucket.applicable += 1;
}
function pct(part, whole) { return whole ? (part / whole) * 100 : null; }

// Compliance for one group of records = valid documents / applicable required
// documents (iqama for non-Saudis + health card for food roles). A document
// counts as compliant when it is valid or near (not yet expired); expired or
// missing count as violations.
function groupStats(recs, asOfISO) {
  const iqama = emptyBucket();
  const health = emptyBucket();
  let requiredDocs = 0, validDocs = 0, violations = 0, nearCount = 0;
  for (const r of recs) {
    const iq = docState(r, 'residence_expire_date', asOfISO);
    add(iqama, iq);
    if (iq !== 'na') {
      requiredDocs++;
      if (iq === 'valid' || iq === 'near') validDocs++; else violations++;
      if (iq === 'near') nearCount++;
    }
    const hc = docState(r, 'health_card_expire_date', asOfISO);
    add(health, hc);
    if (hc !== 'na') {
      requiredDocs++;
      if (hc === 'valid' || hc === 'near') validDocs++; else violations++;
      if (hc === 'near') nearCount++;
    }
  }
  return {
    total: recs.length, iqama, health,
    required_docs: requiredDocs, valid_docs: validDocs, violations, near_count: nearCount,
    iqama_valid_pct: pct(iqama.valid + iqama.near, iqama.applicable),
    iqama_expired_pct: pct(iqama.expired + iqama.missing, iqama.applicable),
    health_valid_pct: pct(health.valid + health.near, health.applicable),
    health_expired_pct: pct(health.expired + health.missing, health.applicable),
    compliance_pct: requiredDocs ? (validDocs / requiredDocs) * 100 : null,
  };
}

export function buildContractorReport(records, asOfISO) {
  const contractorRecs = records.filter((r) => r.is_contractor);
  const directRecs = records.filter((r) => !r.is_contractor);

  // Group contractor employees by company.
  const byCompany = new Map();
  for (const r of contractorRecs) {
    const k = String(r.contractor).trim();
    if (!byCompany.has(k)) byCompany.set(k, []);
    byCompany.get(k).push(r);
  }
  let companies = [...byCompany.entries()].map(([name, recs]) => ({ company: name, ...groupStats(recs, asOfISO) }));
  // Rank: highest compliance first; companies with no required docs go last.
  companies.sort((a, b) => (b.compliance_pct ?? -1) - (a.compliance_pct ?? -1) || b.total - a.total);
  companies.forEach((c, i) => { c.rank = i + 1; });

  const overall = groupStats(contractorRecs, asOfISO);
  const ranked = companies.filter((c) => c.compliance_pct != null);
  const top = ranked[0] || null;
  const least = ranked.length ? ranked[ranked.length - 1] : null;

  return {
    as_of: asOfISO,
    total_employees: records.length,
    contractor_employees: contractorRecs.length,
    direct_employees: directRecs.length,
    company_count: companies.length,
    companies,
    overall,
    kpis: {
      iqama_valid_pct: overall.iqama_valid_pct,
      health_valid_pct: overall.health_valid_pct,
      compliance_pct: overall.compliance_pct,
      expired_iqamas: overall.iqama.expired + overall.iqama.missing,
      expired_health: overall.health.expired + overall.health.missing,
      near_docs: overall.near_count,
      top_company: top ? { company: top.company, pct: top.compliance_pct } : null,
      least_company: least ? { company: least.company, pct: least.compliance_pct } : null,
      contractor_employees: contractorRecs.length,
      direct_employees: directRecs.length,
    },
  };
}

// Status distribution for a single document field across records (for the
// redesigned Iqama / Health reports), split by contractor company too.
export function docStatusReport(records, field, asOfISO) {
  const overall = emptyBucket();
  const byCompany = new Map();
  for (const r of records) {
    const st = docState(r, field, asOfISO);
    add(overall, st);
    const key = r.is_contractor ? String(r.contractor).trim() : DIRECT_LABEL;
    if (!byCompany.has(key)) byCompany.set(key, emptyBucket());
    add(byCompany.get(key), st);
  }
  const companies = [...byCompany.entries()].map(([company, b]) => ({
    company,
    ...b,
    valid_pct: pct(b.valid + b.near, b.applicable),
    expired_pct: pct(b.expired + b.missing, b.applicable),
  }));
  // rank by most expired+missing (highest risk first)
  companies.sort((a, b) => (b.expired + b.missing) - (a.expired + a.missing));
  return {
    field, total: records.length, overall,
    valid_pct: pct(overall.valid + overall.near, overall.applicable),
    near_pct: pct(overall.near, overall.applicable),
    expired_pct: pct(overall.expired + overall.missing, overall.applicable),
    companies,
  };
}
