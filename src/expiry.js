// expiry.js — Expiry & Compliance Center. A blank date is classified as
// "Missing / Not Available", never as "Valid".

import { daysUntil } from './util.js';
import { EXPIRY_FIELDS } from './schema.js';

export const BUCKETS = [
  { key: 'expired', label: 'منتهية', labelEn: 'Expired' },
  { key: 'd0_30', label: '0–30 يوم', labelEn: '0–30 Days' },
  { key: 'd31_60', label: '31–60 يوم', labelEn: '31–60 Days' },
  { key: 'd61_90', label: '61–90 يوم', labelEn: '61–90 Days' },
  { key: 'd91_180', label: '91–180 يوم', labelEn: '91–180 Days' },
  { key: 'valid', label: 'سارية >180 يوم', labelEn: 'Valid >180 Days' },
  { key: 'missing', label: 'غير متوفرة', labelEn: 'Missing / Not Available' },
];

export function bucketOf(days) {
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  if (days <= 30) return 'd0_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  if (days <= 180) return 'd91_180';
  return 'valid';
}

export function statusOf(days) {
  if (days === null) return { key: 'missing', label: 'غير متوفر', tone: 'muted' };
  if (days < 0) return { key: 'expired', label: 'منتهية', tone: 'danger' };
  if (days <= 30) return { key: 'soon', label: 'تنتهي قريباً', tone: 'warn' };
  if (days <= 90) return { key: 'watch', label: 'قيد المتابعة', tone: 'watch' };
  return { key: 'valid', label: 'سارية', tone: 'ok' };
}

export function complianceMatrix(records, asOfISO) {
  const matrix = {};
  for (const f of EXPIRY_FIELDS) {
    const counts = Object.fromEntries(BUCKETS.map((b) => [b.key, 0]));
    for (const r of records) {
      counts[bucketOf(daysUntil(r[f.key], asOfISO))]++;
    }
    matrix[f.key] = { label: f.label, labelEn: f.labelEn, counts };
  }
  return matrix;
}

export function priorityOf(days) {
  if (days === null) return null;
  if (days < 0) return { level: 'critical', label: 'منتهية', order: 0 };
  if (days <= 7) return { level: 'critical', label: '≤ 7 أيام', order: 1 };
  if (days <= 15) return { level: 'high', label: '≤ 15 يوم', order: 2 };
  if (days <= 30) return { level: 'high', label: '≤ 30 يوم', order: 3 };
  if (days <= 60) return { level: 'medium', label: '≤ 60 يوم', order: 4 };
  if (days <= 90) return { level: 'low', label: '≤ 90 يوم', order: 5 };
  return null;
}

// Build the alerts list (documents within 90 days or expired), sorted by urgency.
export function buildAlerts(records, asOfISO) {
  const alerts = [];
  for (const r of records) {
    for (const f of EXPIRY_FIELDS) {
      const days = daysUntil(r[f.key], asOfISO);
      const pr = priorityOf(days);
      if (!pr) continue;
      alerts.push({
        employee_code: r.employee_code, name: r.name, arabic_name: r.arabic_name,
        section: r.section, division: r.division,
        document: f.labelEn, document_ar: f.label, field: f.key,
        expiry_date: r[f.key], days_left: days,
        priority: pr.level, priority_label: pr.label, order: pr.order,
      });
    }
  }
  alerts.sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0));
  return alerts;
}

// Missing-document report — blanks explicitly surfaced (not assumed valid).
export function missingDocuments(records) {
  const fields = ['contract_expire_date', 'health_card_expire_date', 'residence_expire_date', 'passport_expire_date'];
  const out = { by_field: {}, employees: [] };
  for (const f of fields) out.by_field[f] = 0;
  for (const r of records) {
    const missing = fields.filter((f) => r[f] === null);
    if (missing.length) {
      out.employees.push({ employee_code: r.employee_code, name: r.name, arabic_name: r.arabic_name, section: r.section, missing });
      for (const f of missing) out.by_field[f]++;
    }
  }
  return out;
}
