/* app.js — core controller: auth, routing, layout, filters, search, print. */
(function () {
 const $ = (s, r = document) => r.querySelector(s);
 const $$ = (s, r = document) => [...r.querySelectorAll(s)];
 document.getElementById('yr').textContent = new Date().getFullYear();

 const App = {
 me: null, state: null, filters: {}, currentRoute: null,
 };
 window.App = App;

 // ---------- API ----------
 async function api(path, opts = {}) {
 const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts));
 if (res.status === 401) { showLogin(); throw new Error('unauthenticated'); }
 const ct = res.headers.get('content-type') || '';
 const body = ct.includes('json') ? await res.json() : await res.text();
 if (!res.ok) throw Object.assign(new Error(body.error || 'error'), { status: res.status, body });
 return body;
 }
 function qs(extra = {}) {
 const f = Object.assign({}, App.filters, extra);
 const p = new URLSearchParams();
 Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
 const s = p.toString();
 return s ? '?' + s : '';
 }
 App.api = api; App.qs = qs;

 // ---------- Formatting ----------
 const fmt = {
 n: (v, d = 0) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
 money: (v) => (v == null || isNaN(v)) ? '—' : Number(Math.round(v)).toLocaleString('en-US') + ' <span class="cur">SAR</span>',
 moneyPlain: (v) => (v == null || isNaN(v)) ? '—' : Number(Math.round(v)).toLocaleString('en-US') + ' SAR',
 pct: (v, d = 2) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d) + '%',
 days: (v) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(2) + ' يوم',
 date: (iso) => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return iso; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; },
 esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
 };
 window.fmt = fmt;

 function toast(msg, kind = '') {
 const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
 $('#toasts').appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3400);
 }
 window.toast = toast;

 // ---------- Modal ----------
 function modal(html, opts = {}) {
 const root = $('#modalRoot');
 root.innerHTML = `<div class="modal-bg" id="mbg"><div class="modal ${opts.sm ? 'sm' : ''}">${html}</div></div>`;
 const close = () => { root.innerHTML = ''; };
 $('#mbg').addEventListener('click', (e) => { if (e.target.id === 'mbg' && opts.dismiss !== false) close(); });
 $$('.modal-close', root).forEach((b) => b.addEventListener('click', close));
 return { close, root };
 }
 window.modal = modal;

 // ---------- Nav definition ----------
 const NAV = [
 { gkey: 'nav_overview', items: [
 { id: 'dashboard', key: 'n_dashboard', perm: 'view_dashboard', ico: 'activity' },
 { id: 'insights', key: 'n_insights', perm: 'view_insights', ico: 'activity' },
 { id: 'reports', key: 'n_reports', perm: 'view_dashboard', ico: 'printer' },
 ]},
 { gkey: 'nav_workforce', items: [
 { id: 'workforce', key: 'n_workforce', perm: 'view_workforce', ico: 'users' },
 { id: 'saudization', key: 'n_saudization', perm: 'view_saudization', ico: 'user-check' },
 { id: 'nationality', key: 'n_nationality', perm: 'view_nationality', ico: 'globe' },
 { id: 'departments', key: 'n_departments', perm: 'view_departments', ico: 'building' },
 { id: 'jobtitles', key: 'n_jobtitles', perm: 'view_jobtitles', ico: 'briefcase' },
 ]},
 { gkey: 'nav_compliance', items: [
 { id: 'employees', key: 'n_employees', perm: 'view_employees', ico: 'search' },
 { id: 'movements', key: 'n_movements', perm: 'view_movements', ico: 'trending-up' },
 { id: 'monthly', key: 'n_monthly', perm: 'view_movements', ico: 'repeat' },
 { id: 'compare', key: 'n_compare', perm: 'view_comparison', ico: 'scale' },
 { id: 'leave', key: 'n_leave', perm: 'view_leave', ico: 'sun' },
 { id: 'salary', key: 'n_salary', perm: 'view_salary', ico: 'wallet' },
 { id: 'expiry', key: 'n_expiry', perm: 'view_expiry', ico: 'clock' },
 ]},
 { gkey: 'nav_data', items: [
 { id: 'rules', key: 'n_rules', perm: 'view_saudization', ico: 'scale' },
 { id: 'upload', key: 'n_upload', perm: 'upload_data', ico: 'arrow-up' },
 { id: 'history', key: 'n_uploads', perm: 'view_dashboard', ico: 'layers' },
 { id: 'audit', key: 'n_audit', perm: 'view_audit', ico: 'shield' },
 { id: 'users', key: 'n_users', perm: 'manage_users', ico: 'user' },
 ]},
 ];
 const T = (k) => (window.I18N ? window.I18N.t(k) : k);
 function can(perm) { return App.me && App.me.permissions.includes(perm); }
 window.can = can;

 function renderNav() {
 const nav = $('#nav'); nav.innerHTML = '';
 NAV.forEach((g) => {
 const items = g.items.filter((i) => can(i.perm));
 if (!items.length) return;
 const gEl = document.createElement('div'); gEl.className = 'nav-group';
 gEl.innerHTML = `<div class="nav-group-t">${fmt.esc(T(g.gkey))}</div>`;
 items.forEach((i) => {
 const a = document.createElement('a');
 a.className = 'nav-item'; a.href = '#/' + i.id; a.dataset.route = i.id;
 a.innerHTML = `<span class="ico">${window.icon ? icon(i.ico) : ''}</span><span>${fmt.esc(T(i.key))}</span>`;
 gEl.appendChild(a);
 });
 nav.appendChild(gEl);
 });
 $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === App.currentRoute));
 }

 // ---------- Filters ----------
 const FILTER_PAGES = new Set(['dashboard', 'workforce', 'saudization', 'nationality', 'departments', 'jobtitles', 'leave', 'salary', 'expiry', 'insights']);
 function renderFilters() {
 const bar = $('#filterbar');
 if (!App.state || !App.state.hasData || !FILTER_PAGES.has(App.currentRoute)) { bar.classList.add('hide'); renderActiveFilters(); return; }
 bar.classList.remove('hide');
 const o = App.state.options || {};
 const snaps = App.state.snapshots || [];
 const sel = (key, label, list, valMap) => {
 const opts = ['<option value="">الكل</option>'].concat((list || []).map((v) => {
 const val = valMap ? v.id : v; const txt = valMap ? v.label : v;
 return `<option value="${fmt.esc(val)}" ${App.filters[key] === String(val) ? 'selected' : ''}>${fmt.esc(txt)}</option>`;
 })).join('');
 return `<div class="fl"><label>${label}</label><select data-filter="${key}">${opts}</select></div>`;
 };
 bar.innerHTML =
 sel('period', 'الفترة', snaps.map((s) => ({ id: s.id, label: s.periodLabel || s.period })), true) +
 sel('division', 'المنشأة', o.division) +
 sel('department', 'القسم', o.department) +
 sel('position', 'المسمى', o.position) +
 sel('nationality', 'الجنسية', o.nationality) +
 sel('level', 'الدرجة', o.level) +
 `<div class="fl"><label>الجنس</label><select data-filter="gender"><option value="">الكل</option><option value="male" ${App.filters.gender === 'male' ? 'selected' : ''}>ذكر</option><option value="female" ${App.filters.gender === 'female' ? 'selected' : ''}>أنثى</option></select></div>` +
 `<div class="fl"><label>الجنسية (تصنيف)</label><select data-filter="saudi"><option value="">الكل</option><option value="saudi" ${App.filters.saudi === 'saudi' ? 'selected' : ''}>سعودي</option><option value="non_saudi" ${App.filters.saudi === 'non_saudi' ? 'selected' : ''}>غير سعودي</option></select></div>` +
 `<button class="filter-reset" id="filterReset">✕ مسح الفلاتر</button>`;
 $$('#filterbar select').forEach((s) => s.addEventListener('change', () => {
 App.filters[s.dataset.filter] = s.value; renderActiveFilters(); route();
 }));
 $('#filterReset').addEventListener('click', () => { App.filters = {}; renderFilters(); renderActiveFilters(); route(); });
 renderActiveFilters();
 }
 const FILTER_LABELS = { period: 'الفترة', division: 'المنشأة', department: 'القسم', position: 'المسمى', nationality: 'الجنسية', level: 'الدرجة', gender: 'الجنس', saudi: 'التصنيف' };
 function renderActiveFilters() {
 const el = $('#activeFilters'); const active = Object.entries(App.filters).filter(([k, v]) => v && k !== 'period');
 if (!active.length || App.currentRoute === 'upload') { el.innerHTML = ''; return; }
 el.innerHTML = active.map(([k, v]) => {
 let disp = v; if (k === 'period') { const s = (App.state.snapshots || []).find((x) => x.id === v); disp = s ? s.periodLabel : v; }
 if (k === 'gender') disp = v === 'male' ? 'ذكر' : 'أنثى'; if (k === 'saudi') disp = v === 'saudi' ? 'سعودي' : 'غير سعودي';
 return `<span class="af"><b>${FILTER_LABELS[k]}:</b> ${fmt.esc(disp)} <span data-clear="${k}">✕</span></span>`;
 }).join('');
 $$('#activeFilters [data-clear]').forEach((x) => x.addEventListener('click', () => { delete App.filters[x.dataset.clear]; renderFilters(); route(); }));
 }

 // ---------- Router ----------
 async function route() {
 const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
 const [page, param] = hash.split('/');
 App.currentRoute = page;
 $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === page));
 $('#sidebar').classList.remove('open'); $('.sidebar-backdrop')?.remove();
 renderFilters();
 const content = $('#content');
 if (Chart) Chart.disposeAll();
 // permission gate
 const navItem = NAV.flatMap((g) => g.items).find((i) => i.id === page);
 if (navItem && !can(navItem.perm)) { content.innerHTML = accessDenied(); return; }
 content.innerHTML = '<div class="spinner"></div>';
 try {
 if (page === 'employee') return Pages.employee(content, param);
 if (Pages[page]) return await Pages[page](content, param);
 content.innerHTML = accessDenied('الصفحة غير موجودة');
 } catch (e) {
 if (e.message === 'unauthenticated') return;
 console.error(e); content.innerHTML = `<div class="empty"><h3>تعذّر تحميل الصفحة</h3><p>${fmt.esc(e.message || '')}</p></div>`;
 }
 }
 window.route = route;
 function accessDenied(msg) { return `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg><h3>${msg || 'لا تملك صلاحية الوصول'}</h3><p>يرجى التواصل مع مدير النظام لمنحك الصلاحية المناسبة.</p></div>`; }

 // ---------- Global search ----------
 let searchTimer;
 function initSearch() {
 const inp = $('#globalSearch'); const box = $('#suggest');
 inp.addEventListener('input', () => {
 clearTimeout(searchTimer);
 const q = inp.value.trim();
 if (q.length < 1) { box.classList.add('hide'); return; }
 if (!can('view_employees')) { box.classList.add('hide'); return; }
 searchTimer = setTimeout(async () => {
 try {
 const r = await api('/api/employees?q=' + encodeURIComponent(q) + (App.filters.period ? '&period=' + App.filters.period : ''));
 if (r.empty || !r.employees.length) { box.innerHTML = '<div class="suggest-item">لا نتائج</div>'; box.classList.remove('hide'); return; }
 box.innerHTML = r.employees.slice(0, 8).map((e) => `<div class="suggest-item" data-code="${fmt.esc(e.employee_code)}"><span class="code">${fmt.esc(e.employee_code)}</span><div><div style="font-weight:700">${fmt.esc(e.arabic_name || e.name)}</div><div style="font-size:11px;color:var(--muted)">${fmt.esc(e.position || '')} · ${fmt.esc(e.section || '')}</div></div></div>`).join('') + (r.total > 8 ? `<div class="suggest-item" style="justify-content:center;color:var(--muted)">+${r.total - 8} نتيجة أخرى — اضغط Enter</div>` : '');
 box.classList.remove('hide');
 $$('.suggest-item[data-code]', box).forEach((it) => it.addEventListener('click', () => { box.classList.add('hide'); inp.value = ''; location.hash = '#/employee/' + it.dataset.code; }));
 } catch (e) {}
 }, 200);
 });
 inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); box.classList.add('hide'); if (can('view_employees')) location.hash = '#/employees?q=' + encodeURIComponent(inp.value.trim()); } });
 document.addEventListener('click', (e) => { if (!e.target.closest('.search-box')) box.classList.add('hide'); });
 }

 // ---------- Topbar ----------
 function initTopbar() {
 $('#menuBtn').addEventListener('click', () => {
 const sb = $('#sidebar'); sb.classList.toggle('open');
 if (sb.classList.contains('open')) { const bd = document.createElement('div'); bd.className = 'sidebar-backdrop'; bd.addEventListener('click', () => { sb.classList.remove('open'); bd.remove(); }); document.body.appendChild(bd); }
 else $('.sidebar-backdrop')?.remove();
 });
 $('#userBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#userMenu').classList.toggle('hide'); });
 document.addEventListener('click', () => $('#userMenu').classList.add('hide'));
 $('#userMenu').addEventListener('click', (e) => e.stopPropagation());
 $('#miLogout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); location.reload(); });
 $('#miPrint').addEventListener('click', () => { $('#userMenu').classList.add('hide'); Pages.printCurrent(); });
 $('#miReport').addEventListener('click', () => { $('#userMenu').classList.add('hide'); location.hash = '#/reports'; });
 initLangTheme();
 $('#periodChip').addEventListener('click', () => openPeriodPicker());
 }
 function openPeriodPicker() {
 if (!App.state || !App.state.snapshots.length) { location.hash = '#/upload'; return; }
 const snaps = App.state.snapshots.slice().reverse();
 const m = modal(`<div class="modal-head"><h3>اختيار فترة التقرير</h3><button class="modal-close">✕</button></div><div class="modal-body"><p style="color:var(--muted);margin-top:0">اختر الملف الشهري النشط لعرض تحليلاته.</p><div class="tbl-wrap"><table class="tbl clickable"><thead><tr><th>الفترة</th><th>الملف</th><th>الموظفون</th><th>السعودة</th><th>الجودة</th></tr></thead><tbody>${snaps.map((s) => `<tr data-id="${s.id}"><td><b>${fmt.esc(s.periodLabel || s.period)}</b></td><td style="color:var(--muted)">${fmt.esc(s.fileName)}</td><td class="num">${fmt.n(s.employeeCount)}</td><td class="num">${fmt.pct(s.saudiPct)}</td><td><span class="badge ${s.qualityScore >= 90 ? 'b-ok' : s.qualityScore >= 75 ? 'b-warn' : 'b-danger'}">${fmt.pct(s.qualityScore, 1)}</span></td></tr>`).join('')}</tbody></table></div></div>`, { sm: false });
 $$('tr[data-id]', m.root).forEach((tr) => tr.addEventListener('click', async () => { await api('/api/uploads/' + tr.dataset.id + '/activate', { method: 'POST' }); App.filters.period = ''; m.close(); await loadState(); location.hash = '#/dashboard'; route(); toast('تم تفعيل الفترة', 'ok'); }));
 }

 // ---------- State ----------
 async function loadState() {
 App.state = await api('/api/state');
 // topbar
 if (App.state.active) { $('#periodLabel').textContent = App.state.active.periodLabel || App.state.active.period || '—'; }
 else $('#periodLabel').textContent = 'لا توجد بيانات';
 const q = App.state.quality;
 const chip = $('#qualityChip');
 if (q) { chip.classList.remove('hide', 'mid', 'low'); if (q.score < 75) chip.classList.add('low'); else if (q.score < 90) chip.classList.add('mid'); $('#qualityVal').textContent = q.score.toFixed(1) + '%'; }
 else chip.classList.add('hide');
 $('#sideFoot').innerHTML = App.state.active ? `الفترة النشطة<br><b style="color:#fff">${fmt.esc(App.state.active.periodLabel || '')}</b>` : 'لم تُرفع بيانات بعد';
 }
 App.loadState = loadState;
 App.reload = async () => { await loadState(); renderFilters(); route(); };

 // ---------- Login ----------
 function showLogin() { $('#app').classList.add('hide'); $('#login').classList.remove('hide'); $('#passcode').focus(); }
 function initLogin() {
 $('#loginForm').addEventListener('submit', async (e) => {
 e.preventDefault();
 const btn = $('#loginBtn'); const err = $('#loginErr'); err.textContent = '';
 const pass = $('#passcode').value.trim();
 if (!pass) return;
 btn.disabled = true; btn.textContent = 'جارٍ الدخول…';
 try {
 const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ passcode: pass }) });
 App.me = r.user; await boot();
 } catch (ex) {
 if (ex.body && ex.body.error === 'locked') err.textContent = `تم قفل الدخول مؤقتاً لمدة ${ex.body.lockMinutes || 15} دقيقة بعد محاولات خاطئة.`;
 else err.textContent = 'رمز الدخول غير صحيح.';
 $('#passcode').value = ''; $('#passcode').focus();
 } finally { btn.disabled = false; btn.textContent = 'تسجيل الدخول'; }
 });
 }

 async function boot() {
 $('#login').classList.add('hide'); $('#app').classList.remove('hide');
 $('#userName').textContent = App.me.name; $('#userRole').textContent = (App.me.roleLabel || '').split('—')[0];
 $('#userAv').textContent = (App.me.name || 'U').trim().charAt(0).toUpperCase();
 $('#miSession').textContent = 'جلسة: ' + App.me.username + ' · تنتهي بعد خمول 30 دقيقة';
 renderNav();
 await loadState();
 if (!location.hash) location.hash = '#/dashboard';
 route();
 }

 window.addEventListener('hashchange', route);

 // ---------- Language & Theme ----------
 function applyChrome() {
 const l = window.I18N.lang;
 document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
 document.documentElement.setAttribute('lang', l);
 document.documentElement.setAttribute('data-theme', window.I18N.theme);
 // toggle button active states
 $$('#langToggle button').forEach((b) => b.classList.toggle('on', b.dataset.lang === l));
 $$('#themeToggle button').forEach((b) => b.classList.toggle('on', b.dataset.themeBtn === window.I18N.theme));
 // static chrome text
 const set = (sel, txt) => { const e = $(sel); if (e) e.textContent = txt; };
 set('#qualityLbl', T('quality'));
 const gs = $('#globalSearch'); if (gs) gs.placeholder = T('search_ph');
 set('#miPrint', T('print_page')); set('#miReport', T('reports_center')); set('#miLogout', T('logout'));
 // login + sidebar brand
 set('.brand-sub', T('brand_sub'));
 const lh = $('#login h1'); if (lh) lh.textContent = T('login_title');
 const lp = $('#login p'); if (lp) lp.textContent = T('login_sub');
 set('#loginBtn', T('login_btn'));
 const pc = $('#passcode'); if (pc) pc.placeholder = T('passcode_ph');
 }
 function initLangTheme() {
 $('#langToggle').addEventListener('click', (e) => {
 const b = e.target.closest('button[data-lang]'); if (!b) return;
 window.I18N.setLang(b.dataset.lang); applyChrome();
 if (App.me) { renderNav(); renderFilters(); route(); }
 });
 $('#themeToggle').addEventListener('click', (e) => {
 const b = e.target.closest('button[data-theme-btn]'); if (!b) return;
 window.I18N.setTheme(b.dataset.themeBtn); applyChrome();
 setTimeout(() => { if (window.Chart) Chart.resizeAll(); }, 50);
 });
 applyChrome();
 }
 App.applyChrome = applyChrome;

 // ---------- Init ----------
 async function start() {
 initLogin(); initTopbar(); initSearch();
 try { const r = await api('/api/me'); App.me = r.user; await boot(); }
 catch (e) { showLogin(); }
 }
 // wait for deferred libs
 if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
