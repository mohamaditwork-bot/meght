/* upload.standalone.js — fully client-side Excel upload for the hosted build.
   Reads the file with SheetJS in the browser, runs the same mapping / validation
   / analytics engine (window.HR), and adds a snapshot to the in-memory store —
   so the user can update the data and everything recomputes, no server needed. */
(function () {
  const el = (id) => document.getElementById(id);
  const HR = () => window.HR;
  const CORE_TARGETS = [
    ['employee_code', 'الرقم الوظيفي'], ['name', 'الاسم (إنجليزي)'], ['arabic_name', 'الاسم (عربي)'],
    ['level_code', 'الدرجة الوظيفية'], ['division', 'المنشأة / Division'], ['section', 'القسم'],
    ['position', 'المسمى الوظيفي'], ['total_salary', 'إجمالي الراتب'], ['end_annual_balance', 'رصيد الإجازة السنوية'],
    ['end_holiday_balance', 'رصيد الـHoliday'], ['gender', 'الجنس'], ['nationality', 'الجنسية'],
    ['hiring_date', 'تاريخ التعيين'], ['contract_expire_date', 'انتهاء العقد'], ['probation_date', 'انتهاء التجربة'],
    ['health_card_expire_date', 'انتهاء البطاقة الصحية'], ['residence_expire_date', 'انتهاء الإقامة'],
    ['passport_expire_date', 'انتهاء الجواز'],
  ];
  let W = null;

  function readWB(arrayBuffer) {
    const X = window.XLSX;
    const wb = X.read(arrayBuffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('لا يحتوي الملف على ورقة صالحة');
    const grid = X.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    let hr = 0, best = -1;
    for (let i = 0; i < Math.min(grid.length, 15); i++) { const c = grid[i] || []; const sc = c.filter((x) => typeof x === 'string' && x.trim()).length; if (sc > best) { best = sc; hr = i; } }
    const headers = (grid[hr] || []).map((h, i) => (h == null || String(h).trim() === '') ? `Column ${i + 1}` : String(h).trim());
    const rows = [];
    for (let r = hr + 1; r < grid.length; r++) { const arr = grid[r] || []; if (arr.every((c) => c == null || String(c).trim() === '')) continue; const o = {}; headers.forEach((h, i) => { o[h] = arr[i] === undefined ? null : arr[i]; }); rows.push(o); }
    return { headers, rows };
  }

  function steps(active) {
    const s = [['1', 'رفع الملف'], ['2', 'مطابقة الأعمدة'], ['3', 'الفحص والتنظيف'], ['4', 'الاعتماد']];
    return `<div class="steps">${s.map((x, i) => `<div class="step ${i + 1 === active ? 'active' : i + 1 < active ? 'done' : ''}"><span class="n">${i + 1 < active ? '✓' : x[0]}</span>${x[1]}</div>`).join('')}</div>`;
  }
  function h(t) { return `<div class="page-head"><div><h2>رفع بيانات Excel الذكي</h2><div class="sub">${t}</div></div></div>`; }
  function kpiMini(l, v, a) { return `<div class="kpi ${a ? 'accent-' + a : ''}"><div class="k-top"><span class="k-label">${l}</span></div><div class="k-val">${fmt.n(v)}</div></div>`; }
  function typeLabel(t) { return { string: 'نص', number: 'رقم', date: 'تاريخ', key: 'مفتاح' }[t] || t; }
  function sampleValue(col) { const s = (W.rows || []).find((r) => r[col] != null && r[col] !== ''); return s ? String(s[col]).slice(0, 20) : '—'; }

  Pages.upload = function (content) {
    W = null;
    content.innerHTML = h('ارفع ملف الموظفين الشهري — القراءة تتم بالكامل داخل متصفحك، بدون خادم') + steps(1) +
      `<div class="panel"><div class="panel-body">
        <div class="dropzone" id="dz"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
          <h3>اسحب ملف Excel هنا أو اضغط للاختيار</h3><p>يدعم .xlsx و .xls — تُقرأ الأعمدة بالاسم لا بالترتيب</p>
          <input type="file" id="fileInput" accept=".xlsx,.xls" hidden></div>
        <div id="uploadStatus" style="margin-top:14px"></div>
      </div></div>
      <div class="data-note">ملاحظة: هذه نسخة تعمل في المتصفح؛ البيانات التي ترفعها تبقى في جهازك لهذه الجلسة فقط. للحفظ الدائم ومشاركة الفريق استخدم النسخة المستضافة على خادم.</div>`;
    const dz = el('dz'), input = el('fileInput');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) doUpload(input.files[0]); });
  };

  function doUpload(file) {
    el('uploadStatus').innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--muted)">جارٍ قراءة الملف وتحليل الأعمدة…</p>';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { headers, rows } = readWB(reader.result);
        if (!rows.length) throw new Error('الملف لا يحتوي على سجلات');
        const mapping = HR().proposeMapping(headers, rows);
        const period = HR().detectPeriod(file.name);
        W = { fileName: file.name, headers, rows, mapping, period, approvedNorm: {} };
        renderMapping();
      } catch (e) { el('uploadStatus').innerHTML = `<div class="data-note" style="border-color:var(--danger);color:var(--danger)">تعذّرت قراءة الملف: ${fmt.esc(e.message || '')}</div>`; }
    };
    reader.onerror = () => { el('uploadStatus').innerHTML = `<div class="data-note" style="border-color:var(--danger)">خطأ في قراءة الملف</div>`; };
    reader.readAsArrayBuffer(file);
  }

  function renderMapping() {
    const content = el('content');
    const conf = (m) => `<span class="conf ${m.status}">${m.status === 'confirmed' ? 'مؤكّد' : m.status === 'high' ? 'مطابقة عالية' : m.status === 'review' ? 'يحتاج مراجعة' : 'حقل ديناميكي'} ${m.confidence ? Math.round(m.confidence * 100) + '%' : ''}</span>`;
    const targetSelect = (m) => {
      const used = new Set(W.mapping.filter((x) => x !== m && !x.isDynamic && x.status !== 'ignore').map((x) => x.mappedKey));
      const opts = CORE_TARGETS.map(([k, l]) => `<option value="${k}" ${m.mappedKey === k ? 'selected' : ''} ${used.has(k) && m.mappedKey !== k ? 'disabled' : ''}>${l}</option>`).join('');
      return `<select data-col="${fmt.esc(m.column)}"><option value="__dynamic__" ${m.isDynamic ? 'selected' : ''}>حقل ديناميكي (${fmt.esc(m.column)})</option><option value="__ignore__" ${m.status === 'ignore' ? 'selected' : ''}>تجاهل هذا العمود</option>${opts}</select>`;
    };
    const reviewCount = W.mapping.filter((m) => m.status === 'review').length;
    const dynCount = W.mapping.filter((m) => m.isDynamic).length;
    content.innerHTML = h(`الملف: ${fmt.esc(W.fileName)} · ${fmt.n(W.rows.length)} سجل`) + steps(2) +
      `<div class="kpi-grid">${kpiMini('أعمدة الملف', W.mapping.length)}${kpiMini('حقول أساسية مطابقة', W.mapping.filter((m) => !m.isDynamic && m.status !== 'ignore').length)}${kpiMini('حقول ديناميكية', dynCount)}${kpiMini('تحتاج مراجعة', reviewCount, reviewCount ? 'amber' : '')}</div>
      ${reviewCount ? `<div class="data-note">يوجد ${reviewCount} عمود بمطابقة غير مؤكّدة. راجعها واعتمد التعيين الصحيح.</div>` : `<div class="data-note" style="border-color:rgba(30,136,63,.35);background:rgba(30,136,63,.07);color:var(--green-700)">تم التعرف على جميع الأعمدة بالاسم (بغضّ النظر عن ترتيبها).</div>`}
      <div class="panel"><div class="panel-head"><h3>مطابقة الأعمدة</h3><span class="p-sub">العمود في الملف ← الحقل في النظام</span></div><div class="panel-body">
        <div class="map-row" style="font-weight:800;color:var(--muted);font-size:11px;border-bottom:2px solid var(--line)"><div>العمود في الملف</div><div>الثقة</div><div>الحقل المرجعي</div><div>نوع البيانات</div></div>
        ${W.mapping.map((m) => `<div class="map-row"><div class="col-name">${fmt.esc(m.column)}<div style="font-size:11px;color:var(--muted);font-weight:400">مثال: ${fmt.esc(sampleValue(m.column))}</div></div><div>${conf(m)}</div><div>${targetSelect(m)}</div><div><span class="badge b-muted">${typeLabel(m.dataType)}</span></div></div>`).join('')}
      </div></div>
      <div class="ph-actions" style="justify-content:flex-end;margin-top:16px;display:flex;gap:10px"><button class="btn" id="cancelUp">إلغاء</button><button class="btn btn-primary" id="toValidate">التالي: الفحص والتنظيف</button></div>`;
    content.querySelectorAll('select[data-col]').forEach((s) => s.addEventListener('change', () => {
      const m = W.mapping.find((x) => x.column === s.dataset.col);
      if (s.value === '__dynamic__') { m.isDynamic = true; m.status = 'dynamic'; m.mappedKey = 'dyn_' + m.column.toLowerCase().replace(/\W+/g, '_'); }
      else if (s.value === '__ignore__') { m.status = 'ignore'; m.isDynamic = false; m.mappedKey = '__ignore__'; }
      else { m.isDynamic = false; m.status = 'confirmed'; m.mappedKey = s.value; }
      renderMapping();
    }));
    el('cancelUp').addEventListener('click', () => Pages.upload(content));
    el('toValidate').addEventListener('click', renderValidation);
  }

  function buildNormMaps() {
    const maps = {};
    for (const [field, approved] of Object.entries(W.approvedNorm)) {
      const sug = W.validation && W.validation.normalization && W.validation.normalization[field];
      if (!sug) continue; maps[field] = {};
      sug.suggestions.forEach((s, i) => { if (approved[i]) maps[field][s.from] = s.to; });
    }
    return maps;
  }

  function renderValidation() {
    const content = el('content');
    const { records } = HR().buildRecords(W.headers, W.rows, W.mapping, buildNormMaps());
    W.validation = HR().validate(records, W.mapping);
    W.kpis = HR().computeKPIs(records, W.period.asOf);
    const v = W.validation, q = v.quality, c = v.counts;
    const issue = (label, n, tone) => `<div class="mini-kpi"><div class="m-l">${label}</div><div class="m-v" style="color:${n ? (tone || 'var(--danger)') : 'var(--ok)'}">${fmt.n(n)}</div></div>`;
    content.innerHTML = h(`${fmt.esc(W.fileName)} — نتيجة الفحص`) + steps(3) +
      `<div class="grid g-3" style="margin-bottom:16px">
        <div class="panel"><div class="panel-head"><h3>مؤشر جودة البيانات</h3></div><div class="panel-body"><div id="qGauge" class="chart sm"></div></div></div>
        <div class="panel col-span-2"><div class="panel-head"><h3>ملخّص الفحص</h3></div><div class="panel-body"><div class="mini-kpis">
          <div class="mini-kpi"><div class="m-l">إجمالي السجلات</div><div class="m-v">${fmt.n(v.total)}</div></div>
          <div class="mini-kpi"><div class="m-l">سجلات صحيحة</div><div class="m-v" style="color:var(--ok)">${fmt.n(v.valid)}</div></div>
          <div class="mini-kpi"><div class="m-l">بها مشاكل</div><div class="m-v" style="color:${v.invalid ? 'var(--danger)' : 'var(--ok)'}">${fmt.n(v.invalid)}</div></div>
          ${issue('رقم وظيفي مكرر', c.duplicate_code)}${issue('بدون رقم وظيفي', c.missing_code)}${issue('بدون اسم', c.missing_name)}${issue('بدون قسم', c.missing_section, 'var(--warn)')}${issue('رواتب غير منطقية', c.illogical_salary)}${issue('تواريخ غير صحيحة', c.invalid_date, 'var(--warn)')}${issue('حقول وثائق فارغة', c.missing_document, 'var(--muted)')}
        </div></div></div>
      </div>
      <div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>تفصيل مؤشر الجودة (${fmt.pct(q.score, 1)})</h3><span class="p-sub">أسباب فقدان النقاط</span></div><div class="panel-body tbl-wrap">
        <table class="tbl"><thead><tr><th>المعيار</th><th>الوزن</th><th>المكتسبة</th><th>المفقودة</th><th>السبب</th></tr></thead><tbody>
        ${q.breakdown.map((b) => `<tr><td><b>${fmt.esc(b.label)}</b></td><td class="num">${b.weight}%</td><td class="num" style="color:var(--ok)">${b.earned}</td><td class="num" style="color:${b.lost ? 'var(--danger)' : 'var(--muted)'}">${b.lost || '—'}</td><td style="color:var(--muted)">${fmt.esc(b.reason || '—')}</td></tr>`).join('')}
        </tbody></table></div></div>
      ${renderNorm(v.normalization)}
      <div class="data-note">يحتفظ النظام دائماً بالقيمة الأصلية بجانب المطبّعة؛ لا تُعدَّل بياناتك الأصلية.</div>
      <div class="ph-actions" style="justify-content:space-between;margin-top:16px;display:flex;gap:10px"><button class="btn" id="backMap">رجوع للمطابقة</button><button class="btn btn-primary" id="toCommit">التالي: الاعتماد</button></div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => Chart.gauge(el('qGauge'), q.score, { pct: true, dec: 1 })));
    el('backMap').addEventListener('click', renderMapping);
    el('toCommit').addEventListener('click', renderCommit);
    content.querySelectorAll('[data-norm]').forEach((chk) => chk.addEventListener('change', () => { const [f, i] = chk.dataset.norm.split('|'); W.approvedNorm[f] = W.approvedNorm[f] || {}; W.approvedNorm[f][i] = chk.checked; }));
    content.querySelectorAll('[data-norm-all]').forEach((btn) => btn.addEventListener('click', () => { const f = btn.dataset.normAll; W.approvedNorm[f] = {}; W.validation.normalization[f].suggestions.forEach((s, i) => W.approvedNorm[f][i] = true); renderValidation(); }));
  }
  function renderNorm(norm) {
    if (!norm || !Object.keys(norm).length) return '';
    const L = { nationality: 'الجنسيات', section: 'الأقسام', position: 'المسميات', division: 'المنشآت', gender: 'الجنس', level_code: 'الدرجات' };
    return `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>اقتراحات التوحيد</h3><span class="p-sub">اعتمدها لتُطبّق عند الحفظ</span></div><div class="panel-body">
      ${Object.entries(norm).map(([f, sug]) => `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>${L[f] || f}</b><button class="btn" style="padding:4px 10px" data-norm-all="${f}">اعتماد الكل</button></div>${sug.suggestions.map((s, i) => `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--line-2);border-radius:10px;margin-bottom:6px;cursor:pointer"><input type="checkbox" data-norm="${f}|${i}" ${W.approvedNorm[f] && W.approvedNorm[f][i] ? 'checked' : ''}><span style="flex:1"><span class="badge b-warn">${fmt.esc(s.from)}</span> ← <span class="badge b-ok">${fmt.esc(s.to)}</span></span><span style="color:var(--muted);font-size:11.5px">${fmt.n(s.count)} سجل · تشابه ${Math.round(s.similarity * 100)}%</span></label>`).join('')}</div>`).join('')}</div></div>`;
  }

  function renderCommit() {
    const content = el('content'); const p = W.period; const k = W.kpis;
    content.innerHTML = h('اعتماد البيانات') + steps(4) +
      `<div class="grid g-2">
        <div class="panel"><div class="panel-head"><h3>فترة التقرير</h3></div><div class="panel-body">
          ${p.confident ? `<div class="data-note" style="border-color:rgba(30,136,63,.35);background:rgba(30,136,63,.07);color:var(--green-700)">تم تحديد الفترة من اسم الملف: <b>${fmt.esc(p.label)}</b></div>` : `<div class="data-note">تعذّر تحديد الفترة من اسم الملف — عدّلها إن لزم.</div>`}
          <div class="form-grid">
            <div class="field"><label>اسم الفترة</label><input id="pLabel" value="${fmt.esc(p.label)}"></div>
            <div class="field"><label>رمز الفترة (YYYY-MM)</label><input id="pValue" value="${fmt.esc(p.value)}"></div>
            <div class="field"><label>تاريخ البيانات</label><input id="pAsOf" type="date" value="${fmt.esc(p.asOf)}"></div>
          </div>
        </div></div>
        <div class="panel"><div class="panel-head"><h3>معاينة المؤشرات</h3></div><div class="panel-body"><div class="mini-kpis">
          <div class="mini-kpi"><div class="m-l">إجمالي الموظفين</div><div class="m-v">${fmt.n(k.total_employees)}</div></div>
          <div class="mini-kpi"><div class="m-l">سعوديون</div><div class="m-v">${fmt.n(k.saudi_employees)}</div></div>
          <div class="mini-kpi"><div class="m-l">نسبة السعودة</div><div class="m-v">${fmt.pct(k.saudi_pct)}</div></div>
          <div class="mini-kpi"><div class="m-l">الأقسام</div><div class="m-v">${fmt.n(k.departments)}</div></div>
          <div class="mini-kpi"><div class="m-l">المسميات</div><div class="m-v">${fmt.n(k.positions)}</div></div>
          <div class="mini-kpi"><div class="m-l">جودة البيانات</div><div class="m-v">${fmt.pct(W.validation.quality.score, 1)}</div></div>
        </div></div></div>
      </div>
      <div class="ph-actions" style="justify-content:space-between;margin-top:16px;display:flex;gap:10px"><button class="btn" id="backVal">رجوع</button><button class="btn btn-primary" id="commitBtn">اعتماد وحفظ البيانات</button></div>`;
    el('backVal').addEventListener('click', renderValidation);
    el('commitBtn').addEventListener('click', () => {
      const btn = el('commitBtn'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
      try {
        const period = el('pValue').value.trim(), periodLabel = el('pLabel').value.trim(), asOf = el('pAsOf').value || p.asOf;
        const { records, dynamicFields } = HR().buildRecords(W.headers, W.rows, W.mapping, buildNormMaps());
        const validation = HR().validate(records, W.mapping);
        const id = HR().uuid();
        HR().addSnapshot({ id, period, periodLabel, asOf, fileName: W.fileName }, records, dynamicFields, validation);
        toast('تم اعتماد البيانات', 'ok');
        App.loadState().then(() => { App.filters = {}; location.hash = '#/dashboard'; window.route(); });
      } catch (e) { toast('تعذّر الحفظ: ' + (e.message || ''), 'err'); btn.disabled = false; btn.textContent = 'اعتماد وحفظ البيانات'; }
    });
  }
})();
