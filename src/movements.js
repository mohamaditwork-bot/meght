// movements.js — historical comparison across monthly snapshots keyed by
// Employee Code. Detects new hires, missing employees (NOT auto-resigned),
// promotions and other movements. Classification is a suggestion HR can override.

function indexByCode(records) {
  const m = new Map();
  for (const r of records) {
    const code = r.employee_code == null ? '' : String(r.employee_code).trim();
    if (code) m.set(code, r);
  }
  return m;
}

function levelNumber(v) {
  if (v === null || v === undefined) return null;
  const m = String(v).match(/\d+/);
  return m ? Number(m[0]) : null;
}

// Compare previous -> current. Returns movements, new hires, missing employees.
export function compareSnapshots(prevRecords, currRecords, movementDateISO) {
  const prev = indexByCode(prevRecords);
  const curr = indexByCode(currRecords);
  const newHires = [], missing = [], movements = [];

  for (const [code, r] of curr) {
    if (!prev.has(code)) {
      newHires.push({
        employee_code: code, name: r.name, arabic_name: r.arabic_name,
        section: r.section, position: r.position, division: r.division,
        level_code: r.level_code, hiring_date: r.hiring_date, total_salary: r.total_salary,
        nationality: r.nationality, is_saudi: r.is_saudi,
      });
    }
  }
  for (const [code, r] of prev) {
    if (!curr.has(code)) {
      missing.push({
        employee_code: code, name: r.name, arabic_name: r.arabic_name,
        section: r.section, position: r.position, division: r.division,
        level_code: r.level_code, total_salary: r.total_salary, nationality: r.nationality,
        status: 'missing', reason: null, // HR must classify
      });
    }
  }
  for (const [code, c] of curr) {
    const p = prev.get(code);
    if (!p) continue;
    const changes = [];
    if (normStr(p.position) !== normStr(c.position) && (p.position || c.position))
      changes.push({ field: 'position', from: p.position ?? null, to: c.position ?? null });
    if (normStr(p.level_code) !== normStr(c.level_code) && (p.level_code || c.level_code))
      changes.push({ field: 'level_code', from: p.level_code ?? null, to: c.level_code ?? null });
    const ps = numOrNull(p.total_salary), cs = numOrNull(c.total_salary);
    if (ps !== null && cs !== null && ps !== cs)
      changes.push({ field: 'total_salary', from: ps, to: cs });
    if (normStr(p.section) !== normStr(c.section) && (p.section || c.section))
      changes.push({ field: 'section', from: p.section ?? null, to: c.section ?? null });

    if (!changes.length) continue;

    const salaryChange = changes.find((x) => x.field === 'total_salary');
    const salaryDelta = salaryChange ? salaryChange.to - salaryChange.from : 0;
    const salaryPct = salaryChange && salaryChange.from ? (salaryDelta / salaryChange.from) * 100 : null;
    const pLvl = levelNumber(p.level_code), cLvl = levelNumber(c.level_code);
    const levelUp = pLvl !== null && cLvl !== null && cLvl < pLvl; // lower level code = higher grade

    movements.push({
      employee_code: code, name: c.name, arabic_name: c.arabic_name,
      section: c.section, division: c.division, movement_date: movementDateISO,
      changes,
      previous: { position: p.position, level_code: p.level_code, total_salary: ps, section: p.section },
      current: { position: c.position, level_code: c.level_code, total_salary: cs, section: c.section },
      salary_delta: salaryChange ? salaryDelta : null,
      salary_pct: salaryPct,
      classification: classify(changes, { levelUp, salaryDelta }),
    });
  }

  return { newHires, missing, movements };
}

function classify(changes, { levelUp, salaryDelta }) {
  const fields = changes.map((c) => c.field);
  const hasPos = fields.includes('position');
  const hasLvl = fields.includes('level_code');
  const hasSal = fields.includes('total_salary');
  const hasSec = fields.includes('section');

  if (hasPos && hasLvl && levelUp && hasSal && salaryDelta > 0) return { type: 'Promotion', label: 'ترقية مرجّحة', confidence: 'likely_promotion' };
  if (hasLvl && levelUp && hasSal && salaryDelta > 0) return { type: 'Promotion', label: 'ترقية مرجّحة', confidence: 'likely_promotion' };
  if (fields.length > 2) return { type: 'Multiple Changes', label: 'تغييرات متعددة', confidence: 'ai_review' };
  if (hasSec && !hasPos && !hasLvl) return { type: 'Transfer', label: 'نقل', confidence: 'suggested' };
  if (hasPos && !hasSal && !hasLvl) return { type: 'Position Change', label: 'تغيير مسمى', confidence: 'suggested' };
  if (hasLvl && !hasPos) return { type: 'Level Change', label: 'تغيير درجة', confidence: 'suggested' };
  if (hasSal && !hasPos && !hasLvl && !hasSec) return { type: 'Salary Adjustment', label: 'تعديل راتب', confidence: 'suggested' };
  return { type: 'AI Review Required', label: 'يحتاج مراجعة', confidence: 'ai_review' };
}

function normStr(v) { return v == null ? '' : String(v).trim(); }
function numOrNull(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

// Monthly workforce movement summary (waterfall).
export function movementSummary(prevCount, newHires, missing, movements) {
  const promotions = movements.filter((m) => m.classification.type === 'Promotion').length;
  const transfers = movements.filter((m) => m.classification.type === 'Transfer').length;
  const salaryChanges = movements.filter((m) => m.changes.some((c) => c.field === 'total_salary')).length;
  const positionChanges = movements.filter((m) => m.changes.some((c) => c.field === 'position')).length;
  const closing = prevCount + newHires.length - missing.length;
  return {
    opening_headcount: prevCount,
    new_hires: newHires.length,
    missing_employees: missing.length,
    promotions, transfers, salary_changes: salaryChanges, position_changes: positionChanges,
    closing_headcount: closing,
    net_change: closing - prevCount,
  };
}

// Build an employee timeline from ordered snapshots (oldest -> newest).
// snapshots: [{ period, date, record|null }]
export function buildTimeline(code, snapshots) {
  const events = [];
  let prev = null;
  for (const snap of snapshots) {
    const r = snap.record;
    if (!r) { prev = null; continue; }
    if (prev === null) {
      events.push({ date: r.hiring_date || snap.date, period: snap.period, type: 'joined', label: 'الانضمام للشركة', detail: r.position || '' });
    } else {
      if (normStr(prev.position) !== normStr(r.position) && r.position)
        events.push({ date: snap.date, period: snap.period, type: 'position', label: 'تغيير المسمى', detail: `${prev.position || '—'} ← ${r.position}` });
      if (normStr(prev.level_code) !== normStr(r.level_code) && r.level_code)
        events.push({ date: snap.date, period: snap.period, type: 'level', label: 'تغيير الدرجة', detail: `${prev.level_code || '—'} ← ${r.level_code}` });
      const ps = numOrNull(prev.total_salary), cs = numOrNull(r.total_salary);
      if (ps !== null && cs !== null && ps !== cs)
        events.push({ date: snap.date, period: snap.period, type: 'salary', label: cs > ps ? 'زيادة الراتب' : 'تعديل الراتب', detail: `${ps} ← ${cs} SAR` });
      const pa = numOrNull(prev.end_annual_balance), ca = numOrNull(r.end_annual_balance);
      if (pa !== null && ca !== null && Math.abs(ca - pa) >= 0.5)
        events.push({ date: snap.date, period: snap.period, type: 'leave', label: ca > pa ? 'ارتفاع رصيد الإجازة' : 'انخفاض رصيد الإجازة', detail: `${pa.toFixed(2)} ← ${ca.toFixed(2)} يوم` });
    }
    prev = r;
  }
  return events;
}
