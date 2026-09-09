/* report.js — OFFICIAL HR REPORT / PDF ENGINE.
   Builds standalone, official-document reports (not printed dashboards) and
   paginates them with paged.js into true A4 pages with a running letterhead,
   footer, page numbers, QR code and repeating table headers. Fully bilingual:
   each report is generated in the chosen REPORT language independent of the
   interface language. The report design is always a light, printer-friendly
   corporate document regardless of the app's Light/Dark mode. */
(function () {
  const A = () => window.App;
  const api = (p) => window.App.api(p);
  const LOGO = 'assets/logo.svg';      // swapped to data URI in standalone build
  const QR = 'assets/qr-linktree.svg';
  const LINKTREE = 'https://linktr.ee/maysan.group';

  // ---- Bilingual report label map ----------------------------------------
  const RL = {
    group: { ar: 'مجموعة ميسان الدولية', en: 'MAYSAN INTERNATIONAL GROUP' },
    group_line: { ar: 'MAYSAN INTERNATIONAL GROUP', en: 'مجموعة ميسان الدولية' },
    dept: { ar: 'إدارة الموارد البشرية', en: 'Human Resources Department' },
    confidential: { ar: 'وثيقة سرّية — للاستخدام الداخلي الرسمي فقط', en: 'Confidential — For official internal use only' },
    page: { ar: 'صفحة', en: 'Page' },
    generated: { ar: 'تاريخ الإصدار', en: 'Generated' },
    at: { ar: 'الوقت', en: 'Time' },
    period: { ar: 'الفترة', en: 'Reporting Period' },
    scope: { ar: 'النطاق', en: 'Scope' },
    all_hotels: { ar: 'كل الفنادق', en: 'All Hotels' },
    data_asof: { ar: 'تاريخ البيانات', en: 'Data as of' },
    prepared_by: { ar: 'إعداد', en: 'Prepared by' },
    reviewed_by: { ar: 'مراجعة', en: 'Reviewed by' },
    approved_by: { ar: 'اعتماد', en: 'Approved by' },
    hr_officer: { ar: 'أخصائي موارد بشرية', en: 'HR Officer' },
    hr_manager: { ar: 'مدير الموارد البشرية', en: 'HR Manager' },
    gm: { ar: 'المدير العام', en: 'General Manager' },
    scan: { ar: 'روابط المجموعة الرسمية', en: 'Official group links' },
    // report titles
    t_executive: { ar: 'التقرير التنفيذي للموارد البشرية', en: 'HR Executive Summary Report' },
    t_workforce: { ar: 'تقرير القوى العاملة', en: 'Workforce Report' },
    t_saudization: { ar: 'تقرير السعودة والتوطين', en: 'Saudization & Localization Report' },
    t_nationality: { ar: 'تقرير الجنسيات', en: 'Nationality Report' },
    t_departments: { ar: 'تقرير الأقسام', en: 'Departments Report' },
    t_expiry: { ar: 'تقرير الانتهاء والامتثال', en: 'Expiry & Compliance Report' },
    t_directory: { ar: 'دليل الموظفين', en: 'Employee Directory' },
    t_hotels: { ar: 'تقرير مقارنة الفنادق', en: 'Hotel Comparison Report' },
    // KPIs / headers
    total_emp: { ar: 'إجمالي الموظفين', en: 'Total Employees' },
    saudis: { ar: 'الموظفون السعوديون', en: 'Saudi Employees' },
    non_saudis: { ar: 'غير السعوديين', en: 'Non-Saudi Employees' },
    saudi_ratio: { ar: 'نسبة السعودة الداخلية', en: 'Internal Saudi Ratio' },
    males: { ar: 'ذكور', en: 'Male' }, females: { ar: 'إناث', en: 'Female' },
    departments: { ar: 'الأقسام', en: 'Departments' }, positions: { ar: 'المسميات', en: 'Job Titles' },
    nationalities: { ar: 'الجنسيات', en: 'Nationalities' }, hotels: { ar: 'الفنادق', en: 'Hotels' },
    payroll: { ar: 'إجمالي الرواتب', en: 'Total Payroll' }, avg_salary: { ar: 'متوسط الراتب', en: 'Average Salary' },
    docs_expiring: { ar: 'وثائق تنتهي خلال 90 يوم', en: 'Docs expiring ≤90 days' },
    // table columns
    c_dept: { ar: 'القسم', en: 'Department' }, c_pos: { ar: 'المسمى الوظيفي', en: 'Job Title' },
    c_nat: { ar: 'الجنسية', en: 'Nationality' }, c_level: { ar: 'الدرجة', en: 'Level' },
    c_hotel: { ar: 'الفندق', en: 'Hotel' }, c_total: { ar: 'الإجمالي', en: 'Total' },
    c_saudi: { ar: 'سعودي', en: 'Saudi' }, c_nonsaudi: { ar: 'غير سعودي', en: 'Non-Saudi' },
    c_pct: { ar: 'النسبة %', en: 'Ratio %' }, c_share: { ar: 'الحصة %', en: 'Share %' },
    c_male: { ar: 'ذكور', en: 'Male' }, c_female: { ar: 'إناث', en: 'Female' },
    c_required: { ar: 'المطلوب رسمياً %', en: 'Official Required %' },
    c_current: { ar: 'الحالي %', en: 'Current %' }, c_gap: { ar: 'الفجوة', en: 'Gap' },
    c_need: { ar: 'سعوديون مطلوبون', en: 'Saudis Needed' }, c_status: { ar: 'الحالة', en: 'Status' },
    c_code: { ar: 'الرقم', en: 'Code' }, c_name: { ar: 'الاسم', en: 'Name' },
    c_doc: { ar: 'الوثيقة', en: 'Document' }, c_expiry: { ar: 'تاريخ الانتهاء', en: 'Expiry Date' },
    c_days: { ar: 'المتبقي', en: 'Days Left' }, c_priority: { ar: 'الأولوية', en: 'Priority' },
    c_count: { ar: 'العدد', en: 'Count' },
    // sections
    s_summary: { ar: 'الملخص التنفيذي', en: 'Executive Summary' },
    s_composition: { ar: 'تركيبة القوى العاملة', en: 'Workforce Composition' },
    s_by_dept: { ar: 'التوزيع حسب القسم', en: 'By Department' },
    s_by_nat: { ar: 'التوزيع حسب الجنسية', en: 'By Nationality' },
    s_by_level: { ar: 'التوزيع حسب الدرجة', en: 'By Level' },
    s_saud_overall: { ar: 'نسبة السعودة الإجمالية', en: 'Overall Saudization' },
    s_saud_pos: { ar: 'السعودة حسب المسمى الوظيفي (مقابل القرارات الرسمية)', en: 'Saudization by Job Title (vs. official rules)' },
    s_alerts: { ar: 'تنبيهات الوثائق (منتهية أو خلال 90 يوم)', en: 'Document Alerts (expired or ≤90 days)' },
    s_missing: { ar: 'وثائق ناقصة', en: 'Missing Documents' },
    s_hotels: { ar: 'مقارنة الفنادق', en: 'Hotels Comparison' },
    s_directory: { ar: 'قائمة الموظفين', en: 'Employee List' },
    none: { ar: 'لا توجد بيانات مطابقة.', en: 'No matching data.' },
    saud_note: { ar: 'النسبة الحالية محسوبة من ملف الموظفين. «المطلوب رسمياً» لا يظهر إلا عند وجود قرار توطين موثّق في قاعدة قواعد التوطين؛ وإلا يُعرض «غير محدد».', en: 'Current ratio is computed from the employee file. “Official Required” appears only when a documented localization rule exists in the Localization Rules database; otherwise it shows “Not set”.' },
    not_set: { ar: 'غير محدد', en: 'Not set' },
    compliant: { ar: 'مطابق', en: 'Compliant' }, below: { ar: 'أقل من الهدف', en: 'Below target' },
    near: { ar: 'قريب', en: 'Near' }, critical: { ar: 'فجوة حرجة', en: 'Critical gap' },
    p_critical: { ar: 'حرجة', en: 'Critical' }, p_high: { ar: 'عالية', en: 'High' },
    p_medium: { ar: 'متوسطة', en: 'Medium' }, p_low: { ar: 'منخفضة', en: 'Low' },
    expired_since: { ar: 'منتهية منذ', en: 'expired' }, day: { ar: 'يوم', en: 'd' },
  };

  // ---- Report catalogue ---------------------------------------------------
  const REPORTS = [
    { id: 'executive', icon: 'activity', perm: 'view_dashboard', orient: 'portrait' },
    { id: 'workforce', icon: 'users', perm: 'view_workforce', orient: 'landscape' },
    { id: 'saudization', icon: 'user-check', perm: 'view_saudization', orient: 'landscape' },
    { id: 'nationality', icon: 'globe', perm: 'view_nationality', orient: 'portrait' },
    { id: 'departments', icon: 'building', perm: 'view_departments', orient: 'landscape' },
    { id: 'hotels', icon: 'building', perm: 'view_workforce', orient: 'landscape' },
    { id: 'expiry', icon: 'clock', perm: 'view_expiry', orient: 'landscape' },
    { id: 'directory', icon: 'search', perm: 'view_employees', orient: 'landscape' },
  ];

  // ---- helpers ------------------------------------------------------------
  let lang = 'ar';
  const L = (k) => (RL[k] ? (RL[k][lang] ?? RL[k].ar) : k);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nfmt = (v, d = 0) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pfmt = (v, d = 2) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d) + '%';
  const money = (v) => (v == null || isNaN(v)) ? '—' : Number(Math.round(v)).toLocaleString('en-US') + ' SAR';
  const dfmt = (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return iso; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
  const naLabel = (k) => (k === '— غير محدد —' ? (lang === 'ar' ? '— غير محدد —' : '— Unspecified —') : k);

  function kpiCard(label, value, sub) {
    return `<div class="rep-kpi"><div class="l">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</div>`;
  }
  function section(titleKey, n, bodyHTML, note) {
    return `<div class="rep-sec"><h2>${n ? `<span class="n">${n}</span>` : ''}${esc(L(titleKey))}</h2>${note ? `<div class="rep-note">${esc(note)}</div>` : ''}${bodyHTML}</div>`;
  }
  function table(cols, rows, foot) {
    if (!rows.length) return `<div class="rep-empty">${esc(L('none'))}</div>`;
    const colg = cols.some((c) => c.w) ? `<colgroup>${cols.map((c) => `<col style="width:${c.w || 'auto'}">`).join('')}</colgroup>` : '';
    const thead = `${colg}<thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${r[c.k] == null ? '—' : r[c.k]}</td>`).join('')}</tr>`).join('')}</tbody>`;
    const tfoot = foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${foot[c.k] == null ? '' : foot[c.k]}</td>`).join('')}</tr></tfoot>` : '';
    return `<table class="rep-tbl">${thead}${tbody}${tfoot}</table>`;
  }

  // ---- Report builders (each returns HTML for the report body) ------------
  const BUILD = {
    async executive(ctx) {
      const [k, wf, sd] = await Promise.all([
        api('/api/kpis' + ctx.qs), api('/api/workforce' + ctx.qs).catch(() => null),
        api('/api/saudization' + ctx.qs).catch(() => null),
      ]);
      const d = k.kpis || {};
      let html = section('s_summary', '1', `<div class="rep-kpis">
        ${kpiCard(L('total_emp'), nfmt(d.total_employees))}
        ${kpiCard(L('saudis'), nfmt(d.saudi_employees))}
        ${kpiCard(L('non_saudis'), nfmt(d.non_saudi_employees))}
        ${kpiCard(L('saudi_ratio'), pfmt(d.saudi_pct))}
        ${kpiCard(L('males'), nfmt(d.male_employees))}
        ${kpiCard(L('females'), nfmt(d.female_employees))}
        ${kpiCard(L('departments'), nfmt(d.departments))}
        ${kpiCard(L('positions'), nfmt(d.positions))}
        ${kpiCard(L('nationalities'), nfmt(d.nationalities))}
        ${kpiCard(L('hotels'), nfmt(d.divisions))}
        ${ctx.canSalary ? kpiCard(L('payroll'), money(d.total_payroll)) : ''}
        ${ctx.canSalary ? kpiCard(L('avg_salary'), money(d.average_salary)) : ''}
        ${kpiCard(L('docs_expiring'), nfmt(d.documents_expiring_soon))}
      </div>`);
      if (wf && wf.bySection) {
        const rows = wf.bySection.slice(0, 12).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi), non: nfmt(g.non_saudi), pct: pfmt(g.saudi_pct, 1) }));
        html += section('s_by_dept', '2', table(
          [{ h: L('c_dept'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_nonsaudi'), k: 'non', num: 1 }, { h: L('c_pct'), k: 'pct', num: 1 }],
          rows, { k: L('c_total'), total: nfmt(d.total_employees), saudi: nfmt(d.saudi_employees), non: nfmt(d.non_saudi_employees), pct: pfmt(d.saudi_pct, 1) }));
      }
      if (sd && sd.byPosition) html += buildSaudPositions(sd, '3');
      return html;
    },

    async workforce(ctx) {
      const wf = await api('/api/workforce' + ctx.qs);
      const d = wf.kpis || {};
      let html = section('s_composition', '1', `<div class="rep-kpis">
        ${kpiCard(L('total_emp'), nfmt(d.total_employees))}
        ${kpiCard(L('saudis'), nfmt(d.saudi_employees))}
        ${kpiCard(L('non_saudis'), nfmt(d.non_saudi_employees))}
        ${kpiCard(L('saudi_ratio'), pfmt(d.saudi_pct))}</div>`);
      const dept = (wf.bySection || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi), non: nfmt(g.non_saudi), m: nfmt(g.male), f: nfmt(g.female), pct: pfmt(g.saudi_pct, 1) }));
      html += section('s_by_dept', '2', table(
        [{ h: L('c_dept'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_nonsaudi'), k: 'non', num: 1 }, { h: L('c_male'), k: 'm', num: 1 }, { h: L('c_female'), k: 'f', num: 1 }, { h: L('c_pct'), k: 'pct', num: 1 }],
        dept));
      const nat = (wf.byNationality || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), pct: pfmt(g.total / (d.total_employees || 1) * 100, 1) }));
      html += section('s_by_nat', '3', table([{ h: L('c_nat'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_share'), k: 'pct', num: 1 }], nat));
      const lvl = (wf.byLevel || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi), pct: pfmt(g.saudi_pct, 1) }));
      html += section('s_by_level', '4', table([{ h: L('c_level'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_pct'), k: 'pct', num: 1 }], lvl));
      return html;
    },

    async saudization(ctx) {
      const sd = await api('/api/saudization' + ctx.qs);
      const o = sd.overall || {};
      let html = section('s_saud_overall', '1', `<div class="rep-kpis k3">
        ${kpiCard(L('total_emp'), nfmt(o.total))}
        ${kpiCard(L('saudis'), nfmt(o.saudi))}
        ${kpiCard(L('saudi_ratio'), pfmt(o.saudi_pct))}</div>`, L('saud_note'));
      html += buildSaudPositions(sd, '2');
      const dept = (sd.bySection || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi), pct: pfmt(g.saudi_pct, 1) }));
      html += section('s_by_dept', '3', table([{ h: L('c_dept'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_pct'), k: 'pct', num: 1 }], dept));
      return html;
    },

    async nationality(ctx) {
      const n = await api('/api/nationality' + ctx.qs);
      const rows = (n.groups || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), pct: pfmt(g.pct, 1) }));
      return section('s_by_nat', '1', table([{ h: L('c_nat'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_share'), k: 'pct', num: 1 }], rows,
        { k: L('c_total'), total: nfmt(n.total), pct: '100.0%' }));
    },

    async departments(ctx) {
      const r = await api('/api/departments' + ctx.qs);
      const rows = (r.departments || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi), non: nfmt(g.non_saudi), pos: nfmt(g.positions), pct: pfmt(g.saudi_pct, 1) }));
      return section('s_by_dept', '1', table(
        [{ h: L('c_dept'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_nonsaudi'), k: 'non', num: 1 }, { h: L('positions'), k: 'pos', num: 1 }, { h: L('c_pct'), k: 'pct', num: 1 }],
        rows));
    },

    async hotels(ctx) {
      const wf = await api('/api/workforce' + ctx.qs);
      const rows = (wf.byDivision || []).map((g) => ({ k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi), non: nfmt(g.non_saudi), m: nfmt(g.male), f: nfmt(g.female), pct: pfmt(g.saudi_pct, 1) }));
      const d = wf.kpis || {};
      return section('s_hotels', '1', table(
        [{ h: L('c_hotel'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_nonsaudi'), k: 'non', num: 1 }, { h: L('c_male'), k: 'm', num: 1 }, { h: L('c_female'), k: 'f', num: 1 }, { h: L('c_pct'), k: 'pct', num: 1 }],
        rows, { k: L('c_total'), total: nfmt(d.total_employees), saudi: nfmt(d.saudi_employees), non: nfmt(d.non_saudi_employees), m: nfmt(d.male_employees), f: nfmt(d.female_employees), pct: pfmt(d.saudi_pct, 1) }));
    },

    async expiry(ctx) {
      const [ex, al] = await Promise.all([api('/api/expiry' + ctx.qs), api('/api/alerts' + ctx.qs)]);
      const alerts = (al.alerts || []);
      const prMap = { critical: L('p_critical'), high: L('p_high'), medium: L('p_medium'), low: L('p_low') };
      const rows = alerts.map((x) => ({
        pr: `<span class="rep-tag ${x.priority === 'critical' ? 'bad' : x.priority === 'high' ? 'warn' : x.priority === 'low' ? 'ok' : 'mut'}">${esc(prMap[x.priority] || x.priority)}</span>`,
        code: esc(x.employee_code), name: esc(x.arabic_name || x.name), dept: esc(x.section || ''),
        doc: esc(lang === 'ar' ? x.document_ar : x.document), exp: dfmt(x.expiry_date),
        days: x.days_left < 0 ? `${L('expired_since')} ${Math.abs(x.days_left)} ${L('day')}` : `${x.days_left} ${L('day')}`,
      }));
      let html = section('s_alerts', '1', table(
        [{ h: L('c_priority'), k: 'pr', num: 1, w: '10%' }, { h: L('c_code'), k: 'code', num: 1, w: '8%' }, { h: L('c_name'), k: 'name', w: '24%' }, { h: L('c_dept'), k: 'dept', w: '22%' }, { h: L('c_doc'), k: 'doc', w: '14%' }, { h: L('c_expiry'), k: 'exp', num: 1, w: '10%' }, { h: L('c_days'), k: 'days', num: 1, w: '12%' }],
        rows));
      const mf = (ex.missing && ex.missing.by_field) || {};
      const mlab = { contract_expire_date: { ar: 'العقد', en: 'Contract' }, health_card_expire_date: { ar: 'البطاقة الصحية', en: 'Health Card' }, residence_expire_date: { ar: 'الإقامة', en: 'Iqama' }, passport_expire_date: { ar: 'الجواز', en: 'Passport' } };
      const mrows = Object.entries(mf).filter(([, v]) => v > 0).map(([f, v]) => ({ k: (mlab[f] ? mlab[f][lang] : f), c: nfmt(v) }));
      html += section('s_missing', '2', table([{ h: L('c_doc'), k: 'k' }, { h: L('c_count'), k: 'c', num: 1 }], mrows));
      return html;
    },

    async directory(ctx) {
      const r = await api('/api/employees?q=' + (ctx.division ? '&division=' + encodeURIComponent(ctx.division) : '') + (A().filters.period ? '&period=' + A().filters.period : ''));
      const emps = (r.employees || []).slice(0, 800);
      const rows = emps.map((e) => ({
        code: esc(e.employee_code), name: esc(e.arabic_name || e.name), en: esc(e.name || ''),
        hotel: esc(e.division || ''), dept: esc(e.section || ''), pos: esc(e.position || ''),
        nat: esc(e.nationality || ''), cls: e.is_saudi ? `<span class="rep-tag ok">${lang === 'ar' ? 'سعودي' : 'Saudi'}</span>` : `<span class="rep-tag mut">${lang === 'ar' ? 'غير سعودي' : 'Non-Saudi'}</span>`,
      }));
      return section('s_directory', '1', table(
        [{ h: L('c_code'), k: 'code', num: 1, w: '7%' }, { h: L('c_name'), k: 'name', w: '18%' }, { h: 'EN', k: 'en', w: '17%' }, { h: L('c_hotel'), k: 'hotel', w: '15%' }, { h: L('c_dept'), k: 'dept', w: '17%' }, { h: L('c_pos'), k: 'pos', w: '11%' }, { h: L('c_nat'), k: 'nat', w: '8%' }, { h: L('c_status'), k: 'cls', num: 1, w: '7%' }],
        rows));
    },
  };

  function buildSaudPositions(sd, n) {
    const st = { compliant: ['ok', L('compliant')], near: ['warn', L('near')], below: ['warn', L('below')], critical: ['bad', L('critical')], unknown: ['mut', L('not_set')] };
    const rows = (sd.byPosition || []).slice(0, 40).map((g) => {
      const s = st[g.compliance] || st.unknown;
      return {
        k: naLabel(g.key), total: nfmt(g.total), saudi: nfmt(g.saudi),
        req: g.required_pct == null ? `<span class="rep-tag mut">${esc(L('not_set'))}</span>` : pfmt(g.required_pct, 0),
        cur: pfmt(g.current_pct, 1),
        gap: g.gap_pct == null ? '—' : (g.gap_pct <= 0 ? '+' + pfmt(-g.gap_pct, 1) : '−' + pfmt(g.gap_pct, 1)),
        need: g.required_additional_saudi == null ? '—' : nfmt(g.required_additional_saudi),
        stat: `<span class="rep-tag ${s[0]}">${esc(s[1])}</span>`,
      };
    });
    return section('s_saud_pos', n, table(
      [{ h: L('c_pos'), k: 'k' }, { h: L('c_total'), k: 'total', num: 1 }, { h: L('c_saudi'), k: 'saudi', num: 1 }, { h: L('c_required'), k: 'req', num: 1 }, { h: L('c_current'), k: 'cur', num: 1 }, { h: L('c_gap'), k: 'gap', num: 1 }, { h: L('c_need'), k: 'need', num: 1 }, { h: L('c_status'), k: 'stat', num: 1 }],
      rows), L('saud_note'));
  }

  // ---- Document assembly --------------------------------------------------
  function letterhead() {
    return `<div class="rep-runhead"><img class="lg" src="${LOGO}" alt="MG">
      <div class="txt"><div class="g">${esc(L('group'))} · ${esc(L('group_line'))}</div><div class="d">${esc(L('dept'))}</div></div></div>`;
  }
  function footer() {
    return `<div class="rep-runfoot"><img class="qr" src="${QR}" alt="QR ${LINKTREE}">
      <div class="fx"><b>${esc(L('group'))}</b> · ${esc(L('dept'))} — ${esc(L('confidential'))}<br>${esc(L('scan'))}: ${LINKTREE}</div></div>`;
  }
  function cover(rep, ctx) {
    const now = new Date();
    const dateStr = now.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
    const timeStr = now.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
    const cell = (l, v) => `<div class="m"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`;
    return `<div class="rep-cover">
      <div class="kicker">${esc(L('group'))} — ${esc(L('dept'))}</div>
      <h1>${esc(L('t_' + rep.id))}</h1><div class="rule"></div>
      <div class="rep-meta">
        ${cell(L('scope'), ctx.scopeLabel)}
        ${cell(L('period'), ctx.periodLabel)}
        ${cell(L('data_asof'), dfmt(ctx.asOf))}
        ${cell(L('generated'), dateStr)}
        ${cell(L('at'), timeStr)}
        ${cell(L('hotels'), ctx.scopeLabel)}
      </div></div>`;
  }
  function signature() {
    const sig = (role, sub) => `<div class="sig"><div class="line"></div><div class="role">${esc(L(role))}</div><div class="sub">${esc(L(sub))}</div></div>`;
    return `<div class="rep-sign">${sig('prepared_by', 'hr_officer')}${sig('reviewed_by', 'hr_manager')}${sig('approved_by', 'gm')}</div>`;
  }

  // ---- paged.js rendering + print ----------------------------------------
  let cachedCSS = null;
  async function reportCSS() {
    if (window.__REPORT_CSS__) return window.__REPORT_CSS__;
    if (cachedCSS) return cachedCSS;
    cachedCSS = await (await fetch('css/report.css')).text();
    return cachedCSS;
  }
  function pageCSS(orient) {
    const land = orient === 'landscape';
    const cw = land ? 267 : 180;
    const pageWord = L('page');
    return `
      @page{ size: A4 ${land ? 'landscape' : 'portrait'}; margin: 26mm 15mm 22mm 15mm;
        @top-center{ content: element(runhead); }
        @bottom-left{ content: element(runfoot); }
        @bottom-right{ content: "${pageWord} " counter(page) " / " counter(pages); font-family:'Tajawal','Inter',Arial,sans-serif; font-size:8pt; color:#5b6b60; } }
      .rep-runhead{ position: running(runhead); width:${cw}mm; }
      .rep-runfoot{ position: running(runfoot); width:${cw - 40}mm; }`;
  }

  async function paginate(html, orient) {
    const overlay = document.getElementById('reportOverlay');
    const pagesEl = document.getElementById('reportPages');
    const css = pageCSS(orient) + '\n' + (await reportCSS());
    pagesEl.innerHTML = '';
    const Paged = window.PagedModule;
    if (!Paged || !Paged.Previewer) throw new Error('paged.js not loaded');
    // paged.js chunks a DOM node reliably (a raw string is not laid out for
    // measurement, which leaves everything on one over-wide page).
    const src = document.createElement('template');
    src.innerHTML = html.trim();
    const node = src.content.firstElementChild;
    // paged.js mis-measures page fill when the ROOT <html> is dir="rtl" (it puts
    // everything on one page). The report document keeps its own dir="rtl"; we
    // only flip the root to LTR while paginating (hidden behind the overlay),
    // then restore. Once chunked, the static pages print correctly either way.
    const rootDir = document.documentElement.getAttribute('dir');
    document.documentElement.setAttribute('dir', 'ltr');
    try {
      const prev = new Paged.Previewer();
      await prev.preview(node, [{ 'report.css': css }], pagesEl);
    } finally {
      if (rootDir) document.documentElement.setAttribute('dir', rootDir); else document.documentElement.removeAttribute('dir');
    }
    repeatTableHeaders(pagesEl);
    overlay.dataset.ready = '1';
  }

  // Ensure every continuation fragment of a split table repeats its header row
  // (and colgroup, so fixed column widths stay aligned across pages). paged.js
  // 0.4.x does not reliably clone <thead> into continuation tables.
  function repeatTableHeaders(root) {
    let lastThead = null, lastCol = null;
    root.querySelectorAll('.pagedjs_page').forEach((pg) => {
      pg.querySelectorAll('table.rep-tbl').forEach((tb) => {
        const thead = tb.querySelector(':scope > thead');
        const colg = tb.querySelector(':scope > colgroup');
        if (thead) { lastThead = thead; lastCol = colg; return; }
        if (!lastThead) return;
        tb.insertBefore(lastThead.cloneNode(true), tb.firstChild);
        if (lastCol && !colg) tb.insertBefore(lastCol.cloneNode(true), tb.firstChild);
      });
    });
  }

  // ---- Public: open a report ---------------------------------------------
  async function open(repId, opts) {
    const rep = REPORTS.find((r) => r.id === repId);
    if (!rep) return;
    lang = (opts && opts.lang) || window.I18N.lang || 'ar';
    const orient = (opts && opts.orient) || rep.orient || 'portrait';
    const division = (opts && opts.division) || '';
    const st = A().state || {};
    const filtersQ = Object.assign({}, A().filters);
    if (division) filtersQ.division = division;
    const p = new URLSearchParams();
    Object.entries(filtersQ).forEach(([k, v]) => { if (v) p.set(k, v); });
    const qs = p.toString() ? '?' + p.toString() : '';
    const periodLabel = st.active ? (st.active.periodLabel || st.active.period || '—') : '—';
    const scopeLabel = division || L('all_hotels');
    const ctx = { qs, division, asOf: st.active ? st.active.asOf : null, periodLabel, scopeLabel, canSalary: (A().me && A().me.permissions.includes('view_salary')) };

    showOverlay(true);
    const pagesEl = document.getElementById('reportPages');
    pagesEl.innerHTML = '<div class="rep-loading">' + (lang === 'ar' ? 'جارٍ تجهيز التقرير الرسمي…' : 'Preparing the official report…') + '</div>';
    try {
      const body = await BUILD[repId](ctx);
      const doc = `<div class="report-doc ${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
        ${letterhead()}${footer()}${cover(rep, ctx)}${body}${signature()}</div>`;
      await paginate(doc, orient);
    } catch (e) {
      console.error(e);
      pagesEl.innerHTML = `<div class="rep-loading">${lang === 'ar' ? 'تعذّر تجهيز التقرير' : 'Failed to prepare report'}: ${esc(e.message || '')}</div>`;
    }
  }

  // Trigger the browser print dialog. In a restricted preview sandbox (the
  // published-link iframe) window.print() can be blocked and throw / no-op; in
  // that case guide the user to the runnable app where Save-as-PDF works fully.
  function doPrint() {
    const ar = window.I18N.lang === 'ar';
    let opened = false;
    try { const r = window.print(); opened = r !== false; } catch (e) { opened = false; }
    // A blocked sandbox print returns immediately without a dialog; give guidance.
    setTimeout(() => {
      if (window.toast) window.toast(ar
        ? 'إن لم تظهر نافذة الطباعة: افتح النظام من التطبيق المشغّل (npm start) أو النسخة المنشورة على نطاقك، ثم اضغط طباعة واختر «حفظ PDF». الطباعة قد تكون محجوبة في معاينة الرابط.'
        : 'If the print dialog did not appear, open the app from the running server or your deployed site, then Print → Save as PDF. Printing may be blocked in the preview link.', opened ? 'ok' : '');
    }, 700);
  }

  function showOverlay(show) {
    let ov = document.getElementById('reportOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'reportOverlay';
      ov.innerHTML = `<div class="rep-toolbar no-print">
          <button class="btn" id="repClose">✕ <span></span></button>
          <div class="rep-tb-title"></div>
          <button class="btn btn-primary" id="repPrint"></button>
        </div><div id="reportPages" class="report-pages"></div>`;
      document.body.appendChild(ov);
      ov.querySelector('#repClose').addEventListener('click', () => showOverlay(false));
      ov.querySelector('#repPrint').addEventListener('click', doPrint);
    }
    const closeTxt = window.I18N.lang === 'ar' ? 'إغلاق' : 'Close';
    const printTxt = window.I18N.lang === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save PDF';
    ov.querySelector('#repClose span').textContent = closeTxt;
    ov.querySelector('#repPrint').textContent = printTxt;
    ov.querySelector('.rep-tb-title').textContent = window.I18N.lang === 'ar' ? 'معاينة التقرير الرسمي' : 'Official report preview';
    document.body.classList.toggle('report-open', show);
    ov.style.display = show ? 'flex' : 'none';
    if (!show) { document.getElementById('reportPages').innerHTML = ''; }
  }

  window.Report = { open, REPORTS, RL };

  // ---- Hotels comparison page --------------------------------------------
  window.Pages = window.Pages || {};
  window.Pages.hotels = async function (content) {
    const il = window.I18N.lang, t = (k) => window.I18N.t(k);
    const ar = il === 'ar';
    if (!window.App.state || !window.App.state.hasData) {
      content.innerHTML = `<div class="page-head"><div><h2>${t('n_hotels')}</h2></div></div><div class="empty"><h3>${ar ? 'لا توجد بيانات' : 'No data'}</h3></div>`;
      return;
    }
    content.innerHTML = '<div class="spinner"></div>';
    const wf = await window.App.api('/api/workforce' + window.App.qs());
    const rows = (wf.byDivision || []).slice();
    const k = wf.kpis || {};
    const esc = fmt.esc;
    const head = `<div class="page-head"><div><h2>${t('n_hotels')}</h2><div class="sub">${ar ? 'مقارنة الفنادق جنباً إلى جنب — الأعداد والسعودة والتركيبة' : 'Side-by-side hotel comparison — headcount, Saudization, composition'}</div></div>
      <div class="ph-actions no-print"><button class="btn" id="hotelReport">${window.icon ? window.icon('printer') : ''} ${t('preview_print')}</button></div></div>`;
    const kpis = `<div class="kpi-grid">
      <div class="kpi"><div class="k-top"><span class="k-label">${t('hotels')}</span></div><div class="k-val">${fmt.n(rows.length)}</div></div>
      <div class="kpi"><div class="k-top"><span class="k-label">${ar ? 'إجمالي الموظفين' : 'Total Employees'}</span></div><div class="k-val">${fmt.n(k.total_employees)}</div></div>
      <div class="kpi"><div class="k-top"><span class="k-label">${ar ? 'السعوديون' : 'Saudis'}</span></div><div class="k-val">${fmt.n(k.saudi_employees)}</div></div>
      <div class="kpi"><div class="k-top"><span class="k-label">${ar ? 'نسبة السعودة' : 'Saudization'}</span></div><div class="k-val">${fmt.pct(k.saudi_pct)}</div></div></div>`;
    const table = `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>${ar ? 'مقارنة الفنادق' : 'Hotel Comparison'}</h3></div><div class="panel-body tbl-wrap">
      <table class="tbl clickable"><thead><tr><th>${t('hotel')}</th><th>${ar ? 'الإجمالي' : 'Total'}</th><th>${ar ? 'سعودي' : 'Saudi'}</th><th>${ar ? 'غير سعودي' : 'Non-Saudi'}</th><th>${ar ? 'ذكور' : 'Male'}</th><th>${ar ? 'إناث' : 'Female'}</th><th>${ar ? 'الأقسام' : 'Depts'}</th><th>${ar ? 'السعودة %' : 'Saudization %'}</th></tr></thead><tbody>
      ${rows.map((g) => `<tr data-hotel="${esc(g.key)}"><td><b>${esc(g.key)}</b></td><td class="num">${fmt.n(g.total)}</td><td class="num">${fmt.n(g.saudi)}</td><td class="num">${fmt.n(g.non_saudi)}</td><td class="num">${fmt.n(g.male)}</td><td class="num">${fmt.n(g.female)}</td><td class="num">${fmt.n(g.positions)}</td><td class="num"><span class="badge ${g.saudi_pct >= 60 ? 'b-ok' : g.saudi_pct >= 30 ? 'b-warn' : 'b-danger'}">${fmt.pct(g.saudi_pct, 1)}</span></td></tr>`).join('')}
      </tbody></table></div></div>`;
    const charts = `<div class="grid g-2">
      <div class="panel"><div class="panel-head"><h3>${ar ? 'الموظفون حسب الفندق' : 'Headcount by Hotel'}</h3></div><div class="panel-body"><div id="chHotelCount" class="chart"></div></div></div>
      <div class="panel"><div class="panel-head"><h3>${ar ? 'التركيبة (سعودي / غير سعودي)' : 'Composition (Saudi / Non-Saudi)'}</h3></div><div class="panel-body"><div id="chHotelMix" class="chart"></div></div></div></div>`;
    content.innerHTML = head + kpis + table + charts;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const cats = rows.map((g) => g.key);
      if (window.Chart) {
        Chart.barH(document.getElementById('chHotelCount'), cats, rows.map((g) => g.total), { labelWidth: 150 });
        Chart.stacked(document.getElementById('chHotelMix'), cats, [
          { name: ar ? 'سعودي' : 'Saudi', data: rows.map((g) => g.saudi), color: '#1E883F' },
          { name: ar ? 'غير سعودي' : 'Non-Saudi', data: rows.map((g) => g.non_saudi), color: '#C49A3A' },
        ], { horizontal: true, labelWidth: 150 });
      }
    }));
    content.querySelectorAll('tr[data-hotel]').forEach((tr) => tr.addEventListener('click', () => {
      window.App.filters.division = tr.dataset.hotel; location.hash = '#/dashboard';
    }));
    const rb = document.getElementById('hotelReport');
    if (rb) rb.addEventListener('click', () => window.Report.open('hotels', { lang: window.I18N.lang, orient: 'landscape', division: window.App.filters.division || '' }));
  };

  // ---- Job Mapping admin page --------------------------------------------
  window.Pages.jobmap = async function (content) {
    const il = window.I18N.lang, ar = il === 'ar', t = (k) => window.I18N.t(k);
    const canManage = window.can('manage_localization_rules');
    const r = await window.App.api('/api/jobmap');
    const rows = r.rows || [];
    const stdTitles = r.standardTitles || [];
    content.innerHTML = `<div class="page-head"><div><h2>${t('n_jobmap')}</h2>
        <div class="sub">${ar ? 'وحّد صيغ المسمى الوظيفي المختلفة (موظف استقبال / استقبال / Front Desk) إلى مسمى معياري واحد يُستخدم في حساب التوطين.' : 'Unify job-title variants (Receptionist / Front Desk / موظف استقبال) into one standardized title used for localization.'}</div></div>
      ${canManage ? `<div class="ph-actions no-print"><button class="btn btn-primary" id="jmSave">${ar ? 'حفظ التعيينات' : 'Save mappings'}</button></div>` : ''}</div>
      <div class="data-note">${ar ? 'المسمى المعياري يُطابَق مع «المهن المشمولة» في قرارات التوطين. اترك الحقل فارغاً ليُستخدم المسمى كما هو.' : 'The standardized title is matched against the occupations in localization rules. Leave blank to use the title as-is.'}</div>
      <datalist id="stdList">${stdTitles.map((s) => `<option value="${fmt.esc(s)}">`).join('')}</datalist>
      <div class="panel"><div class="panel-body tbl-wrap"><table class="tbl"><thead><tr>
        <th>${ar ? 'المسمى في البيانات' : 'Title in data'}</th><th>${ar ? 'المسمى المعياري' : 'Standardized title'}</th><th>${ar ? 'الحالة' : 'Status'}</th></tr></thead><tbody>
        ${rows.map((row) => `<tr><td><b>${fmt.esc(row.position)}</b></td>
          <td>${canManage ? `<input class="field" style="margin:0" list="stdList" data-key="${fmt.esc(row.key)}" value="${fmt.esc(row.standardized)}" placeholder="${fmt.esc(row.position)}">` : fmt.esc(row.standardized || row.position)}</td>
          <td><span class="badge ${row.mapped ? 'b-ok' : 'b-muted'}">${row.mapped ? (ar ? 'مُعيَّن' : 'Mapped') : (ar ? 'كما هو' : 'As-is')}</span></td></tr>`).join('')}
      </tbody></table></div></div>`;
    if (canManage) {
      const btn = document.getElementById('jmSave');
      btn && btn.addEventListener('click', async () => {
        const map = {};
        content.querySelectorAll('input[data-key]').forEach((inp) => { const v = inp.value.trim(); if (v) map[inp.dataset.key] = v; });
        await window.App.api('/api/jobmap', { method: 'PUT', body: JSON.stringify({ map }) });
        window.toast(ar ? 'تم حفظ التعيينات' : 'Mappings saved', 'ok');
      });
    }
  };

  // ---- Reports Center page (registered on window.Pages) -------------------
  const DESC = {
    executive: { ar: 'ملخص تنفيذي شامل بالمؤشرات الرئيسية والتوزيع والسعودة — للإدارة العليا.', en: 'Board-level summary: key KPIs, composition and Saudization.' },
    workforce: { ar: 'تفصيل القوى العاملة حسب القسم والجنسية والدرجة.', en: 'Workforce breakdown by department, nationality and level.' },
    saudization: { ar: 'السعودة الإجمالية وحسب المسمى مقابل القرارات الرسمية والفجوة والمطلوب.', en: 'Overall & per-title Saudization vs. official rules, gaps and needs.' },
    nationality: { ar: 'توزيع الجنسيات والحصص.', en: 'Nationality distribution and shares.' },
    departments: { ar: 'إحصاءات الأقسام: الأعداد والسعودة والمسميات.', en: 'Department stats: counts, Saudization and titles.' },
    hotels: { ar: 'مقارنة الفنادق جنباً إلى جنب.', en: 'Side-by-side hotel comparison.' },
    expiry: { ar: 'تنبيهات الوثائق المنتهية/القريبة والوثائق الناقصة.', en: 'Expired/expiring document alerts and missing documents.' },
    directory: { ar: 'دليل الموظفين الكامل بالفندق والقسم والمسمى.', en: 'Full employee directory by hotel, department and title.' },
  };
  const cardIcon = (n) => (window.icon ? window.icon(n) : '');

  window.Pages = window.Pages || {};
  window.Pages.reports = function (content) {
    const il = window.I18N.lang;
    const t = (k) => window.I18N.t(k);
    const rl = (k) => (RL[k] ? RL[k][il] : k);
    const can = window.can;
    const st = window.App.state || {};
    const hotels = (st.options && st.options.division) || [];
    const avail = REPORTS.filter((r) => can(r.perm));
    const opt = (v, txt, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${txt}</option>`;
    content.innerHTML = `
      <div class="page-head"><div><h2>${t('reports_center')}</h2>
        <div class="sub">${il === 'ar' ? 'تقارير رسمية جاهزة للطباعة و PDF — بترويسة المجموعة ورمز QR وترقيم الصفحات.' : 'Official, print-ready PDF reports — group letterhead, QR code and page numbers.'}</div></div></div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-body">
        <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end">
          <div class="fl" style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;font-weight:700;color:var(--muted)">${il === 'ar' ? 'لغة التقرير' : 'Report language'}</label>
            <select id="repLang" class="field" style="margin:0;min-width:150px">${opt('ar', 'العربية', il === 'ar')}${opt('en', 'English', il === 'en')}</select></div>
          <div class="fl" style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;font-weight:700;color:var(--muted)">${il === 'ar' ? 'اتجاه الصفحة' : 'Orientation'}</label>
            <select id="repOrient" class="field" style="margin:0;min-width:150px">${opt('auto', il === 'ar' ? 'تلقائي (حسب التقرير)' : 'Auto (per report)', true)}${opt('portrait', il === 'ar' ? 'طولي' : 'Portrait')}${opt('landscape', il === 'ar' ? 'عرضي' : 'Landscape')}</select></div>
          <div class="fl" style="display:flex;flex-direction:column;gap:4px"><label style="font-size:11px;font-weight:700;color:var(--muted)">${t('hotel')}</label>
            <select id="repHotel" class="field" style="margin:0;min-width:180px">${opt('', t('all_hotels'), true)}${hotels.map((h) => opt(fmt.esc(h), fmt.esc(h))).join('')}</select></div>
        </div></div></div>
      <div class="kpi-grid">${avail.map((r) => `
        <div class="panel" style="cursor:default"><div class="panel-body" style="display:flex;flex-direction:column;gap:8px;min-height:150px">
          <div style="display:flex;align-items:center;gap:10px"><span class="k-ico" style="width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:var(--panel-2);border:1px solid var(--line);color:var(--teal-700)">${cardIcon(r.icon)}</span>
            <b style="font-size:14.5px;color:var(--teal-800)">${fmt.esc(rl('t_' + r.id))}</b></div>
          <div style="font-size:12px;color:var(--muted);flex:1">${fmt.esc((DESC[r.id] || {})[il] || '')}</div>
          <button class="btn btn-primary" data-report="${r.id}" style="width:100%;justify-content:center">${cardIcon('printer')} ${t('preview_print')}</button>
        </div></div>`).join('')}</div>`;
    if (!st.hasData) { content.querySelectorAll('[data-report]').forEach((b) => { b.disabled = true; b.style.opacity = '.5'; }); }
    content.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', () => {
      const orientSel = content.querySelector('#repOrient').value;
      const rep = REPORTS.find((x) => x.id === b.dataset.report);
      window.Report.open(b.dataset.report, {
        lang: content.querySelector('#repLang').value,
        orient: orientSel === 'auto' ? rep.orient : orientSel,
        division: content.querySelector('#repHotel').value,
      });
    }));
  };
})();
