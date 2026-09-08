// localization.js — Saudization & Localization intelligence.
// STRICT SEPARATION of two very different concepts:
//   1) Internal Saudi Workforce Ratio  = computed from Excel (Saudi / Total * 100).
//   2) Official Localization Requirement = an official MHRSD/government target.
//      This is NEVER invented or guessed. It only comes from a verified rule in
//      the Localization Rules Center (with source + verification metadata). If no
//      verified rule applies, the system says so explicitly.

// Internal ratio across a dimension (section/position/level/division).
export function internalRatios(records, key) {
  const groups = new Map();
  for (const r of records) {
    const k = valOrNA(r[key]);
    if (!groups.has(k)) groups.set(k, { total: 0, saudi: 0 });
    const g = groups.get(k); g.total++; if (r.is_saudi) g.saudi++;
  }
  const out = [];
  for (const [k, g] of groups) {
    out.push({ key: k, total: g.total, saudi: g.saudi, non_saudi: g.total - g.saudi,
      saudi_pct: g.total ? (g.saudi / g.total) * 100 : 0 });
  }
  out.sort((a, b) => b.total - a.total);
  return out;
}

export function overallInternalRatio(records) {
  const total = records.length;
  const saudi = records.filter((r) => r.is_saudi).length;
  return { total, saudi, non_saudi: total - saudi, saudi_pct: total ? (saudi / total) * 100 : 0 };
}

// Gap analysis for a group against an OFFICIAL required percentage.
// requiredPct MUST come from a verified rule; callers pass null when unknown.
export function gapAnalysis(group, requiredPct) {
  const { total, saudi } = group;
  const currentPct = total ? (saudi / total) * 100 : 0;
  if (requiredPct === null || requiredPct === undefined) {
    return {
      ...group, current_pct: currentPct, required_pct: null, gap_pct: null,
      required_additional_saudi: null,
      compliance: 'unknown',
      compliance_label: 'لا يمكن تحديد هدف التوطين الرسمي بثقة كافية',
      note: 'Official localization target could not be determined with sufficient confidence.',
    };
  }
  // Additional Saudis needed so that saudi'/total' >= required (hiring Saudis
  // increases both numerator and denominator): need x where (saudi+x)/(total+x) >= p
  //   => x >= (p*total - saudi) / (1 - p)   (p in 0..1)
  const p = requiredPct / 100;
  let need = 0;
  if (currentPct < requiredPct && p < 1) need = Math.ceil((p * total - saudi) / (1 - p));
  if (need < 0) need = 0;
  const gap = requiredPct - currentPct;
  let compliance, label;
  if (currentPct >= requiredPct) { compliance = 'compliant'; label = 'مطابق'; }
  else if (gap <= 5) { compliance = 'near'; label = 'قريب من الهدف'; }
  else if (gap <= 15) { compliance = 'below'; label = 'أقل من الهدف'; }
  else { compliance = 'critical'; label = 'فجوة حرجة'; }
  return {
    ...group, current_pct: currentPct, required_pct: requiredPct, gap_pct: gap,
    required_additional_saudi: need, compliance, compliance_label: label,
  };
}

function valOrNA(v) { return (v === null || v === undefined || String(v).trim() === '') ? '— غير محدد —' : String(v).trim(); }

// Default (EMPTY) rules payload. The platform ships with NO invented targets.
// Rules are added by an Admin with a documented official source and are stored
// in the Localization Rules Center. Each rule carries verification metadata.
export function newRuleTemplate() {
  return {
    id: null,
    name: '',                 // اسم القرار
    occupations: [],          // المهن المشمولة (canonical position names)
    activity: '',             // النشاط الاقتصادي
    required_pct: null,       // النسبة الرسمية
    issue_date: null,         // تاريخ إصدار القرار
    effective_date: null,     // تاريخ بداية التطبيق
    conditions: '',           // شروط التطبيق
    min_workers: null,        // عدد العاملين الذين يشملهم القرار
    min_wage: null,           // الحد الأدنى للأجور إن وجد
    region: '',               // منطقة التطبيق إن كان مناطقياً
    exceptions: '',           // الاستثناءات
    source: '',               // المصدر (اسم الجهة)
    source_url: '',           // رابط المصدر الرسمي
    last_verified: null,      // تاريخ آخر تحقق
    status: 'upcoming',       // Active | Upcoming | Expired
    system_updated: new Date().toISOString(),
  };
}

// Match a rule to a group of employees by occupation/position (canonical).
export function ruleForPosition(rules, positionName) {
  if (!positionName) return null;
  const pn = norm(positionName);
  const active = (rules || []).filter((r) => r.status === 'active' && r.required_pct != null);
  // Match a classified occupation to the position: exact, or one contains the
  // other (handles minor title variants like "حارس أمن" vs "حارس الأمن").
  return active.find((r) => (r.occupations || []).some((o) => {
    const on = norm(o);
    return on && (on === pn || pn.includes(on) || on.includes(pn));
  })) || null;
}
function norm(s) { return String(s == null ? '' : s).trim().replace(/[إأآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' '); }
