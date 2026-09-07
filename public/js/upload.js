/* upload.js — smart Excel upload wizard: mapping review, validation, commit. */
(function () {
 const api = (p, o) => App.api(p, o);
 const el = (id) => document.getElementById(id);
 const CORE_TARGETS = [
 ['employee_code', 'الرقم الوظيفي'], ['name', 'الاسم (إنجليزي)'], ['arabic_name', 'الاسم (عربي)'],
 ['level_code', 'الدرجة الوظيفية'], ['division', 'المنشأة / Division'], ['section', 'القسم'],
 ['position', 'المسمى الوظيفي'], ['total_salary', 'إجمالي الراتب'], ['end_annual_balance', 'رصيد الإجازة السنوية'],
 ['end_holiday_balance', 'رصيد الـHoliday'], ['gender', 'الجنس'], ['nationality', 'الجنسية'],
 ['hiring_date', 'تاريخ التعيين'], ['contract_expire_date', 'انتهاء العقد'], ['probation_date', 'انتهاء التجربة'],
 ['health_card_expire_date', 'انتهاء البطاقة الصحية'], ['residence_expire_date', 'انتهاء الإقامة'],
 ['passport_expire_date', 'انتهاء الجواز'],
 ];
 let W = null; // wizard state

 function steps(active) {
 const s = [['1', 'رفع الملف'], ['2', 'مطابقة الأعمدة'], ['3', 'الفحص والتنظيف'], ['4', 'الاعتماد']];
 return `<div class="steps">${s.map((x, i) => `<div class="step ${i + 1 === active ? 'active' : i + 1 < active ? 'done' : ''}"><span class="n">${i + 1 < active ? '✓' : x[0]}</span>${x[1]}</div>`).join('')}</div>`;
 }
 function h(title) { return `<div class="page-head"><div><h2>رفع بيانات Excel الذكي</h2><div class="sub">${title}</div></div></div>`; }

 Pages.upload = function (content) {
 W = null;
 content.innerHTML = h('ارفع ملف الموظفين الشهري — يقرأ النظام الأعمدة بالاسم وليس بالترتيب') + steps(1) +
 `<div class="panel"><div class="panel-body">
 <div class="dropzone" id="dz"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
 <h3>اسحب ملف Excel هنا أو اضغط للاختيار</h3><p>يدعم .xlsx و .xls — الحد الأقصى 25MB</p>
 <input type="file" id="fileInput" accept=".xlsx,.xls" hidden></div>
 <div id="uploadStatus" style="margin-top:14px"></div>
 </div></div>
 ${App.state && App.state.snapshots && App.state.snapshots.length ? '' : `<div class="data-note" style="margin-top:14px"> لا توجد بيانات بعد. يمكنك تجربة النظام بملفات العينة المرفقة في مجلد <code>data/samples</code> (أغسطس ثم سبتمبر 2026) لرؤية جميع التحليلات والحركات.</div>`}`;
 const dz = el('dz'), input = el('fileInput');
 dz.addEventListener('click', () => input.click());
 dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
 dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
 dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]); });
 input.addEventListener('change', () => { if (input.files[0]) doUpload(input.files[0]); });
 };

 async function doUpload(file) {
 el('uploadStatus').innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--muted)">جارٍ قراءة الملف وتحليل الأعمدة…</p>';
 const fd = new FormData(); fd.append('file', file);
 try {
 const res = await fetch('/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
 const r = await res.json();
 if (!res.ok) { el('uploadStatus').innerHTML = `<div class="data-note" style="border-color:var(--danger);color:var(--danger)">تعذّرت قراءة الملف: ${fmt.esc(r.message || r.error)}</div>`; return; }
 W = { pendingId: r.pendingId, fileName: r.fileName, headers: r.headers, rowCount: r.rowCount, mapping: r.mapping, period: r.period, validation: r.validation, sample: r.sample, approvedNorm: {} };
 renderMapping();
 } catch (e) { el('uploadStatus').innerHTML = `<div class="data-note" style="border-color:var(--danger)">خطأ في الرفع</div>`; }
 }

 function renderMapping() {
 const content = el('content');
 const conf = (m) => `<span class="conf ${m.status}">${m.status === 'confirmed' ? 'مؤكّد' : m.status === 'high' ? 'مطابقة عالية' : m.status === 'review' ? 'يحتاج مراجعة' : 'حقل ديناميكي'} ${m.confidence ? Math.round(m.confidence * 100) + '%' : ''}</span>`;
 const targetSelect = (m) => {
 const used = new Set(W.mapping.filter((x) => x !== m && !x.isDynamic && x.status !== 'ignore').map((x) => x.mappedKey));
 const opts = CORE_TARGETS.map(([k, l]) => `<option value="${k}" ${m.mappedKey === k ? 'selected' : ''} ${used.has(k) && m.mappedKey !== k ? 'disabled' : ''}>${l}</option>`).join('');
 return `<select data-col="${fmt.esc(m.column)}">
 <option value="__dynamic__" ${m.isDynamic ? 'selected' : ''}>➕ حقل ديناميكي (${fmt.esc(m.column)})</option>
 <option value="__ignore__" ${m.status === 'ignore' ? 'selected' : ''}> تجاهل هذا العمود</option>
 ${opts}</select>`;
 };
 const reviewCount = W.mapping.filter((m) => m.status === 'review').length;
 const dynCount = W.mapping.filter((m) => m.isDynamic).length;
 content.innerHTML = h(`الملف: ${fmt.esc(W.fileName)} · ${fmt.n(W.rowCount)} سجل`) + steps(2) +
 `<div class="kpi-grid">
 ${kpiMini('أعمدة الملف', W.mapping.length)}
 ${kpiMini('حقول أساسية مطابقة', W.mapping.filter((m) => !m.isDynamic && m.status !== 'ignore').length)}
 ${kpiMini('حقول ديناميكية', dynCount)}
 ${kpiMini('تحتاج مراجعة', reviewCount, reviewCount ? 'amber' : '')}
 </div>
 ${reviewCount ? `<div class="data-note"> يوجد ${reviewCount} عمود بمطابقة غير مؤكّدة. راجعها واعتمد التعيين الصحيح — لا يعتمد النظام أي Mapping غير مؤكّد دون موافقتك.</div>` : `<div class="data-note" style="border-color:rgba(22,163,74,.3);background:rgba(22,163,74,.06);color:var(--green-700)">✓ تم التعرف على جميع الأعمدة بالاسم (بغضّ النظر عن ترتيبها في الملف).</div>`}
 <div class="panel"><div class="panel-head"><h3>مطابقة الأعمدة</h3><span class="p-sub">العمود في الملف ← الحقل في النظام</span></div><div class="panel-body">
 <div class="map-row" style="font-weight:800;color:var(--muted);font-size:11px;border-bottom:2px solid var(--line)"><div>العمود في الملف</div><div>الثقة</div><div>الحقل المرجعي</div><div>نوع البيانات</div></div>
 ${W.mapping.map((m) => `<div class="map-row"><div class="col-name">${fmt.esc(m.column)}<div style="font-size:11px;color:var(--muted);font-weight:400">مثال: ${fmt.esc(sampleValue(m.column))}</div></div><div>${conf(m)}</div><div>${targetSelect(m)}</div><div><span class="badge b-muted">${typeLabel(m.dataType)}</span></div></div>`).join('')}
 </div></div>
 <div class="ph-actions" style="justify-content:flex-end;margin-top:16px;display:flex;gap:10px"><button class="btn" id="cancelUp">إلغاء</button><button class="btn btn-primary" id="toValidate">التالي: الفحص والتنظيف →</button></div>`;
 content.querySelectorAll('select[data-col]').forEach((s) => s.addEventListener('change', () => {
 const m = W.mapping.find((x) => x.column === s.dataset.col);
 if (s.value === '__dynamic__') { m.isDynamic = true; m.status = 'dynamic'; m.mappedKey = 'dyn_' + m.column.toLowerCase().replace(/\W+/g, '_'); }
 else if (s.value === '__ignore__') { m.status = 'ignore'; m.isDynamic = false; m.mappedKey = '__ignore__'; }
 else { m.isDynamic = false; m.status = 'confirmed'; m.mappedKey = s.value; }
 renderMapping();
 }));
 el('cancelUp').addEventListener('click', async () => { await api('/api/upload/' + W.pendingId, { method: 'DELETE' }); Pages.upload(content); });
 el('toValidate').addEventListener('click', validateStep);
 }
 function kpiMini(l, v, accent) { return `<div class="kpi ${accent ? 'accent-' + accent : ''}"><div class="k-top"><span class="k-label">${l}</span></div><div class="k-val">${fmt.n(v)}</div></div>`; }
 function typeLabel(t) { return { string: 'نص', number: 'رقم', date: 'تاريخ', key: 'مفتاح' }[t] || t; }
 function sampleValue(col) { const s = (W.sample || []).find((r) => r[col] != null && r[col] !== ''); return s ? String(s[col]).slice(0, 20) : '—'; }

 async function validateStep() {
 const content = el('content');
 content.innerHTML = h('جارٍ الفحص…') + steps(3) + '<div class="spinner"></div>';
 const r = await api('/api/upload/' + W.pendingId + '/analyze', { method: 'POST', body: JSON.stringify({ mapping: W.mapping, normalizationMaps: buildNormMaps() }) });
 W.validation = r.validation; W.kpis = r.kpis;
 renderValidation();
 }
 function buildNormMaps() {
 const maps = {};
 for (const [field, approved] of Object.entries(W.approvedNorm)) {
 const sug = W.validation.normalization?.[field];
 if (!sug) continue;
 maps[field] = {};
 sug.suggestions.forEach((s, i) => { if (approved[i]) maps[field][s.from] = s.to; });
 }
 return maps;
 }

 function renderValidation() {
 const content = el('content'); const v = W.validation; const q = v.quality;
 const c = v.counts;
 const issueRow = (label, n, tone) => `<div class="mini-kpi"><div class="m-l">${label}</div><div class="m-v" style="color:${n ? (tone || 'var(--danger)') : 'var(--ok)'}">${fmt.n(n)}</div></div>`;
 content.innerHTML = h(`${fmt.esc(W.fileName)} — نتيجة الفحص`) + steps(3) +
 `<div class="grid g-3" style="margin-bottom:16px">
 <div class="panel"><div class="panel-head"><h3>مؤشر جودة البيانات</h3></div><div class="panel-body"><div id="qGauge" class="chart sm"></div></div></div>
 <div class="panel col-span-2"><div class="panel-head"><h3>ملخّص الفحص</h3></div><div class="panel-body">
 <div class="mini-kpis">
 <div class="mini-kpi"><div class="m-l">إجمالي السجلات</div><div class="m-v">${fmt.n(v.total)}</div></div>
 <div class="mini-kpi"><div class="m-l">سجلات صحيحة</div><div class="m-v" style="color:var(--ok)">${fmt.n(v.valid)}</div></div>
 <div class="mini-kpi"><div class="m-l">بها مشاكل</div><div class="m-v" style="color:${v.invalid ? 'var(--danger)' : 'var(--ok)'}">${fmt.n(v.invalid)}</div></div>
 ${issueRow('رقم وظيفي مكرر', c.duplicate_code)}
 ${issueRow('بدون رقم وظيفي', c.missing_code)}
 ${issueRow('بدون اسم', c.missing_name)}
 ${issueRow('بدون قسم', c.missing_section, 'var(--warn)')}
 ${issueRow('بدون مسمى', c.missing_position, 'var(--warn)')}
 ${issueRow('رواتب غير منطقية', c.illogical_salary)}
 ${issueRow('تواريخ غير صحيحة', c.invalid_date, 'var(--warn)')}
 ${issueRow('حقول وثائق فارغة', c.missing_document, 'var(--muted)')}
 </div></div></div>
 </div>
 <div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>تفصيل مؤشر الجودة (${fmt.pct(q.score, 1)})</h3><span class="p-sub">شرح أسباب فقدان النقاط</span></div><div class="panel-body tbl-wrap">
 <table class="tbl"><thead><tr><th>المعيار</th><th>الوزن</th><th>النقاط المكتسبة</th><th>المفقودة</th><th>السبب</th></tr></thead><tbody>
 ${q.breakdown.map((b) => `<tr><td><b>${fmt.esc(b.label)}</b></td><td class="num">${b.weight}%</td><td class="num" style="color:var(--ok)">${b.earned}</td><td class="num" style="color:${b.lost ? 'var(--danger)' : 'var(--muted)'}">${b.lost || '—'}</td><td style="color:var(--muted)">${fmt.esc(b.reason || '—')}</td></tr>`).join('')}
 </tbody></table></div></div>
 ${renderNormalization(v.normalization)}
 <div class="data-note"> يحتفظ النظام دائماً بالقيمة الأصلية (Raw Value) بجانب القيمة المطبّعة (Normalized Value). لا تُعدّل البيانات الأصلية.</div>
 <div class="ph-actions" style="justify-content:space-between;margin-top:16px;display:flex;gap:10px"><button class="btn" id="backMap">← رجوع للمطابقة</button><button class="btn btn-primary" id="toCommit">التالي: الاعتماد →</button></div>`;
 requestAnimationFrame(() => requestAnimationFrame(() => Chart.gauge(el('qGauge'), q.score, { pct: true, dec: 1 })));
 el('backMap').addEventListener('click', renderMapping);
 el('toCommit').addEventListener('click', renderCommit);
 content.querySelectorAll('[data-norm]').forEach((chk) => chk.addEventListener('change', () => {
 const [field, idx] = chk.dataset.norm.split('|');
 W.approvedNorm[field] = W.approvedNorm[field] || {};
 W.approvedNorm[field][idx] = chk.checked;
 }));
 content.querySelectorAll('[data-norm-all]').forEach((b) => b.addEventListener('click', () => {
 const field = b.dataset.normAll; const sug = W.validation.normalization[field];
 W.approvedNorm[field] = {}; sug.suggestions.forEach((s, i) => W.approvedNorm[field][i] = true);
 renderValidation();
 }));
 }
 function renderNormalization(norm) {
 if (!norm || !Object.keys(norm).length) return '';
 const fieldLabels = { nationality: 'الجنسيات', section: 'الأقسام', position: 'المسميات', division: 'المنشآت', gender: 'الجنس', level_code: 'الدرجات' };
 return `<div class="panel" style="margin-bottom:16px"><div class="panel-head"><h3>اقتراحات التوحيد (Normalization)</h3><span class="p-sub">اختلافات إملائية محتملة — اعتمدها لتُطبّق عند الحفظ</span></div><div class="panel-body">
 ${Object.entries(norm).map(([field, sug]) => `<div style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>${fieldLabels[field] || field}</b><button class="btn" style="padding:4px 10px" data-norm-all="${field}">اعتماد الكل</button></div>
 ${sug.suggestions.map((s, i) => `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--line-2);border-radius:10px;margin-bottom:6px;cursor:pointer"><input type="checkbox" data-norm="${field}|${i}" ${W.approvedNorm[field]?.[i] ? 'checked' : ''}><span style="flex:1"><span class="badge b-warn">${fmt.esc(s.from)}</span> <b style="color:var(--teal-700)">←</b> <span class="badge b-ok">${fmt.esc(s.to)}</span></span><span style="color:var(--muted);font-size:11.5px">${fmt.n(s.count)} سجل · تشابه ${Math.round(s.similarity * 100)}%</span></label>`).join('')}
 </div>`).join('')}</div></div>`;
 }

 function renderCommit() {
 const content = el('content'); const p = W.period; const k = W.kpis;
 content.innerHTML = h('اعتماد البيانات') + steps(4) +
 `<div class="grid g-2">
 <div class="panel"><div class="panel-head"><h3>فترة التقرير</h3></div><div class="panel-body">
 ${p.confident ? `<div class="data-note" style="border-color:rgba(22,163,74,.3);background:rgba(22,163,74,.06);color:var(--green-700)">✓ تم تحديد الفترة من اسم الملف: <b>${fmt.esc(p.label)}</b></div>` : `<div class="data-note"> تعذّر تحديد الفترة من اسم الملف بدقة. تم استخدام تاريخ الرفع — يمكنك تعديلها.</div>`}
 <div class="form-grid">
 <div class="field"><label>اسم الفترة</label><input id="pLabel" value="${fmt.esc(p.label)}"></div>
 <div class="field"><label>رمز الفترة (YYYY-MM)</label><input id="pValue" value="${fmt.esc(p.value)}"></div>
 <div class="field"><label>تاريخ البيانات (as-of)</label><input id="pAsOf" type="date" value="${fmt.esc(p.asOf)}"></div>
 </div>
 <div style="font-size:12px;color:var(--muted)">الملف: ${fmt.esc(W.fileName)} · بواسطة: ${fmt.esc(App.me.username)} · ${new Date().toLocaleString('ar-EG')}</div>
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
 <div class="ph-actions" style="justify-content:space-between;margin-top:16px;display:flex;gap:10px"><button class="btn" id="backVal">← رجوع</button><button class="btn btn-primary" id="commitBtn">✓ اعتماد وحفظ البيانات</button></div>`;
 el('backVal').addEventListener('click', renderValidation);
 el('commitBtn').addEventListener('click', async () => {
 const btn = el('commitBtn'); btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
 try {
 const r = await api('/api/upload/' + W.pendingId + '/commit', { method: 'POST', body: JSON.stringify({
 mapping: W.mapping, normalizationMaps: buildNormMaps(),
 period: el('pValue').value.trim(), periodLabel: el('pLabel').value.trim(), asOf: el('pAsOf').value,
 }) });
 toast('تم اعتماد البيانات بنجاح', 'ok');
 await App.loadState();
 location.hash = '#/dashboard'; window.route();
 } catch (e) { toast('تعذّر الحفظ', 'err'); btn.disabled = false; btn.textContent = '✓ اعتماد وحفظ البيانات'; }
 });
 }
})();
