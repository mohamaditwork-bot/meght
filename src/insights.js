// insights.js — data-grounded HR insights. Every insight is built from actual
// computed numbers, never generic advice. No statement is emitted without figures.

import { computeKPIs, groupBy } from './analytics.js';
import { daysUntil, fmtPct, fmtNumber, fmtDays, fmtMoney } from './util.js';

export function generateInsights(records, opts = {}) {
  const asOf = opts.asOfISO;
  const kpis = computeKPIs(records, asOf);
  const insights = [];
  const push = (severity, category, title, detail, metric) => insights.push({ severity, category, title, detail, metric });

  // 1) Saudization concentration risk — departments with lowest Saudi ratio
  const bySection = groupBy(records, 'section', asOf).filter((g) => g.total >= 3);
  const lowSaudi = bySection.filter((g) => g.saudi_pct < 20).sort((a, b) => a.saudi_pct - b.saudi_pct).slice(0, 3);
  for (const g of lowSaudi) {
    push('high', 'saudization',
      `انخفاض السعودة في قسم "${g.key}"`,
      `يضم القسم ${fmtNumber(g.total)} موظفاً منهم ${fmtNumber(g.saudi)} سعودي فقط، أي نسبة سعودة داخلية ${fmtPct(g.saudi_pct)}.`,
      g.saudi_pct);
  }

  // 2) Nationality concentration inside a department
  for (const g of bySection) {
    const recs = records.filter((r) => (r.section || '— غير محدد —') === g.key);
    const nat = countBy(recs, 'nationality');
    const top = nat[0];
    if (top && g.total >= 5 && top.count / g.total >= 0.6 && top.key !== '— غير محدد —') {
      push('medium', 'nationality',
        `تركّز جنسية داخل قسم "${g.key}"`,
        `${fmtNumber(top.count)} من أصل ${fmtNumber(g.total)} موظفاً (${fmtPct(top.count / g.total * 100)}) من جنسية "${top.key}".`,
        top.count / g.total * 100);
    }
  }

  // 3) High leave balances
  const highLeave = records.map((r) => ({ r, b: num(r.end_annual_balance) })).filter((x) => x.b !== null && x.b >= 45)
    .sort((a, b) => b.b - a.b).slice(0, 3);
  for (const x of highLeave) {
    push('medium', 'leave',
      `رصيد إجازة مرتفع — ${x.r.arabic_name || x.r.name || x.r.employee_code}`,
      `رصيد الإجازة السنوية ${fmtDays(x.b)} (${x.r.section || '—'}).`, x.b);
  }

  // 4) Expired & expiring documents
  const docFields = [['contract_expire_date', 'العقد'], ['residence_expire_date', 'الإقامة'], ['health_card_expire_date', 'البطاقة الصحية'], ['passport_expire_date', 'الجواز']];
  for (const [f, label] of docFields) {
    let expired = 0, soon = 0;
    for (const r of records) { const d = daysUntil(r[f], asOf); if (d === null) continue; if (d < 0) expired++; else if (d <= 30) soon++; }
    if (expired > 0) push('critical', 'compliance', `${label}: وثائق منتهية`, `${fmtNumber(expired)} موظف لديه ${label} منتهية الصلاحية.`, expired);
    if (soon > 0) push('high', 'compliance', `${label}: تنتهي خلال 30 يوم`, `${fmtNumber(soon)} موظف ستنتهي ${label} لديه خلال 30 يوماً.`, soon);
  }

  // 5) Missing critical data
  const missCode = records.filter((r) => !valOf(r.employee_code)).length;
  const missSection = records.filter((r) => !valOf(r.section)).length;
  if (missCode) push('high', 'data_quality', 'أرقام وظيفية ناقصة', `${fmtNumber(missCode)} سجل بدون رقم وظيفي.`, missCode);
  if (missSection) push('medium', 'data_quality', 'أقسام ناقصة', `${fmtNumber(missSection)} موظف بدون قسم محدد.`, missSection);

  // 6) Salary anomaly across similar levels
  const byLevel = groupBy(records, 'level_code', asOf).filter((g) => g.avg_salary);
  for (let i = 0; i < byLevel.length; i++) for (let j = i + 1; j < byLevel.length; j++) {
    const a = byLevel[i], b = byLevel[j];
    if (a.avg_salary && b.avg_salary) {
      const hi = Math.max(a.avg_salary, b.avg_salary), lo = Math.min(a.avg_salary, b.avg_salary);
      if (lo > 0 && (hi - lo) / lo > 1.5 && Math.abs(levelNum(a.key) - levelNum(b.key)) <= 1) {
        push('low', 'salary', `تفاوت رواتب بين درجتين متقاربتين`,
          `متوسط الراتب في الدرجة "${a.key}" هو ${fmtMoney(a.avg_salary)} مقابل "${b.key}" ${fmtMoney(b.avg_salary)}.`, null);
      }
    }
  }

  // 7) Movement-driven insights
  if (opts.movementSummary) {
    const m = opts.movementSummary;
    if (m.net_change !== 0) push(Math.abs(m.net_change) >= 5 ? 'high' : 'low', 'movement',
      `تغير في عدد الموظفين ${m.net_change > 0 ? '▲' : '▼'} ${fmtNumber(Math.abs(m.net_change))}`,
      `الافتتاحي ${fmtNumber(m.opening_headcount)} + تعيينات ${fmtNumber(m.new_hires)} − مغادرون ${fmtNumber(m.missing_employees)} = ${fmtNumber(m.closing_headcount)}.`, m.net_change);
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);
  return insights;
}

export function executiveSummary(records, opts = {}) {
  const asOf = opts.asOfISO;
  const k = computeKPIs(records, asOf);
  const bySection = groupBy(records, 'section', asOf).filter((g) => g.total >= 3);
  const topRisk = bySection.slice().sort((a, b) => a.saudi_pct - b.saudi_pct)[0];
  const natCount = countBy(records, 'nationality');
  const topNonSaudiNat = natCount.find((n) => n.key !== '— غير محدد —' && !isSaudiName(n.key));
  const highLeave = records.filter((r) => num(r.end_annual_balance) !== null && num(r.end_annual_balance) >= 45).length;
  let expired = 0, expiring = 0;
  for (const r of records) for (const f of ['contract_expire_date', 'residence_expire_date', 'health_card_expire_date', 'passport_expire_date']) {
    const d = daysUntil(r[f], asOf); if (d === null) continue; if (d < 0) expired++; else if (d <= 90) expiring++;
  }
  const sections = [];
  sections.push({ key: 'workforce', title: 'نظرة عامة على القوى العاملة',
    text: `إجمالي ${fmtNumber(k.total_employees)} موظف موزعين على ${fmtNumber(k.departments)} قسم و${fmtNumber(k.positions)} مسمى وظيفي، من ${fmtNumber(k.nationalities)} جنسية.` });
  sections.push({ key: 'saudization', title: 'حالة السعودة',
    text: `نسبة السعودة الداخلية ${fmtPct(k.saudi_pct)} (${fmtNumber(k.saudi_employees)} سعودي من ${fmtNumber(k.total_employees)}). هذه النسبة محسوبة رياضياً من الملف وليست هدفاً رسمياً.` });
  if (topRisk) sections.push({ key: 'risk', title: 'أعلى مخاطرة في الموارد البشرية',
    text: `قسم "${topRisk.key}" هو الأدنى سعودة بنسبة ${fmtPct(topRisk.saudi_pct)} (${fmtNumber(topRisk.saudi)} من ${fmtNumber(topRisk.total)}).` });
  if (highLeave) sections.push({ key: 'leave', title: 'مخاطر أرصدة الإجازات',
    text: `${fmtNumber(highLeave)} موظف لديه رصيد إجازة سنوية ≥ 45 يوماً، بمتوسط عام ${fmtDays(k.annual_balance_avg)}.` });
  sections.push({ key: 'expiry', title: 'مخاطر انتهاء الوثائق',
    text: `${fmtNumber(expired)} وثيقة منتهية و${fmtNumber(expiring)} وثيقة ستنتهي خلال 90 يوماً.` });
  if (opts.movementSummary) { const m = opts.movementSummary;
    sections.push({ key: 'movement', title: 'الحركات الوظيفية الأخيرة',
      text: `${fmtNumber(m.new_hires)} تعيين جديد، ${fmtNumber(m.missing_employees)} موظف مفقود من الملف، ${fmtNumber(m.promotions)} ترقية مرجّحة، صافي التغير ${fmtNumber(m.net_change)}.` }); }
  if (opts.quality) sections.push({ key: 'quality', title: 'جودة البيانات',
    text: `مؤشر جودة البيانات ${fmtPct(opts.quality.score, 1)}. ${opts.quality.reasons?.slice(0, 3).join('، ') || 'لا توجد ملاحظات جوهرية.'}` });
  // Recommended actions — all tied to numbers above
  const actions = [];
  if (topRisk && topRisk.saudi_pct < 20) actions.push(`مراجعة خطة التوطين في قسم "${topRisk.key}" (${fmtPct(topRisk.saudi_pct)}).`);
  if (expired) actions.push(`معالجة ${fmtNumber(expired)} وثيقة منتهية بشكل عاجل.`);
  if (highLeave) actions.push(`جدولة إجازات لـ ${fmtNumber(highLeave)} موظف بأرصدة مرتفعة.`);
  if (topNonSaudiNat && topNonSaudiNat.count / k.total_employees > 0.3) actions.push(`تنويع مصادر التوظيف؛ ${fmtPct(topNonSaudiNat.count / k.total_employees * 100)} من القوى العاملة من جنسية "${topNonSaudiNat.key}".`);
  sections.push({ key: 'actions', title: 'إجراءات موصى بها', items: actions.length ? actions : ['لا توجد إجراءات حرجة بناءً على البيانات الحالية.'] });
  return sections;
}

function countBy(records, key) {
  const c = new Map();
  for (const r of records) { const v = (r[key] == null || String(r[key]).trim() === '') ? '— غير محدد —' : String(r[key]).trim(); c.set(v, (c.get(v) || 0) + 1); }
  return [...c.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function valOf(v) { return v !== null && v !== undefined && String(v).trim() !== ''; }
function levelNum(v) { const m = String(v || '').match(/\d+/); return m ? Number(m[0]) : 0; }
function isSaudiName(s) { return /سعودي|السعودية|saudi/i.test(s || ''); }
