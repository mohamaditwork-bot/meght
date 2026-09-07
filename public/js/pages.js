/* pages.js — all dashboard/page renderers. */
(function () {
  const api = (p, o) => App.api(p, o);
  const qs = (e) => App.qs(e);
  const el = (id) => document.getElementById(id);
  const afterPaint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const Pages = {};
  window.Pages = Pages;

  // ---------- shared UI ----------
  function kpi(o) {
    const delta = o.delta != null ? `<span class="k-delta ${o.delta >= 0 ? 'up' : 'down'}">${o.delta >= 0 ? '▲' : '▼'} ${fmt.n(Math.abs(o.delta), o.deltaDec || 0)}${o.deltaSuffix || ''}</span>` : '';
    return `<div class="kpi ${o.accent ? 'accent-' + o.accent : ''}">
      <div class="k-top"><span class="k-label">${o.label}</span>${o.ico ? `<span class="k-ico">${o.ico}</span>` : ''}</div>
      <div class="k-val">${o.value}</div>
      <div class="k-sub">${delta}${o.sub || ''}</div></div>`;
  }
  function panel(title, bodyId, opts = {}) {
    return `<div class="panel ${opts.cls || ''}"><div class="panel-head"><h3>${title}</h3>${opts.sub ? `<span class="p-sub">${opts.sub}</span>` : ''}${opts.action || ''}</div><div class="panel-body">${opts.body || `<div id="${bodyId}" class="chart ${opts.chartCls || ''}"></div>`}</div></div>`;
  }
  function emptyState() {
    return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 5h16M4 12h16M4 19h10"/></svg>
      <h3>لا توجد بيانات بعد</h3><p>ابدأ برفع أول ملف Excel شهري لتفعيل جميع التحليلات والمؤشرات.</p>
      ${can('upload_data') ? '<a href="#/upload" class="btn btn-primary" style="margin-top:14px">⬆️ رفع ملف Excel</a>' : '<p style="margin-top:10px">تواصل مع مدير الموارد البشرية لرفع البيانات.</p>'}</div>`;
  }
  function head(title, sub, actions) {
    return `<div class="page-head"><div><h2>${title}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div><div class="ph-actions no-print">${actions || ''}</div></div>`;
  }
  function printBtn() { return `<button class="btn" onclick="Pages.printCurrent()">🖨️ طباعة</button>`; }
  function excelBtn(fn) { return `<button class="btn" data-excel="${fn}">📊 تصدير Excel</button>`; }

  // Print chrome (logo header + footer), only visible when printing.
  function printChrome(title) {
    const s = App.state;
    const now = new Date();
    const filters = Object.entries(App.filters).filter(([k, v]) => v).map(([k, v]) => {
      const L = { period: 'الفترة', division: 'المنشأة', department: 'القسم', position: 'المسمى', nationality: 'الجنسية', level: 'الدرجة', gender: 'الجنس', saudi: 'التصنيف' }[k] || k;
      let dv = v; if (k === 'period') { const sn = (s.snapshots || []).find((x) => x.id === v); dv = sn ? sn.periodLabel : v; }
      return `${L}: ${dv}`;
    }).join(' · ') || 'لا يوجد';
    const period = s.active ? (s.active.periodLabel || s.active.period) : '—';
    return `<div class="print-header">
      <img src="assets/logo.svg" alt="MAYSAN INT. GROUP">
      <div class="pr-title"><h1>${title}</h1>
        <div class="pr-meta">مجموعة ميسان الدولية · تقرير الموارد البشرية<br>
        الفترة: ${period} · الفلاتر: ${fmt.esc(filters)}<br>
        آخر تحديث للبيانات: ${s.active ? fmt.date(s.active.asOf) : '—'} · تاريخ الإصدار: ${now.toLocaleDateString('ar-EG')} ${now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
      </div></div>`;
  }
  function printFooter() {
    return `<div class="print-footer"><span>MAYSAN INT. GROUP — HR Intelligence Platform</span><span>وثيقة سرّية · للاستخدام الداخلي فقط</span></div>`;
  }
  Pages.printCurrent = function () {
    const c = el('content');
    if (!c.querySelector('.print-header')) {
      const title = c.querySelector('.page-head h2')?.textContent || 'تقرير الموارد البشرية';
      c.insertAdjacentHTML('afterbegin', printChrome(title));
      c.insertAdjacentHTML('beforeend', printFooter());
    }
    Chart.resizeAll();
    setTimeout(() => window.print(), 250);
  };
  function bindExcel(root, dataFn) {
    root.querySelectorAll('[data-excel]').forEach((b) => b.addEventListener('click', () => dataFn(b.dataset.excel)));
  }
  function exportRows(rows, sheet, file) {
    if (!window.XLSX) { toast('مكتبة التصدير غير جاهزة', 'err'); return; }
    const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 30)); XLSX.writeFile(wb, file);
    toast('تم تصدير الملف', 'ok');
  }
  Pages.exportRows = exportRows;

  function complianceStatus(days) {
    if (days == null) return '<span class="badge b-muted">غير متوفر</span>';
    if (days < 0) return '<span class="badge b-danger">منتهية</span>';
    if (days <= 30) return '<span class="badge b-warn">تنتهي قريباً</span>';
    if (days <= 90) return '<span class="badge b-watch">قيد المتابعة</span>';
    return '<span class="badge b-ok">سارية</span>';
  }

  function noData(content) { content.innerHTML = head('لا توجد بيانات') + emptyState(); }

  // ========== DASHBOARD ==========
  Pages.dashboard = async function (content) {
    const st = App.state;
    if (!st.hasData) return noData(content);
    const [k, sum, wf] = await Promise.all([
      api('/api/kpis' + qs()), api('/api/summary' + qs()),
      can('view_workforce') ? api('/api/workforce' + qs()) : Promise.resolve(null),
    ]);
    const d = k.kpis;
    content.innerHTML = head('لوحة القيادة التنفيذية', 'نظرة شاملة على القوى العاملة — ' + (st.active.periodLabel || ''), printBtn()) +
      `<div class="kpi-grid">
        ${kpi({ label: 'إجمالي الموظفين', value: fmt.n(d.total_employees), accent: 'teal', ico: '👥', sub: `${fmt.n(d.divisions)} منشأة` })}
        ${kpi({ label: 'الموظفون السعوديون', value: fmt.n(d.saudi_employees), accent: 'green', ico: '🇸🇦', sub: `نسبة ${fmt.pct(d.saudi_pct)}` })}
        ${kpi({ label: 'غير السعوديين', value: fmt.n(d.non_saudi_employees), accent: 'teal', ico: '🌍', sub: `${fmt.n(d.nationalities)} جنسية` })}
        ${kpi({ label: 'نسبة السعودة الداخلية', value: fmt.pct(d.saudi_pct), accent: 'green', ico: '📊', sub: 'محسوبة من الملف' })}
        ${kpi({ label: 'الأقسام', value: fmt.n(d.departments), accent: 'blue', ico: '🏢' })}
        ${kpi({ label: 'المسميات الوظيفية', value: fmt.n(d.positions), accent: 'blue', ico: '💼' })}
        ${kpi({ label: 'ذكور', value: fmt.n(d.male_employees), accent: 'teal', ico: '👨', sub: d.gender_unknown ? `${fmt.n(d.gender_unknown)} غير محدد` : '' })}
        ${kpi({ label: 'إناث', value: fmt.n(d.female_employees), accent: 'green', ico: '👩' })}
        ${can('view_salary') ? kpi({ label: 'إجمالي الرواتب', value: fmt.moneyPlain(d.total_payroll), accent: 'amber', ico: '💰' }) : ''}
        ${can('view_salary') ? kpi({ label: 'متوسط الراتب', value: fmt.moneyPlain(d.average_salary), accent: 'amber', ico: '📈' }) : ''}
        ${kpi({ label: 'رصيد الإجازات السنوية', value: fmt.days(d.annual_balance_total), accent: 'teal', ico: '🏖️', sub: `متوسط ${fmt.days(d.annual_balance_avg)}` })}
        ${kpi({ label: 'رصيد الـHoliday', value: fmt.days(d.holiday_balance_total), accent: 'teal', ico: '📆' })}
        ${kpi({ label: 'وثائق تنتهي قريباً', value: fmt.n(d.documents_expiring_soon), accent: 'red', ico: '⏳', sub: 'خلال 90 يوم' })}
        ${kpi({ label: 'عقود تنتهي قريباً', value: fmt.n(d.contracts_expiring_soon), accent: 'red', ico: '📝', sub: 'خلال 90 يوم' })}
      </div>
      <div class="grid g-3" style="margin-bottom:16px">
        <div id="execSummary" class="exec col-span-2"></div>
        <div class="panel"><div class="panel-head"><h3>نسبة السعودة الداخلية</h3></div><div class="panel-body"><div id="saudiGauge" class="chart sm"></div><div style="text-align:center;color:var(--muted);font-size:12px;margin-top:-8px">${fmt.n(d.saudi_employees)} سعودي من ${fmt.n(d.total_employees)}</div></div></div>
      </div>
      ${wf ? `<div class="grid g-3">
        ${panel('التوزيع حسب الجنس', 'chGender', { chartCls: 'sm' })}
        ${panel('أكبر الأقسام', 'chDept', { chartCls: 'sm' })}
        ${panel('أعلى الجنسيات', 'chNat', { chartCls: 'sm' })}
      </div>` : ''}`;
    afterPaint(() => {
      Chart.gauge(el('saudiGauge'), d.saudi_pct, { pct: true, dec: 2, target: 100 });
      renderExec(el('execSummary'), sum.summary);
      if (wf) {
        Chart.donut(el('chGender'), [{ name: 'ذكور', value: d.male_employees }, { name: 'إناث', value: d.female_employees }].concat(d.gender_unknown ? [{ name: 'غير محدد', value: d.gender_unknown }] : []), { colors: ['#0e5a5a', '#16a34a', '#cbd5e1'], center: fmt.n(d.total_employees), centerSub: 'موظف' });
        const dept = wf.bySection.slice(0, 8);
        Chart.barH(el('chDept'), dept.map((g) => g.key), dept.map((g) => g.total), { showLabel: true });
        const nat = wf.byNationality.slice(0, 8);
        Chart.donut(el('chNat'), nat.map((g) => ({ name: g.key, value: g.total })));
      }
    });
  };
  function renderExec(node, sections) {
    node.innerHTML = `<h3>🧠 الملخّص التنفيذي الذكي</h3>` + sections.map((s) => {
      if (s.items) return `<div class="es-item"><div class="es-t">${s.title}</div><ul>${s.items.map((i) => `<li>${fmt.esc(i)}</li>`).join('')}</ul></div>`;
      return `<div class="es-item"><div class="es-t">${s.title}</div><div class="es-x">${fmt.esc(s.text)}</div></div>`;
    }).join('');
  }

  // ========== INSIGHTS ==========
  Pages.insights = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/insights' + qs());
    const list = r.insights || [];
    const groups = { critical: [], high: [], medium: [], low: [] };
    list.forEach((i) => groups[i.severity].push(i));
    content.innerHTML = head('رؤى الذكاء الاصطناعي', 'ملاحظات مبنية على أرقام فعلية من البيانات — بدون تعميمات', printBtn()) +
      `<div class="kpi-grid">
        ${kpi({ label: 'حرجة', value: fmt.n(groups.critical.length), accent: 'red', ico: '🔴' })}
        ${kpi({ label: 'عالية', value: fmt.n(groups.high.length), accent: 'amber', ico: '🟠' })}
        ${kpi({ label: 'متوسطة', value: fmt.n(groups.medium.length), accent: 'blue', ico: '🔵' })}
        ${kpi({ label: 'منخفضة', value: fmt.n(groups.low.length), accent: 'teal', ico: '⚪' })}
      </div>
      <div class="panel"><div class="panel-body">${list.length ? list.map((i) => `<div class="insight ${i.severity}"><div class="dot"></div><div><div class="i-cat">${fmt.esc(i.category)}</div><div class="i-t">${fmt.esc(i.title)}</div><div class="i-d">${fmt.esc(i.detail)}</div></div></div>`).join('') : '<div class="empty"><h3>لا توجد ملاحظات جوهرية</h3><p>البيانات ضمن المعدلات الطبيعية.</p></div>'}</div></div>`;
  };

  // ========== WORKFORCE ==========
  Pages.workforce = async function (content) {
    if (!App.state.hasData) return noData(content);
    const wf = await api('/api/workforce' + qs());
    const d = wf.kpis;
    content.innerHTML = head('تحليلات القوى العاملة', 'التوزيع والتركيبة الوظيفية', printBtn() + excelBtn('sections')) +
      `<div class="kpi-grid">
        ${kpi({ label: 'إجمالي', value: fmt.n(d.total_employees), accent: 'teal', ico: '👥' })}
        ${kpi({ label: 'الأقسام', value: fmt.n(d.departments), accent: 'blue', ico: '🏢' })}
        ${kpi({ label: 'المسميات', value: fmt.n(d.positions), accent: 'blue', ico: '💼' })}
        ${kpi({ label: 'الجنسيات', value: fmt.n(d.nationalities), accent: 'green', ico: '🌍' })}
        ${kpi({ label: 'الدرجات', value: fmt.n(d.levels), accent: 'teal', ico: '🪜' })}
        ${kpi({ label: 'المنشآت', value: fmt.n(d.divisions), accent: 'teal', ico: '🏨' })}
      </div>
      <div class="grid g-2">
        ${panel('التوزيع حسب القسم (سعودي / غير سعودي)', 'chSecStack', { chartCls: 'lg', sub: 'اضغط شريطاً للتصفية' })}
        ${panel('التوزيع حسب المسمى الوظيفي', 'chPos', { chartCls: 'lg' })}
        ${panel('التوزيع حسب الجنسية', 'chNat')}
        ${panel('التوزيع حسب الدرجة الوظيفية', 'chLvl')}
        ${panel('خريطة الأقسام (Treemap)', 'chTree', { chartCls: 'lg' })}
        ${panel('التوزيع حسب المنشأة والجنس', 'chDiv')}
      </div>`;
    afterPaint(() => {
      const sec = wf.bySection.slice(0, 12);
      Chart.stacked(el('chSecStack'), sec.map((g) => g.key), [
        { name: 'سعودي', data: sec.map((g) => g.saudi), color: '#16a34a' },
        { name: 'غير سعودي', data: sec.map((g) => g.non_saudi), color: '#0e5a5a' },
      ], { horizontal: true, labelWidth: 100 });
      const secChart = Chart.render;
      // clickable stacked -> filter by department
      const inst = echarts.getInstanceByDom(el('chSecStack'));
      inst && inst.on('click', (p) => { App.filters.department = sec[p.dataIndex]?.key; window.route(); });
      const pos = wf.byPosition.slice(0, 12);
      Chart.barH(el('chPos'), pos.map((g) => g.key), pos.map((g) => g.total), { showLabel: true, labelWidth: 130 });
      Chart.donut(el('chNat'), wf.byNationality.slice(0, 10).map((g) => ({ name: g.key, value: g.total })));
      Chart.barV(el('chLvl'), wf.byLevel.map((g) => g.key), wf.byLevel.map((g) => g.total));
      Chart.treemap(el('chTree'), wf.bySection.map((g) => ({ name: g.key, value: g.total })));
      Chart.stacked(el('chDiv'), wf.byDivision.map((g) => g.key), [
        { name: 'ذكور', data: wf.byDivision.map((g) => g.male), color: '#0e5a5a' },
        { name: 'إناث', data: wf.byDivision.map((g) => g.female), color: '#34c759' },
      ]);
    });
    bindExcel(content, () => exportRows(wf.bySection.map((g) => ({ 'القسم': g.key, 'الإجمالي': g.total, 'سعودي': g.saudi, 'غير سعودي': g.non_saudi, 'نسبة السعودة%': +g.saudi_pct.toFixed(2), 'ذكور': g.male, 'إناث': g.female })), 'workforce', 'workforce-by-section.xlsx'));
  };

  // ========== SAUDIZATION ==========
  Pages.saudization = async function (content) {
    if (!App.state.hasData) return noData(content);
    const s = await api('/api/saudization' + qs());
    const o = s.overall;
    content.innerHTML = head('السعودة والتوطين', 'تمييز واضح بين النسبة الداخلية المحسوبة والهدف الرسمي', printBtn()) +
      `<div class="data-note">⚠️ النسبة المعروضة هنا هي <b>نسبة السعودة الداخلية</b> المحسوبة رياضياً من ملف Excel (السعوديون ÷ الإجمالي). أما <b>الهدف الرسمي للتوطين</b> فلا يُفترض ولا يُخترع، ويُجلب فقط من قرار موثّق في «مركز قرارات التوطين».</div>
      <div class="kpi-grid">
        ${kpi({ label: 'إجمالي الموظفين', value: fmt.n(o.total), accent: 'teal', ico: '👥' })}
        ${kpi({ label: 'السعوديون', value: fmt.n(o.saudi), accent: 'green', ico: '🇸🇦' })}
        ${kpi({ label: 'غير السعوديين', value: fmt.n(o.non_saudi), accent: 'teal', ico: '🌍' })}
        ${kpi({ label: 'نسبة السعودة الداخلية', value: fmt.pct(o.saudi_pct), accent: 'green', ico: '📊' })}
        ${kpi({ label: 'قرارات توطين مفعّلة', value: fmt.n(s.rulesCount), accent: 'blue', ico: '⚖️', sub: s.rulesCount ? '' : 'أضِفها من مركز القرارات' })}
      </div>
      <div class="grid g-2">
        ${panel('نسبة السعودة حسب القسم', 'chSecSaudi', { chartCls: 'lg' })}
        ${panel('نسبة السعودة حسب الدرجة', 'chLvlSaudi', { chartCls: 'lg' })}
      </div>
      <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>تحليل فجوة التوطين حسب المسمى</h3><span class="p-sub">الهدف الرسمي يظهر فقط للمسميات التي ينطبق عليها قرار موثّق</span></div><div class="panel-body tbl-wrap">
        <table class="tbl responsive-cards"><thead><tr><th>المسمى</th><th>سعودي</th><th>غير سعودي</th><th>النسبة الحالية</th><th>الهدف الرسمي</th><th>الفجوة</th><th>سعوديون مطلوبون</th><th>الحالة</th></tr></thead><tbody>
        ${s.byPosition.map((g) => `<tr>
          <td data-l="المسمى"><b>${fmt.esc(g.key)}</b></td>
          <td data-l="سعودي" class="num">${fmt.n(g.saudi)}</td>
          <td data-l="غير سعودي" class="num">${fmt.n(g.total - g.saudi)}</td>
          <td data-l="الحالية" class="num">${fmt.pct(g.current_pct)}</td>
          <td data-l="الهدف">${g.required_pct == null ? '<span class="badge b-muted" title="' + fmt.esc(g.note || '') + '">غير محدّد رسمياً</span>' : fmt.pct(g.required_pct, 0)}</td>
          <td data-l="الفجوة" class="num">${g.gap_pct == null ? '—' : fmt.pct(g.gap_pct)}</td>
          <td data-l="مطلوب" class="num">${g.required_additional_saudi == null ? '—' : fmt.n(g.required_additional_saudi)}</td>
          <td data-l="الحالة">${gapBadge(g.compliance, g.compliance_label)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    afterPaint(() => {
      const sec = s.bySection.slice(0, 14);
      Chart.barH(el('chSecSaudi'), sec.map((g) => g.key), sec.map((g) => +g.saudi_pct.toFixed(1)), { showLabel: true, suffix: '%', labelWidth: 110, color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#15803d' }, { offset: 1, color: '#34c759' }]) });
      Chart.barV(el('chLvlSaudi'), s.byLevel.map((g) => g.key), s.byLevel.map((g) => +g.saudi_pct.toFixed(1)), { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#34c759' }, { offset: 1, color: '#15803d' }]) });
    });
  };
  function gapBadge(c, label) {
    const m = { compliant: 'b-ok', near: 'b-watch', below: 'b-warn', critical: 'b-danger', unknown: 'b-muted' };
    return `<span class="badge ${m[c] || 'b-muted'}">${fmt.esc(label)}</span>`;
  }

  // ========== NATIONALITY ==========
  Pages.nationality = async function (content) {
    if (!App.state.hasData) return noData(content);
    const n = await api('/api/nationality' + qs());
    const topNonSaudi = n.groups.find((g) => !/سعودي|السعودية/.test(g.key) && g.key !== '— غير محدد —');
    content.innerHTML = head('تحليلات الجنسيات', `${fmt.n(n.distinct)} جنسية مختلفة`, printBtn() + excelBtn('nat')) +
      `<div class="kpi-grid">
        ${kpi({ label: 'عدد الجنسيات', value: fmt.n(n.distinct), accent: 'green', ico: '🌍' })}
        ${kpi({ label: 'إجمالي الموظفين', value: fmt.n(n.total), accent: 'teal', ico: '👥' })}
        ${topNonSaudi ? kpi({ label: 'أعلى جنسية غير سعودية', value: fmt.esc(topNonSaudi.key), accent: 'amber', ico: '🔝', sub: `${fmt.n(topNonSaudi.total)} موظف (${fmt.pct(topNonSaudi.pct)})` }) : ''}
      </div>
      <div class="grid g-2">
        ${panel('توزيع الجنسيات', 'chNatPie', { chartCls: 'lg' })}
        ${panel('أعلى الجنسيات (عدد الموظفين)', 'chNatBar', { chartCls: 'lg' })}
      </div>
      ${panel('خريطة حرارية: الجنسية × القسم', 'chNatHeat', { chartCls: 'lg', cls: 'col-span-2' })}
      <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>تفصيل الجنسيات</h3><span class="p-sub">اضغط على أي جنسية لعرض موظفيها</span></div><div class="panel-body tbl-wrap">
        <table class="tbl clickable responsive-cards"><thead><tr><th>الجنسية</th><th>العدد</th><th>النسبة</th><th>ذكور</th><th>إناث</th><th>الأقسام</th></tr></thead><tbody>
        ${n.groups.map((g) => `<tr data-nat="${fmt.esc(g.key)}"><td data-l="الجنسية"><b>${fmt.esc(g.key)}</b></td><td data-l="العدد" class="num">${fmt.n(g.total)}</td><td data-l="النسبة"><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${g.pct}%"></i></div><span class="num">${fmt.pct(g.pct)}</span></div></td><td data-l="ذكور" class="num">${fmt.n(g.male)}</td><td data-l="إناث" class="num">${fmt.n(g.female)}</td><td data-l="الأقسام" class="num">${fmt.n(g.positions)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    afterPaint(() => {
      Chart.donut(el('chNatPie'), n.groups.slice(0, 12).map((g) => ({ name: g.key, value: g.total })), { center: fmt.n(n.distinct), centerSub: 'جنسية' });
      const top = n.groups.slice(0, 12);
      Chart.barH(el('chNatBar'), top.map((g) => g.key), top.map((g) => g.total), { showLabel: true });
      const ct = n.bySectionCross;
      const cols = ct.cols.slice(0, 14), rows = ct.rows.slice(0, 12);
      const data = ct.data.filter((d) => cols.includes(d.col) && rows.includes(d.row)).map((d) => [cols.indexOf(d.col), rows.indexOf(d.row), d.value]);
      Chart.heatmap(el('chNatHeat'), rows, cols, data);
    });
    content.querySelectorAll('tr[data-nat]').forEach((tr) => tr.addEventListener('click', () => showNationalityEmployees(tr.dataset.nat)));
    bindExcel(content, () => exportRows(n.groups.map((g) => ({ 'الجنسية': g.key, 'العدد': g.total, 'النسبة%': +g.pct.toFixed(2), 'ذكور': g.male, 'إناث': g.female })), 'nationalities', 'nationalities.xlsx'));
  };
  async function showNationalityEmployees(nat) {
    const r = await api('/api/employees' + App.qs({ nationality: nat }));
    const emps = (r.employees || []);
    const m = modal(`<div class="modal-head"><h3>موظفو جنسية: ${fmt.esc(nat)} (${fmt.n(emps.length)})</h3><button class="modal-close">✕</button></div><div class="modal-body tbl-wrap"><table class="tbl clickable"><thead><tr><th>الرقم</th><th>الاسم</th><th>القسم</th><th>المسمى</th></tr></thead><tbody>${emps.map((e) => `<tr data-code="${fmt.esc(e.employee_code)}"><td class="num">${fmt.esc(e.employee_code)}</td><td>${fmt.esc(e.arabic_name || e.name)}</td><td>${fmt.esc(e.section)}</td><td>${fmt.esc(e.position)}</td></tr>`).join('')}</tbody></table></div>`);
    m.root.querySelectorAll('tr[data-code]').forEach((tr) => tr.addEventListener('click', () => { m.close(); location.hash = '#/employee/' + tr.dataset.code; }));
  }

  // ========== DEPARTMENTS ==========
  Pages.departments = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/departments' + qs());
    content.innerHTML = head('تحليلات الأقسام', `${fmt.n(r.departments.length)} قسم`, printBtn() + excelBtn('dept')) +
      `<div class="grid g-2">${panel('عدد الموظفين حسب القسم', 'chDeptCount', { chartCls: 'lg' })}${panel('نسبة السعودة حسب القسم', 'chDeptSaudi', { chartCls: 'lg' })}</div>
      <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>لوحات الأقسام</h3><span class="p-sub">اضغط على أي قسم لفتح لوحته التفصيلية</span></div><div class="panel-body tbl-wrap">
      <table class="tbl clickable responsive-cards"><thead><tr><th>القسم</th><th>الموظفون</th><th>سعودي</th><th>السعودة</th><th>ذكور/إناث</th><th>المسميات</th>${can('view_salary') ? '<th>متوسط الراتب</th>' : ''}<th>عقود تنتهي</th><th>تحت التجربة</th></tr></thead><tbody>
      ${r.departments.map((g) => `<tr data-dept="${fmt.esc(g.key)}"><td data-l="القسم"><b>${fmt.esc(g.key)}</b></td><td data-l="الموظفون" class="num">${fmt.n(g.total)}</td><td data-l="سعودي" class="num">${fmt.n(g.saudi)}</td><td data-l="السعودة"><div style="display:flex;align-items:center;gap:8px"><div class="bar ${g.saudi_pct < 20 ? 'red' : g.saudi_pct < 40 ? 'amber' : ''}" style="flex:1"><i style="width:${g.saudi_pct}%"></i></div><span class="num">${fmt.pct(g.saudi_pct)}</span></div></td><td data-l="ذكور/إناث" class="num">${fmt.n(g.male)}/${fmt.n(g.female)}</td><td data-l="المسميات" class="num">${fmt.n(g.positions)}</td>${can('view_salary') ? `<td data-l="متوسط الراتب" class="num">${fmt.moneyPlain(g.avg_salary)}</td>` : ''}<td data-l="عقود تنتهي" class="num">${fmt.n(g.contracts_expiring)}</td><td data-l="تحت التجربة" class="num">${fmt.n(g.probation)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    afterPaint(() => {
      const d = r.departments.slice(0, 14);
      Chart.barH(el('chDeptCount'), d.map((g) => g.key), d.map((g) => g.total), { showLabel: true, labelWidth: 110 });
      Chart.barH(el('chDeptSaudi'), d.map((g) => g.key), d.map((g) => +g.saudi_pct.toFixed(1)), { suffix: '%', showLabel: true, labelWidth: 110, color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#15803d' }, { offset: 1, color: '#34c759' }]) });
    });
    content.querySelectorAll('tr[data-dept]').forEach((tr) => tr.addEventListener('click', () => showDepartment(tr.dataset.dept)));
    bindExcel(content, () => exportRows(r.departments.map((g) => ({ 'القسم': g.key, 'الموظفون': g.total, 'سعودي': g.saudi, 'غير سعودي': g.non_saudi, 'السعودة%': +g.saudi_pct.toFixed(2), 'المسميات': g.positions })), 'departments', 'departments.xlsx'));
  };
  async function showDepartment(name) {
    const r = await api('/api/department/' + encodeURIComponent(name) + (App.filters.period ? '?period=' + App.filters.period : ''));
    const k = r.kpis;
    const m = modal(`<div class="modal-head"><h3>🏢 ${fmt.esc(name)}</h3><button class="modal-close">✕</button></div><div class="modal-body">
      <div class="mini-kpis" style="margin-bottom:16px">
        <div class="mini-kpi"><div class="m-l">الموظفون</div><div class="m-v">${fmt.n(k.total_employees)}</div></div>
        <div class="mini-kpi"><div class="m-l">سعودي</div><div class="m-v">${fmt.n(k.saudi_employees)}</div></div>
        <div class="mini-kpi"><div class="m-l">السعودة</div><div class="m-v">${fmt.pct(k.saudi_pct)}</div></div>
        <div class="mini-kpi"><div class="m-l">ذكور</div><div class="m-v">${fmt.n(k.male_employees)}</div></div>
        <div class="mini-kpi"><div class="m-l">إناث</div><div class="m-v">${fmt.n(k.female_employees)}</div></div>
        <div class="mini-kpi"><div class="m-l">المسميات</div><div class="m-v">${fmt.n(k.positions)}</div></div>
        ${can('view_salary') ? `<div class="mini-kpi"><div class="m-l">متوسط الراتب</div><div class="m-v" style="font-size:15px">${fmt.moneyPlain(k.average_salary)}</div></div><div class="mini-kpi"><div class="m-l">إجمالي الرواتب</div><div class="m-v" style="font-size:14px">${fmt.moneyPlain(k.total_payroll)}</div></div>` : ''}
        <div class="mini-kpi"><div class="m-l">متوسط الإجازة</div><div class="m-v" style="font-size:15px">${fmt.days(k.annual_balance_avg)}</div></div>
        <div class="mini-kpi"><div class="m-l">تحت التجربة</div><div class="m-v">${fmt.n(r.probation)}</div></div>
      </div>
      <div class="grid g-2"><div class="panel"><div class="panel-head"><h3>حسب المسمى</h3></div><div class="panel-body"><div id="dmPos" class="chart sm"></div></div></div>
      <div class="panel"><div class="panel-head"><h3>حسب الجنسية</h3></div><div class="panel-body"><div id="dmNat" class="chart sm"></div></div></div></div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl clickable"><thead><tr><th>الرقم</th><th>الاسم</th><th>المسمى</th><th>الجنسية</th><th>الدرجة</th></tr></thead><tbody>
      ${r.employees.map((e) => `<tr data-code="${fmt.esc(e.employee_code)}"><td class="num">${fmt.esc(e.employee_code)}</td><td>${fmt.esc(e.arabic_name || e.name)}</td><td>${fmt.esc(e.position)}</td><td>${fmt.esc(e.nationality)}</td><td>${fmt.esc(e.level_code)}</td></tr>`).join('')}
      </tbody></table></div></div>`);
    afterPaint(() => {
      Chart.barH(el('dmPos'), r.byPosition.slice(0, 8).map((g) => g.key), r.byPosition.slice(0, 8).map((g) => g.total), { showLabel: true, labelWidth: 90 });
      Chart.donut(el('dmNat'), r.byNationality.slice(0, 8).map((g) => ({ name: g.key, value: g.total })));
    });
    m.root.querySelectorAll('tr[data-code]').forEach((tr) => tr.addEventListener('click', () => { m.close(); location.hash = '#/employee/' + tr.dataset.code; }));
  }

  // ========== JOB TITLES ==========
  Pages.jobtitles = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/jobtitles' + qs());
    content.innerHTML = head('المسميات الوظيفية', `${fmt.n(r.positions.length)} مسمى`, printBtn() + excelBtn('jt')) +
      `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>بحث سريع في المسميات</h3></div><div class="panel-body"><input id="jtSearch" class="field" style="margin:0" placeholder="اكتب اسم المسمى…" /></div></div>
      <div class="panel"><div class="panel-body tbl-wrap"><table class="tbl responsive-cards" id="jtTable"><thead><tr><th>المسمى</th><th>الموظفون</th><th>سعودي</th><th>غير سعودي</th><th>السعودة</th>${can('view_salary') ? '<th>متوسط الراتب</th><th>الأدنى</th><th>الأعلى</th>' : ''}<th>متوسط الإجازة</th></tr></thead><tbody>
      ${r.positions.map((g) => `<tr data-name="${fmt.esc(g.key)}"><td data-l="المسمى"><b>${fmt.esc(g.key)}</b></td><td data-l="الموظفون" class="num">${fmt.n(g.total)}</td><td data-l="سعودي" class="num">${fmt.n(g.saudi)}</td><td data-l="غير سعودي" class="num">${fmt.n(g.non_saudi)}</td><td data-l="السعودة" class="num">${fmt.pct(g.saudi_pct)}</td>${can('view_salary') ? `<td data-l="متوسط" class="num">${fmt.moneyPlain(g.avg_salary)}</td><td data-l="الأدنى" class="num">${fmt.moneyPlain(g.min_salary)}</td><td data-l="الأعلى" class="num">${fmt.moneyPlain(g.max_salary)}</td>` : ''}<td data-l="الإجازة" class="num">${fmt.days(g.annual_avg)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    el('jtSearch').addEventListener('input', (e) => {
      const t = e.target.value.trim();
      content.querySelectorAll('#jtTable tbody tr').forEach((tr) => { tr.style.display = tr.dataset.name.includes(t) ? '' : 'none'; });
    });
    bindExcel(content, () => exportRows(r.positions.map((g) => ({ 'المسمى': g.key, 'الموظفون': g.total, 'سعودي': g.saudi, 'غير سعودي': g.non_saudi, 'السعودة%': +g.saudi_pct.toFixed(2), 'متوسط الإجازة': +(g.annual_avg || 0).toFixed(2) })), 'job-titles', 'job-titles.xlsx'));
  };

  // ========== LEAVE ==========
  Pages.leave = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/leave' + qs());
    const k = r.kpis;
    content.innerHTML = head('الإجازات والأرصدة', 'تحليل رصيد الإجازة السنوية والـHoliday — بقيم دقيقة', printBtn()) +
      `<div class="data-note">ℹ️ يتم عرض الأرصدة بمنزلتين عشريتين (مثل 34.88 يوم) للعرض فقط، بينما يحتفظ النظام بالقيمة الأصلية الدقيقة للحساب. الرصيد السنوي والـHoliday يُعرضان منفصلين ولا يُدمجان.</div>
      <div class="kpi-grid">
        ${kpi({ label: 'إجمالي الرصيد السنوي', value: fmt.days(k.annual_total), accent: 'teal', ico: '🏖️' })}
        ${kpi({ label: 'متوسط الرصيد السنوي', value: fmt.days(k.annual_avg), accent: 'green', ico: '📊' })}
        ${kpi({ label: 'أعلى رصيد سنوي', value: fmt.days(k.annual_max), accent: 'amber', ico: '🔝' })}
        ${kpi({ label: 'أقل رصيد سنوي', value: fmt.days(k.annual_min), accent: 'blue', ico: '🔻' })}
        ${kpi({ label: 'إجمالي رصيد الـHoliday', value: fmt.days(k.holiday_total), accent: 'teal', ico: '📆' })}
        ${kpi({ label: 'متوسط الـHoliday', value: fmt.days(k.holiday_avg), accent: 'green', ico: '📆' })}
      </div>
      <div class="grid g-2">
        ${panel('أعلى 10 موظفين — الرصيد السنوي', 'chTopAnnual', { chartCls: 'lg' })}
        ${panel('أعلى 10 موظفين — رصيد الـHoliday', 'chTopHoliday', { chartCls: 'lg' })}
        ${panel('متوسط الرصيد السنوي حسب القسم', 'chLeaveSec')}
        ${panel('الرصيد السنوي حسب مدة الخدمة', 'chLeaveTenure')}
      </div>`;
    afterPaint(() => {
      Chart.barH(el('chTopAnnual'), r.topAnnual.map((e) => e.name || e.code), r.topAnnual.map((e) => +e.value.toFixed(2)), { showLabel: true, suffix: ' يوم', labelWidth: 120 });
      Chart.barH(el('chTopHoliday'), r.topHoliday.map((e) => e.name || e.code), r.topHoliday.map((e) => +e.value.toFixed(2)), { showLabel: true, suffix: ' يوم', labelWidth: 120, color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#0891b2' }, { offset: 1, color: '#22d3ee' }]) });
      const sec = r.bySection.slice(0, 12);
      Chart.barH(el('chLeaveSec'), sec.map((g) => g.key), sec.map((g) => +(g.avg || 0).toFixed(2)), { suffix: ' يوم', labelWidth: 110 });
      Chart.barV(el('chLeaveTenure'), r.byTenure.map((b) => b.label), r.byTenure.map((b) => b.count));
    });
  };

  // ========== SALARY ==========
  Pages.salary = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/salary' + qs());
    const k = r.kpis;
    content.innerHTML = head('تحليلات الرواتب', 'وصول مقيّد بالصلاحية — بيانات سرّية', printBtn()) +
      `<div class="kpi-grid">
        ${kpi({ label: 'إجمالي الرواتب', value: fmt.moneyPlain(k.total_payroll), accent: 'amber', ico: '💰' })}
        ${kpi({ label: 'متوسط الراتب', value: fmt.moneyPlain(k.average_salary), accent: 'green', ico: '📊' })}
        ${kpi({ label: 'الوسيط', value: fmt.moneyPlain(k.median_salary), accent: 'teal', ico: '➗' })}
        ${kpi({ label: 'أدنى راتب', value: fmt.moneyPlain(k.min_salary), accent: 'blue', ico: '🔻' })}
        ${kpi({ label: 'أعلى راتب', value: fmt.moneyPlain(k.max_salary), accent: 'red', ico: '🔝' })}
      </div>
      <div class="grid g-2">
        ${panel('إجمالي الرواتب حسب القسم', 'chPayDept', { chartCls: 'lg' })}
        ${panel('متوسط الراتب حسب الدرجة', 'chSalLvl', { chartCls: 'lg' })}
        ${panel('توزيع الرواتب', 'chSalHist')}
        ${panel('متوسط الراتب حسب المسمى (أعلى 12)', 'chSalPos', { chartCls: 'lg' })}
      </div>`;
    afterPaint(() => {
      const dep = r.byDepartment.slice(0, 12);
      Chart.barH(el('chPayDept'), dep.map((g) => g.key), dep.map((g) => Math.round(g.payroll)), { showLabel: false, labelWidth: 110, color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#b45309' }, { offset: 1, color: '#f59e0b' }]) });
      Chart.barV(el('chSalLvl'), r.byLevel.map((g) => g.key), r.byLevel.map((g) => Math.round(g.avg || 0)));
      const h = r.histogram;
      Chart.barV(el('chSalHist'), h.map((b) => `${Math.round(b.from / 1000)}k-${Math.round(b.to / 1000)}k`), h.map((b) => b.count), { rotate: 20 });
      const pos = r.byPosition.slice().sort((a, b) => (b.avg || 0) - (a.avg || 0)).slice(0, 12);
      Chart.barH(el('chSalPos'), pos.map((g) => g.key), pos.map((g) => Math.round(g.avg || 0)), { labelWidth: 130 });
    });
  };

  // ========== EXPIRY ==========
  Pages.expiry = async function (content) {
    if (!App.state.hasData) return noData(content);
    const [r, a] = await Promise.all([api('/api/expiry' + qs()), api('/api/alerts' + qs())]);
    const alerts = a.alerts || [];
    const byPr = { critical: 0, high: 0, medium: 0, low: 0 };
    alerts.forEach((x) => byPr[x.priority]++);
    const bucketKeys = ['expired', 'd0_30', 'd31_60', 'd61_90', 'd91_180', 'valid', 'missing'];
    const bucketLabels = { expired: 'منتهية', d0_30: '0–30', d31_60: '31–60', d61_90: '61–90', d91_180: '91–180', valid: 'سارية', missing: 'غير متوفرة' };
    const bucketColors = { expired: '#dc2626', d0_30: '#f59e0b', d31_60: '#eab308', d61_90: '#3b82f6', d91_180: '#0891b2', valid: '#16a34a', missing: '#94a3b8' };
    content.innerHTML = head('مركز الانتهاء والامتثال', 'مراقبة العقود والوثائق والإقامات — الخانة الفارغة تُصنّف «غير متوفرة» وليست «سارية»', printBtn()) +
      `<div class="kpi-grid">
        ${kpi({ label: 'تنبيهات حرجة', value: fmt.n(byPr.critical), accent: 'red', ico: '🔴', sub: 'منتهية أو ≤7 أيام' })}
        ${kpi({ label: 'عالية', value: fmt.n(byPr.high), accent: 'amber', ico: '🟠', sub: '≤30 يوم' })}
        ${kpi({ label: 'متوسطة', value: fmt.n(byPr.medium), accent: 'blue', ico: '🔵', sub: '≤60 يوم' })}
        ${kpi({ label: 'منخفضة', value: fmt.n(byPr.low), accent: 'teal', ico: '🟢', sub: '≤90 يوم' })}
      </div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>مصفوفة الامتثال حسب الوثيقة</h3></div><div class="panel-body tbl-wrap">
        <table class="tbl"><thead><tr><th>الوثيقة</th>${bucketKeys.map((b) => `<th style="text-align:center">${bucketLabels[b]}</th>`).join('')}</tr></thead><tbody>
        ${r.fields.map((f) => { const c = r.matrix[f.key].counts; return `<tr><td><b>${fmt.esc(f.label)}</b></td>${bucketKeys.map((b) => `<td style="text-align:center"><span class="mx-cell" style="background:${hexA(bucketColors[b], .13)};color:${bucketColors[b]}">${fmt.n(c[b])}</span></td>`).join('')}</tr>`; }).join('')}
        </tbody></table></div></div>
      <div class="grid g-2">${panel('توزيع حالات الوثائق', 'chExpStack', { chartCls: 'lg' })}<div class="panel"><div class="panel-head"><h3>بيانات ناقصة</h3><span class="p-sub">لا تُفترض «سارية»</span></div><div class="panel-body"><div id="chMissing" class="chart lg"></div></div></div></div>
      <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>التنبيهات الذكية (خلال 90 يوم أو منتهية)</h3><span class="p-sub">${fmt.n(alerts.length)} تنبيه</span>${excelBtn('alerts')}</div><div class="panel-body tbl-wrap">
        <table class="tbl clickable responsive-cards"><thead><tr><th>الأولوية</th><th>الموظف</th><th>القسم</th><th>الوثيقة</th><th>تاريخ الانتهاء</th><th>المتبقي</th></tr></thead><tbody>
        ${alerts.slice(0, 200).map((x) => `<tr data-code="${fmt.esc(x.employee_code)}"><td data-l="الأولوية"><span class="badge ${prBadge(x.priority)}">${prLabel(x.priority)}</span></td><td data-l="الموظف">${fmt.esc(x.arabic_name || x.name)} <span style="color:var(--muted);font-size:11px">${fmt.esc(x.employee_code)}</span></td><td data-l="القسم">${fmt.esc(x.section)}</td><td data-l="الوثيقة">${fmt.esc(x.document_ar)}</td><td data-l="الانتهاء">${fmt.date(x.expiry_date)}</td><td data-l="المتبقي" class="num">${x.days_left < 0 ? 'منتهية منذ ' + Math.abs(x.days_left) + ' يوم' : x.days_left + ' يوم'}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    afterPaint(() => {
      Chart.stacked(el('chExpStack'), r.fields.map((f) => f.label), bucketKeys.map((b) => ({ name: bucketLabels[b], data: r.fields.map((f) => r.matrix[f.key].counts[b]), color: bucketColors[b] })));
      Chart.barV(el('chMissing'), Object.keys(r.missing.by_field).map((f) => ({ contract_expire_date: 'العقد', health_card_expire_date: 'البطاقة الصحية', residence_expire_date: 'الإقامة', passport_expire_date: 'الجواز' }[f] || f)), Object.values(r.missing.by_field), { color: '#94a3b8' });
    });
    content.querySelectorAll('tr[data-code]').forEach((tr) => tr.addEventListener('click', () => location.hash = '#/employee/' + tr.dataset.code));
    bindExcel(content, () => exportRows(alerts.map((x) => ({ 'الأولوية': x.priority, 'الرقم': x.employee_code, 'الموظف': x.arabic_name || x.name, 'القسم': x.section, 'الوثيقة': x.document_ar, 'الانتهاء': x.expiry_date, 'المتبقي(يوم)': x.days_left })), 'expiry-alerts', 'expiry-alerts.xlsx'));
  };
  function prBadge(p) { return { critical: 'b-danger', high: 'b-warn', medium: 'b-watch', low: 'b-ok' }[p] || 'b-muted'; }
  function prLabel(p) { return { critical: 'حرجة', high: 'عالية', medium: 'متوسطة', low: 'منخفضة' }[p] || p; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  // ========== EMPLOYEES ==========
  Pages.employees = async function (content, param) {
    if (!App.state.hasData) return noData(content);
    const initialQ = new URLSearchParams((param || '').includes('?') ? param.split('?')[1] : location.hash.split('?')[1] || '').get('q') || '';
    content.innerHTML = head('الموظفون والبحث', 'بحث سريع بالرقم الوظيفي أو الاسم أو القسم أو المسمى', printBtn()) +
      `<div class="panel" style="margin-bottom:16px"><div class="panel-body"><input id="empSearch" class="field" style="margin:0;font-size:15px" placeholder="🔎 ابحث عن موظف…" value="${fmt.esc(initialQ)}"></div></div>
      <div class="panel"><div class="panel-body tbl-wrap"><div id="empResults"><div class="spinner"></div></div></div></div>`;
    const search = async (q) => {
      const r = await api('/api/employees?q=' + encodeURIComponent(q) + (App.filters.period ? '&period=' + App.filters.period : ''));
      const emps = r.employees || [];
      el('empResults').innerHTML = `<div style="color:var(--muted);font-size:12px;margin-bottom:8px">${fmt.n(r.total)} نتيجة</div><table class="tbl clickable responsive-cards"><thead><tr><th>الرقم</th><th>الاسم العربي</th><th>الاسم الإنجليزي</th><th>القسم</th><th>المسمى</th><th>الجنسية</th><th>التصنيف</th></tr></thead><tbody>${emps.map((e) => `<tr data-code="${fmt.esc(e.employee_code)}"><td data-l="الرقم" class="num">${fmt.esc(e.employee_code)}</td><td data-l="الاسم">${fmt.esc(e.arabic_name)}</td><td data-l="EN">${fmt.esc(e.name)}</td><td data-l="القسم">${fmt.esc(e.section)}</td><td data-l="المسمى">${fmt.esc(e.position)}</td><td data-l="الجنسية">${fmt.esc(e.nationality)}</td><td data-l="التصنيف">${e.is_saudi ? '<span class="badge b-ok">سعودي</span>' : '<span class="badge b-muted">غير سعودي</span>'}</td></tr>`).join('')}</tbody></table>`;
      el('empResults').querySelectorAll('tr[data-code]').forEach((tr) => tr.addEventListener('click', () => location.hash = '#/employee/' + tr.dataset.code));
    };
    let t; el('empSearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => search(e.target.value.trim()), 200); });
    search(initialQ);
  };

  // ========== EMPLOYEE 360 ==========
  Pages.employee = async function (content, code) {
    content.innerHTML = '<div class="spinner"></div>';
    let r;
    try { r = await api('/api/employee/' + encodeURIComponent(code) + (App.filters.period ? '?period=' + App.filters.period : '')); }
    catch (e) { content.innerHTML = `<div class="empty"><h3>الموظف غير موجود</h3><a href="#/employees" class="btn">عودة للبحث</a></div>`; return; }
    const e = r.employee;
    const docRow = (d) => `<div class="info-cell"><div class="l">${fmt.esc(d.label)}</div><div class="v">${fmt.date(d.date)} ${complianceStatus(d.days)}</div></div>`;
    content.innerHTML = head('ملف الموظف 360°', '', `<a href="#/employees" class="btn">← البحث</a>` + printBtn()) +
      `<div class="emp-hero"><div class="e-av">${fmt.esc((e.arabic_name || e.name || 'م').trim().charAt(0))}</div>
        <div style="flex:1;min-width:200px"><div class="e-name">${fmt.esc(e.arabic_name || e.name)}</div><div class="e-meta">${fmt.esc(e.name || '')} · الرقم الوظيفي ${fmt.esc(e.employee_code)}</div>
        <div class="e-tags"><span class="t">${fmt.esc(e.position || '—')}</span><span class="t">${fmt.esc(e.section || '—')}</span><span class="t">${e.is_saudi ? 'سعودي' : 'غير سعودي'}</span><span class="t">درجة ${fmt.esc(e.level_code || '—')}</span></div></div></div>
      <div class="grid g-2">
        <div class="panel"><div class="panel-head"><h3>البيانات الأساسية</h3></div><div class="panel-body"><div class="info-grid">
          ${infoCell('المنشأة', e.division)}${infoCell('القسم', e.section)}${infoCell('المسمى', e.position)}${infoCell('الدرجة', e.level_code)}
          ${infoCell('الجنسية', e.nationality)}${infoCell('الجنس', e.gender)}
          ${r.canSalary ? infoCell('الراتب', fmt.moneyPlain(e.total_salary)) : ''}
          ${infoCell('تاريخ التعيين', fmt.date(e.hiring_date))}
          ${infoCell('رصيد الإجازة السنوية', fmt.days(e.end_annual_balance))}${infoCell('رصيد الـHoliday', fmt.days(e.end_holiday_balance))}
        </div></div></div>
        <div class="panel"><div class="panel-head"><h3>الوثائق والامتثال</h3></div><div class="panel-body"><div class="info-grid">
          ${r.documents.map(docRow).join('')}
          ${infoCell('فترة التجربة', fmt.date(e.probation_date))}
        </div></div></div>
      </div>
      <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>المسار الوظيفي (Timeline)</h3><span class="p-sub">مُستخلص تلقائياً من الملفات الشهرية</span></div><div class="panel-body">
        ${r.timeline.length ? `<div class="timeline">${r.timeline.slice().reverse().map((t) => `<div class="tl-item type-${t.type}"><div class="tl-dot"></div><div class="tl-date">${fmt.date(t.date)} · ${fmt.esc(t.period)}</div><div class="tl-title">${fmt.esc(t.label)}</div><div class="tl-detail">${fmt.esc(t.detail || '')}</div></div>`).join('')}</div>` : '<div class="empty" style="padding:30px"><p>يظهر المسار الوظيفي عند توفر ملفين شهريين أو أكثر لمقارنة التغيّرات.</p></div>'}
      </div></div>`;
  };
  function infoCell(l, v) { return `<div class="info-cell"><div class="l">${l}</div><div class="v">${v == null || v === '' ? '<span class="badge b-muted">غير متوفر</span>' : fmt.esc(v)}</div></div>`; }

  // ========== MOVEMENTS ==========
  Pages.movements = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/movements' + (App.filters.period ? '?period=' + App.filters.period : ''));
    if (r.first) {
      content.innerHTML = head('الترقيات والحركات الوظيفية', r.period || '') +
        `<div class="data-note">ℹ️ هذا أول ملف في النظام، لذلك يظهر جميع الموظفين كـ«تعيينات جديدة». تظهر الحركات والترقيات عند رفع الملف الشهري التالي ومقارنته بالحالي عبر الرقم الوظيفي.</div>` +
        newHiresPanel(r.newHires);
      bindEmpClicks(content); return;
    }
    content.innerHTML = head('الترقيات والحركات الوظيفية', `${r.period} مقابل ${r.previousPeriod}`, printBtn()) +
      `<div class="kpi-grid">
        ${kpi({ label: 'ترقيات مرجّحة', value: fmt.n(r.movements.filter((m) => m.classification.type === 'Promotion').length), accent: 'green', ico: '⬆️' })}
        ${kpi({ label: 'إجمالي الحركات', value: fmt.n(r.movements.length), accent: 'blue', ico: '🔄' })}
        ${kpi({ label: 'تعيينات جديدة', value: fmt.n(r.newHires.length), accent: 'teal', ico: '🆕' })}
        ${kpi({ label: 'مفقودون من الملف', value: fmt.n(r.missing.length), accent: 'red', ico: '⚠️', sub: 'يحتاج تصنيف السبب' })}
      </div>
      <div class="tabs"><button class="tab active" data-tab="mov">الحركات (${r.movements.length})</button><button class="tab" data-tab="new">التعيينات (${r.newHires.length})</button><button class="tab" data-tab="miss">المفقودون (${r.missing.length})</button></div>
      <div id="tabMov">${movementsTable(r.movements)}</div>
      <div id="tabNew" class="hide">${newHiresPanel(r.newHires)}</div>
      <div id="tabMiss" class="hide">${missingPanel(r.missing)}</div>`;
    content.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      content.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active');
      el('tabMov').classList.toggle('hide', t.dataset.tab !== 'mov');
      el('tabNew').classList.toggle('hide', t.dataset.tab !== 'new');
      el('tabMiss').classList.toggle('hide', t.dataset.tab !== 'miss');
    }));
    bindEmpClicks(content);
    // classify handlers
    content.querySelectorAll('[data-classify]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); openClassify(r.period, b.dataset.classify); }));
    content.querySelectorAll('[data-leaver]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); openLeaver(b.dataset.leaver); }));
  };
  function movementsTable(movs) {
    if (!movs.length) return '<div class="empty" style="padding:40px"><p>لا توجد حركات بين الفترتين.</p></div>';
    const canSal = can('view_salary');
    return `<div class="panel"><div class="panel-body tbl-wrap"><table class="tbl clickable responsive-cards"><thead><tr><th>الموظف</th><th>القسم</th><th>التصنيف</th><th>المسمى (قبل ← بعد)</th><th>الدرجة</th>${canSal ? '<th>الراتب</th><th>الزيادة%</th>' : ''}${can('manage_movements') ? '<th>إجراء</th>' : ''}</tr></thead><tbody>
      ${movs.map((m) => { const pos = m.changes.find((c) => c.field === 'position'); const lvl = m.changes.find((c) => c.field === 'level_code'); return `<tr data-code="${fmt.esc(m.employee_code)}"><td data-l="الموظف">${fmt.esc(m.arabic_name || m.name)} <span style="color:var(--muted);font-size:11px">${fmt.esc(m.employee_code)}</span></td><td data-l="القسم">${fmt.esc(m.section)}</td><td data-l="التصنيف">${classBadge(m.classification)}</td><td data-l="المسمى">${pos ? `${fmt.esc(pos.from || '—')} <b style="color:var(--teal-700)">←</b> ${fmt.esc(pos.to)}` : '—'}</td><td data-l="الدرجة">${lvl ? `${fmt.esc(lvl.from || '—')} ← ${fmt.esc(lvl.to)}` : '—'}</td>${canSal ? `<td data-l="الراتب" class="num">${m.current.total_salary != null ? fmt.moneyPlain(m.current.total_salary) : '—'}</td><td data-l="الزيادة" class="num">${m.salary_pct != null ? (m.salary_pct >= 0 ? '+' : '') + m.salary_pct.toFixed(2) + '%' : '—'}</td>` : ''}${can('manage_movements') ? `<td data-l="إجراء" class="no-print"><button class="btn" style="padding:5px 10px" data-classify="${fmt.esc(m.employee_code)}">تصنيف</button></td>` : ''}</tr>`; }).join('')}
    </tbody></table></div></div>`;
  }
  function classBadge(c) {
    const m = { Promotion: 'b-ok', 'Salary Adjustment': 'b-warn', 'Position Change': 'b-watch', 'Level Change': 'b-watch', Transfer: 'b-teal', 'Multiple Changes': 'b-warn', 'AI Review Required': 'b-muted' };
    return `<span class="badge ${m[c.type] || 'b-muted'}">${fmt.esc(c.label)}${c.overridden ? ' ✓' : ''}</span>`;
  }
  function newHiresPanel(list) {
    if (!list.length) return '<div class="empty" style="padding:40px"><p>لا توجد تعيينات جديدة.</p></div>';
    return `<div class="panel"><div class="panel-body tbl-wrap"><table class="tbl clickable responsive-cards"><thead><tr><th>الرقم</th><th>الاسم</th><th>القسم</th><th>المسمى</th><th>تاريخ التعيين</th><th>الجنسية</th></tr></thead><tbody>${list.map((e) => `<tr data-code="${fmt.esc(e.employee_code)}"><td data-l="الرقم" class="num">${fmt.esc(e.employee_code)}</td><td data-l="الاسم">${fmt.esc(e.arabic_name || e.name)}</td><td data-l="القسم">${fmt.esc(e.section)}</td><td data-l="المسمى">${fmt.esc(e.position)}</td><td data-l="التعيين">${fmt.date(e.hiring_date)}</td><td data-l="الجنسية">${fmt.esc(e.nationality)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function missingPanel(list) {
    if (!list.length) return '<div class="empty" style="padding:40px"><p>لا يوجد موظفون مفقودون.</p></div>';
    return `<div class="data-note">⚠️ الموظف المفقود من الملف الحالي <b>لا يُعتبر مستقيلاً تلقائياً</b>. يجب على الموارد البشرية تحديد السبب لمنع تسجيل استقالات غير صحيحة.</div>
    <div class="panel"><div class="panel-body tbl-wrap"><table class="tbl clickable responsive-cards"><thead><tr><th>الرقم</th><th>الاسم</th><th>القسم</th><th>المسمى</th><th>السبب</th>${can('manage_leavers') ? '<th>إجراء</th>' : ''}</tr></thead><tbody>${list.map((e) => `<tr data-code="${fmt.esc(e.employee_code)}"><td data-l="الرقم" class="num">${fmt.esc(e.employee_code)}</td><td data-l="الاسم">${fmt.esc(e.arabic_name || e.name)}</td><td data-l="القسم">${fmt.esc(e.section)}</td><td data-l="المسمى">${fmt.esc(e.position)}</td><td data-l="السبب">${e.reason ? `<span class="badge b-teal">${fmt.esc(e.reason)}</span>` : '<span class="badge b-warn">بحاجة لتصنيف</span>'}</td>${can('manage_leavers') ? `<td class="no-print"><button class="btn" style="padding:5px 10px" data-leaver="${fmt.esc(e.employee_code)}">تحديد السبب</button></td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;
  }
  function bindEmpClicks(root) { root.querySelectorAll('tr[data-code]').forEach((tr) => tr.addEventListener('click', () => location.hash = '#/employee/' + tr.dataset.code)); }
  function openClassify(period, code) {
    const types = [['Promotion', 'ترقية'], ['Position Change', 'تغيير مسمى'], ['Salary Adjustment', 'تعديل راتب'], ['Level Change', 'تغيير درجة'], ['Transfer', 'نقل'], ['Multiple Changes', 'تغييرات متعددة'], ['AI Review Required', 'يحتاج مراجعة']];
    const m = modal(`<div class="modal-head"><h3>تصنيف الحركة — ${fmt.esc(code)}</h3><button class="modal-close">✕</button></div><div class="modal-body"><div class="field"><label>التصنيف المعتمد من الموارد البشرية</label><select id="clsSel">${types.map((t) => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div></div><div class="modal-foot"><button class="btn modal-close">إلغاء</button><button class="btn btn-primary" id="clsSave">اعتماد</button></div>`, { sm: true });
    el('clsSave').addEventListener('click', async () => {
      const sel = el('clsSel'); await api('/api/movement/classify', { method: 'POST', body: JSON.stringify({ period, code, type: sel.value, label: sel.options[sel.selectedIndex].text }) });
      m.close(); toast('تم اعتماد التصنيف', 'ok'); window.route();
    });
  }
  function openLeaver(code) {
    const period = App.filters.period || (App.state.active && App.state.active.id);
    const reasons = ['استقالة', 'إنهاء خدمة', 'نقل', 'انتهاء عقد', 'مشكلة في البيانات', 'أخرى'];
    const m = modal(`<div class="modal-head"><h3>سبب مغادرة الموظف — ${fmt.esc(code)}</h3><button class="modal-close">✕</button></div><div class="modal-body"><div class="field"><label>السبب</label><select id="lvSel">${reasons.map((r) => `<option>${r}</option>`).join('')}</select></div></div><div class="modal-foot"><button class="btn modal-close">إلغاء</button><button class="btn btn-primary" id="lvSave">حفظ</button></div>`, { sm: true });
    el('lvSave').addEventListener('click', async () => {
      await api('/api/leaver/reason', { method: 'POST', body: JSON.stringify({ period, code, reason: el('lvSel').value }) });
      m.close(); toast('تم حفظ السبب', 'ok'); window.route();
    });
  }

  // ========== MONTHLY MOVEMENT ==========
  Pages.monthly = async function (content) {
    if (!App.state.hasData) return noData(content);
    const r = await api('/api/monthly-movement' + (App.filters.period ? '?period=' + App.filters.period : ''));
    if (r.first || !r.summary) { content.innerHTML = head('الحركة الشهرية') + `<div class="data-note">ℹ️ تظهر حركة القوى العاملة عند توفر فترتين على الأقل. الفترة الحالية: ${fmt.esc(r.period || '')}.</div>`; return; }
    const s = r.summary;
    content.innerHTML = head('الحركة الشهرية للقوى العاملة', `${r.previousPeriod} ← ${r.period}`, printBtn()) +
      `<div class="kpi-grid">
        ${kpi({ label: 'الافتتاحي', value: fmt.n(s.opening_headcount), accent: 'teal', ico: '📥' })}
        ${kpi({ label: 'تعيينات جديدة', value: fmt.n(s.new_hires), accent: 'green', ico: '🆕' })}
        ${kpi({ label: 'مفقودون', value: fmt.n(s.missing_employees), accent: 'red', ico: '📤' })}
        ${kpi({ label: 'ترقيات', value: fmt.n(s.promotions), accent: 'blue', ico: '⬆️' })}
        ${kpi({ label: 'الختامي', value: fmt.n(s.closing_headcount), accent: 'teal', ico: '📦' })}
        ${kpi({ label: 'صافي التغير', value: (s.net_change >= 0 ? '+' : '') + fmt.n(s.net_change), accent: s.net_change >= 0 ? 'green' : 'red', ico: '📊' })}
      </div>
      ${panel('مخطط الشلال — حركة القوى العاملة', 'chWaterfall', { chartCls: 'lg' })}`;
    afterPaint(() => {
      Chart.waterfall(el('chWaterfall'), [
        { name: 'الافتتاحي', value: s.opening_headcount, type: 'total' },
        { name: 'تعيينات', value: s.new_hires, type: 'inc' },
        { name: 'مفقودون', value: -s.missing_employees, type: 'dec' },
        { name: 'الختامي', value: s.closing_headcount, type: 'total' },
      ]);
    });
  };

  // ========== COMPARE ==========
  Pages.compare = async function (content) {
    if (!App.state.hasData) return noData(content);
    const snaps = App.state.snapshots;
    if (snaps.length < 2) { content.innerHTML = head('المقارنة الشهرية') + `<div class="data-note">ℹ️ المقارنة تحتاج فترتين على الأقل. ارفع ملفاً شهرياً إضافياً لتفعيلها.</div>`; return; }
    const def = { from: snaps[snaps.length - 2].id, to: snaps[snaps.length - 1].id };
    content.innerHTML = head('المقارنة الشهرية', 'قارن أي فترتين جنباً إلى جنب', printBtn()) +
      `<div class="panel" style="margin-bottom:16px"><div class="panel-body" style="display:flex;gap:14px;flex-wrap:wrap;align-items:end">
        <div class="field" style="margin:0"><label>من فترة</label><select id="cmpFrom">${snaps.map((s) => `<option value="${s.id}" ${s.id === def.from ? 'selected' : ''}>${fmt.esc(s.periodLabel || s.period)}</option>`).join('')}</select></div>
        <div class="field" style="margin:0"><label>إلى فترة</label><select id="cmpTo">${snaps.map((s) => `<option value="${s.id}" ${s.id === def.to ? 'selected' : ''}>${fmt.esc(s.periodLabel || s.period)}</option>`).join('')}</select></div>
      </div></div><div id="cmpResult"></div>`;
    const run = async () => {
      const from = el('cmpFrom').value, to = el('cmpTo').value;
      el('cmpResult').innerHTML = '<div class="spinner"></div>';
      const r = await api(`/api/compare?from=${from}&to=${to}`);
      const M = r.metrics;
      const dcard = (label, m, fmtFn, ico, accent) => { if (!m) return ''; return kpi({ label, value: fmtFn(m.to), accent, ico, sub: `<span style="color:var(--muted)">من ${fmtFn(m.from)}</span>`, delta: m.change, deltaSuffix: label.includes('%') ? '%' : '', deltaDec: label.includes('%') ? 2 : 0 }); };
      el('cmpResult').innerHTML = `<div style="color:var(--muted);font-size:13px;margin-bottom:10px">${fmt.esc(r.from.label)} ← ${fmt.esc(r.to.label)}</div><div class="kpi-grid">
        ${dcard('عدد الموظفين', M.headcount, fmt.n, '👥', 'teal')}
        ${dcard('السعوديون', M.saudi, fmt.n, '🇸🇦', 'green')}
        ${dcard('نسبة السعودة %', M.saudi_pct, (v) => fmt.pct(v), '📊', 'green')}
        ${M.payroll ? dcard('إجمالي الرواتب', M.payroll, fmt.moneyPlain, '💰', 'amber') : ''}
        ${dcard('رصيد الإجازات', M.annual_balance, (v) => fmt.n(v, 0), '🏖️', 'teal')}
        ${dcard('وثائق تنتهي', M.documents_expiring, fmt.n, '⏳', 'red')}
      </div>
      <div class="grid g-4" style="margin-top:4px">
        ${kpi({ label: 'تعيينات جديدة', value: fmt.n(r.newHires), accent: 'green', ico: '🆕' })}
        ${kpi({ label: 'مفقودون', value: fmt.n(r.missing), accent: 'red', ico: '📤' })}
        ${kpi({ label: 'ترقيات', value: fmt.n(r.promotions), accent: 'blue', ico: '⬆️' })}
        ${kpi({ label: 'تغييرات المسمى', value: fmt.n(r.positionChanges), accent: 'teal', ico: '🔄' })}
      </div>`;
    };
    el('cmpFrom').addEventListener('change', run); el('cmpTo').addEventListener('change', run); run();
  };

  // ========== RULES ==========
  Pages.rules = async function (content) {
    const r = await api('/api/rules');
    const rules = r.rules || [];
    const canManage = can('manage_localization_rules');
    content.innerHTML = head('مركز قرارات التوطين', 'المرجع الرسمي هو الأساس — لا يعتمد النظام على معلومات محفوظة داخل نموذج الذكاء الاصطناعي كمصدر قانوني', canManage ? `<button class="btn btn-primary" id="addRule">+ إضافة قرار</button>` : '') +
      `<div class="data-note">📌 لا تُخترع نسب التوطين. كل قرار يجب أن يحمل مصدراً رسمياً موثّقاً (وزارة الموارد البشرية والتنمية الاجتماعية أو الأنظمة الحكومية المعتمدة) مع رابط المصدر وتاريخ آخر تحقّق. عند غياب قرار موثّق، يعرض النظام: «تعذّر تحديد هدف التوطين الرسمي بثقة كافية».</div>` +
      (rules.length ? `<div class="grid g-2">${rules.map(ruleCard).join('')}</div>` :
        `<div class="empty"><h3>لا توجد قرارات موثّقة بعد</h3><p>${canManage ? 'أضف أول قرار توطين رسمي مع توثيق المصدر.' : 'سيقوم مدير النظام بإضافة القرارات الرسمية.'}</p></div>`);
    if (canManage) {
      el('addRule')?.addEventListener('click', () => openRuleForm());
      content.querySelectorAll('[data-edit-rule]').forEach((b) => b.addEventListener('click', () => openRuleForm(rules.find((x) => x.id === b.dataset.editRule))));
      content.querySelectorAll('[data-del-rule]').forEach((b) => b.addEventListener('click', async () => { if (confirm('حذف هذا القرار؟')) { await api('/api/rules/' + b.dataset.delRule, { method: 'DELETE' }); toast('تم الحذف', 'ok'); window.route(); } }));
    }
  };
  function ruleCard(r) {
    const st = { active: ['b-ok', 'مفعّل'], upcoming: ['b-watch', 'قادم'], expired: ['b-muted', 'منتهٍ'] }[r.status] || ['b-muted', r.status];
    return `<div class="panel"><div class="panel-head"><h3>${fmt.esc(r.name || 'قرار بدون اسم')}</h3><span class="badge ${st[0]}">${st[1]}</span></div><div class="panel-body">
      <div class="info-grid">
        ${infoCell('النسبة الرسمية', r.required_pct != null ? fmt.pct(r.required_pct, 0) : null)}
        ${infoCell('النشاط الاقتصادي', r.activity)}
        ${infoCell('تاريخ الإصدار', fmt.date(r.issue_date))}
        ${infoCell('بداية التطبيق', fmt.date(r.effective_date))}
        ${infoCell('الحد الأدنى للأجور', r.min_wage != null ? fmt.moneyPlain(r.min_wage) : null)}
        ${infoCell('عدد العاملين المشمول', r.min_workers)}
        ${infoCell('منطقة التطبيق', r.region)}
        ${infoCell('آخر تحقّق', fmt.date(r.last_verified))}
      </div>
      ${r.occupations && r.occupations.length ? `<div style="margin-top:10px"><b style="font-size:12px;color:var(--muted)">المهن المشمولة:</b> ${r.occupations.map((o) => `<span class="badge b-teal" style="margin:2px">${fmt.esc(o)}</span>`).join('')}</div>` : ''}
      ${r.conditions ? `<div style="margin-top:8px;font-size:12.5px"><b>الشروط:</b> ${fmt.esc(r.conditions)}</div>` : ''}
      ${r.exceptions ? `<div style="margin-top:4px;font-size:12.5px"><b>الاستثناءات:</b> ${fmt.esc(r.exceptions)}</div>` : ''}
      <div style="margin-top:10px;font-size:12px;color:var(--muted)">المصدر: ${fmt.esc(r.source || '—')} ${r.source_url ? `· <a href="${fmt.esc(r.source_url)}" target="_blank" rel="noopener" style="color:var(--teal-700);font-weight:700">رابط المصدر ↗</a>` : ''}</div>
      ${can('manage_localization_rules') ? `<div class="no-print" style="margin-top:12px;display:flex;gap:8px"><button class="btn" data-edit-rule="${r.id}">تعديل</button><button class="btn" style="color:var(--danger)" data-del-rule="${r.id}">حذف</button></div>` : ''}
    </div></div>`;
  }
  function openRuleForm(rule) {
    const r = rule || {};
    const positions = (App.state.options && App.state.options.position) || [];
    const m = modal(`<div class="modal-head"><h3>${rule ? 'تعديل قرار' : 'إضافة قرار توطين'}</h3><button class="modal-close">✕</button></div><div class="modal-body">
      <div class="form-grid">
        <div class="field"><label>اسم القرار</label><input id="rName" value="${fmt.esc(r.name || '')}"></div>
        <div class="field"><label>النسبة الرسمية (%)</label><input id="rPct" type="number" step="0.01" value="${r.required_pct ?? ''}"></div>
        <div class="field"><label>النشاط الاقتصادي</label><input id="rAct" value="${fmt.esc(r.activity || '')}"></div>
        <div class="field"><label>الحالة</label><select id="rStatus"><option value="active" ${r.status === 'active' ? 'selected' : ''}>مفعّل</option><option value="upcoming" ${r.status === 'upcoming' || !r.status ? 'selected' : ''}>قادم</option><option value="expired" ${r.status === 'expired' ? 'selected' : ''}>منتهٍ</option></select></div>
        <div class="field"><label>تاريخ الإصدار</label><input id="rIssue" type="date" value="${r.issue_date || ''}"></div>
        <div class="field"><label>بداية التطبيق</label><input id="rEff" type="date" value="${r.effective_date || ''}"></div>
        <div class="field"><label>الحد الأدنى للأجور (SAR)</label><input id="rWage" type="number" value="${r.min_wage ?? ''}"></div>
        <div class="field"><label>عدد العاملين المشمول</label><input id="rWorkers" type="number" value="${r.min_workers ?? ''}"></div>
        <div class="field"><label>منطقة التطبيق</label><input id="rRegion" value="${fmt.esc(r.region || '')}"></div>
        <div class="field"><label>تاريخ آخر تحقّق</label><input id="rVerified" type="date" value="${r.last_verified || ''}"></div>
      </div>
      <div class="field"><label>المهن المشمولة (اختر من مسميات النظام)</label><select id="rOcc" multiple size="5" style="height:auto">${positions.map((p) => `<option ${(r.occupations || []).includes(p) ? 'selected' : ''}>${fmt.esc(p)}</option>`).join('')}</select></div>
      <div class="field"><label>الشروط</label><textarea id="rCond" rows="2">${fmt.esc(r.conditions || '')}</textarea></div>
      <div class="field"><label>الاستثناءات</label><textarea id="rExc" rows="2">${fmt.esc(r.exceptions || '')}</textarea></div>
      <div class="form-grid"><div class="field"><label>المصدر (الجهة)</label><input id="rSource" value="${fmt.esc(r.source || '')}"></div><div class="field"><label>رابط المصدر الرسمي</label><input id="rUrl" type="url" value="${fmt.esc(r.source_url || '')}"></div></div>
    </div><div class="modal-foot"><button class="btn modal-close">إلغاء</button><button class="btn btn-primary" id="rSave">حفظ</button></div>`);
    el('rSave').addEventListener('click', async () => {
      const body = {
        name: el('rName').value.trim(), required_pct: el('rPct').value === '' ? null : +el('rPct').value,
        activity: el('rAct').value.trim(), status: el('rStatus').value,
        issue_date: el('rIssue').value || null, effective_date: el('rEff').value || null,
        min_wage: el('rWage').value === '' ? null : +el('rWage').value, min_workers: el('rWorkers').value === '' ? null : +el('rWorkers').value,
        region: el('rRegion').value.trim(), last_verified: el('rVerified').value || null,
        occupations: [...el('rOcc').selectedOptions].map((o) => o.value),
        conditions: el('rCond').value.trim(), exceptions: el('rExc').value.trim(),
        source: el('rSource').value.trim(), source_url: el('rUrl').value.trim(),
      };
      if (!body.name) { toast('اسم القرار مطلوب', 'err'); return; }
      if (body.status === 'active' && (body.required_pct == null || !body.source_url)) { toast('القرار المفعّل يتطلب نسبة رسمية ورابط مصدر موثّق', 'err'); return; }
      if (rule) await api('/api/rules/' + rule.id, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/rules', { method: 'POST', body: JSON.stringify(body) });
      m.close(); toast('تم حفظ القرار', 'ok'); window.route();
    });
  }

  // ========== HISTORY ==========
  Pages.history = async function (content) {
    const r = await api('/api/uploads');
    const ups = r.uploads || [];
    content.innerHTML = head('سجل رفع البيانات', `${fmt.n(ups.length)} ملف`, printBtn()) +
      (ups.length ? `<div class="panel"><div class="panel-body tbl-wrap"><table class="tbl responsive-cards"><thead><tr><th>الفترة</th><th>الملف</th><th>تاريخ الرفع</th><th>بواسطة</th><th>الموظفون</th><th>السعودة</th>${can('view_salary') ? '<th>الرواتب</th>' : ''}<th>جودة البيانات</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${ups.map((s) => `<tr><td data-l="الفترة"><b>${fmt.esc(s.periodLabel || s.period)}</b> ${s.active ? '<span class="badge b-ok">نشط</span>' : ''}</td><td data-l="الملف" style="color:var(--muted)">${fmt.esc(s.fileName)}</td><td data-l="الرفع">${new Date(s.uploadedAt).toLocaleString('ar-EG')}</td><td data-l="بواسطة">${fmt.esc(s.uploadedBy)}</td><td data-l="الموظفون" class="num">${fmt.n(s.employeeCount)}</td><td data-l="السعودة" class="num">${fmt.pct(s.saudiPct)}</td>${can('view_salary') ? `<td data-l="الرواتب" class="num">${fmt.moneyPlain(s.payroll)}</td>` : ''}<td data-l="الجودة"><span class="badge ${s.qualityScore >= 90 ? 'b-ok' : s.qualityScore >= 75 ? 'b-warn' : 'b-danger'}">${fmt.pct(s.qualityScore, 1)}</span></td><td data-l="الحالة"><span class="badge b-teal">معتمد</span></td><td class="no-print">${!s.active ? `<button class="btn" style="padding:5px 10px" data-activate="${s.id}">تفعيل</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>` : emptyState());
    content.querySelectorAll('[data-activate]').forEach((b) => b.addEventListener('click', async () => { await api('/api/uploads/' + b.dataset.activate + '/activate', { method: 'POST' }); await App.loadState(); toast('تم التفعيل', 'ok'); window.route(); }));
  };

  // ========== AUDIT ==========
  Pages.audit = async function (content) {
    const r = await api('/api/audit');
    const log = r.audit || [];
    const labels = { login: 'تسجيل دخول', logout: 'خروج', login_failed: 'دخول فاشل', login_locked: 'قفل الدخول', file_uploaded: 'رفع ملف', data_committed: 'اعتماد بيانات', movement_classified: 'تصنيف حركة', leaver_reason_set: 'سبب مغادرة', rule_created: 'إنشاء قرار', rule_updated: 'تعديل قرار', rule_deleted: 'حذف قرار', user_created: 'إنشاء مستخدم', user_updated: 'تعديل مستخدم', snapshot_activated: 'تفعيل فترة', snapshot_deleted: 'حذف فترة' };
    content.innerHTML = head('سجل التدقيق', 'كل عملية مسجّلة بالمستخدم والوقت', printBtn()) +
      `<div class="panel"><div class="panel-body tbl-wrap"><table class="tbl responsive-cards"><thead><tr><th>الوقت</th><th>العملية</th><th>المستخدم</th><th>التفاصيل</th><th>IP</th></tr></thead><tbody>
      ${log.map((a) => `<tr><td data-l="الوقت">${new Date(a.at).toLocaleString('ar-EG')}</td><td data-l="العملية"><span class="badge ${a.action.includes('failed') || a.action.includes('locked') || a.action.includes('deleted') ? 'b-danger' : a.action.includes('login') ? 'b-ok' : 'b-teal'}">${labels[a.action] || a.action}</span></td><td data-l="المستخدم">${fmt.esc(a.actor || '—')}</td><td data-l="التفاصيل">${fmt.esc(a.detail || '')}</td><td data-l="IP" style="color:var(--muted);font-size:11px">${fmt.esc(a.ip || '')}</td></tr>`).join('')}
      </tbody></table></div></div>`;
  };

  // ========== USERS ==========
  Pages.users = async function (content) {
    const r = await api('/api/users');
    const users = r.users || [];
    content.innerHTML = head('المستخدمون والصلاحيات', 'إدارة الأدوار — الرواتب مقيّدة بصلاحية خاصة', `<button class="btn btn-primary" id="addUser">+ مستخدم جديد</button>`) +
      `<div class="panel"><div class="panel-body tbl-wrap"><table class="tbl responsive-cards"><thead><tr><th>المستخدم</th><th>الاسم</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr><td data-l="المستخدم"><b>${fmt.esc(u.username)}</b></td><td data-l="الاسم">${fmt.esc(u.name)}</td><td data-l="الدور"><span class="badge b-teal">${fmt.esc((u.roleLabel || u.role))}</span></td><td data-l="الحالة"><span class="badge b-ok">نشط</span></td><td class="no-print"><button class="btn" style="padding:5px 10px" data-edit-user='${JSON.stringify(u).replace(/'/g, "&#39;")}'>تعديل</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>مصفوفة الأدوار</h3></div><div class="panel-body">
        <div class="info-grid">
          ${roleInfo('Admin', 'صلاحية كاملة على النظام')}
          ${roleInfo('HR Manager', 'الموارد البشرية + الرواتب + التقارير')}
          ${roleInfo('HR Officer', 'بيانات الموظفين + الإجازات + الانتهاء (بدون رواتب)')}
          ${roleInfo('Department Manager', 'القسم فقط')}
          ${roleInfo('Viewer', 'لوحة القيادة فقط')}
        </div></div></div>`;
    el('addUser').addEventListener('click', () => openUserForm(r.roles));
    content.querySelectorAll('[data-edit-user]').forEach((b) => b.addEventListener('click', () => openUserForm(r.roles, JSON.parse(b.dataset.editUser))));
  };
  function roleInfo(name, desc) { return `<div class="info-cell"><div class="l">${name}</div><div class="v" style="font-size:12.5px;font-weight:600">${desc}</div></div>`; }
  function openUserForm(roles, user) {
    const u = user || {};
    const opts = Object.entries(roles).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${fmt.esc(v.label)}</option>`).join('');
    const m = modal(`<div class="modal-head"><h3>${user ? 'تعديل مستخدم' : 'مستخدم جديد'}</h3><button class="modal-close">✕</button></div><div class="modal-body">
      <div class="field"><label>اسم المستخدم</label><input id="uName" value="${fmt.esc(u.username || '')}" ${user ? 'disabled' : ''}></div>
      <div class="field"><label>الاسم الكامل</label><input id="uFull" value="${fmt.esc(u.name || '')}"></div>
      <div class="field"><label>الدور / الصلاحية</label><select id="uRole">${opts}</select></div>
      <div class="field"><label>رمز الدخول ${user ? '(اتركه فارغاً لعدم التغيير)' : ''}</label><input id="uPass" type="password" placeholder="••••••"></div>
    </div><div class="modal-foot"><button class="btn modal-close">إلغاء</button><button class="btn btn-primary" id="uSave">حفظ</button></div>`, { sm: true });
    el('uSave').addEventListener('click', async () => {
      try {
        if (user) { const body = { name: el('uFull').value.trim(), role: el('uRole').value }; if (el('uPass').value) body.passcode = el('uPass').value; await api('/api/users/' + u.id, { method: 'PUT', body: JSON.stringify(body) }); }
        else { if (!el('uName').value.trim() || !el('uPass').value) { toast('اسم المستخدم ورمز الدخول مطلوبان', 'err'); return; } await api('/api/users', { method: 'POST', body: JSON.stringify({ username: el('uName').value.trim(), name: el('uFull').value.trim(), role: el('uRole').value, passcode: el('uPass').value }) }); }
        m.close(); toast('تم الحفظ', 'ok'); window.route();
      } catch (e) { toast(e.body?.error || 'خطأ', 'err'); }
    });
  }

})();
