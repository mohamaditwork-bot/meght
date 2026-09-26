/* =============================================================
   Manager evaluation page (shareable link)
   Loaded at /e/<token>. Lets a direct manager complete the
   performance evaluation for the invited employee (or a title
   they choose) and submit it to the central system. No admin
   login required — the link token is the key.
   ============================================================= */
(function () {
  const D = window.APPRAISAL_DATA;
  const SC = window.SCORING;

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const state = { lang: 'ar', token: null, invite: null, deptId: null, hotelName: '', ratings: {}, signatures: {} };
  const t = (k) => { const d = window.I18N[state.lang]; return (d && k in d) ? d[k] : k; };
  const L = (o) => (o ? (state.lang === 'ar' ? (o.ar || o.en) : (o.en || o.ar)) : '');
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden', 'toast-show');
    void el.offsetWidth; el.classList.add('toast-show');
    clearTimeout(el._t); el._t = setTimeout(() => { el.classList.add('hidden'); el.classList.remove('toast-show'); }, 2600);
  }

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    $('#lang-toggle').textContent = state.lang === 'ar' ? 'EN' : 'ع';
    try { localStorage.setItem('mig_lang', state.lang); } catch (e) {}
    if (state.invite) render(); // re-render current state in new language
  }

  function tokenFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.get('token')) return params.get('token');
    const parts = location.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  }

  const BASE = '/evaluation'; // the appraisal app is mounted under /appraisal
  async function req(method, url, body) {
    const opt = { method, headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(BASE + url, opt);
    let data = null; try { data = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, data };
  }

  function messageCard(text, tone) {
    $('#invite-root').innerHTML =
      `<div class="card" style="max-width:520px;margin:48px auto;text-align:center">
        <div style="font-size:46px;line-height:1">${tone === 'ok' ? '✅' : 'ℹ️'}</div>
        <h2>${esc(text)}</h2>
      </div>`;
  }

  function critInput(prefix, it) {
    const key = prefix + '.' + it.id;
    const val = state.ratings[key];
    return `<tr>
      <td>${esc(L(it))}</td>
      <td class="ltr" style="text-align:center;width:56px">${it.weight}</td>
      <td style="min-width:200px">${window.ScoreCtl.html(key, it.weight, val)}</td>
    </tr>`;
  }

  function criteriaHTML() {
    if (!state.deptId) return `<div class="card empty">${esc(t('selectDeptToStart'))}</div>`;
    const dep = SC.getDepartment(state.deptId);
    const coreRows = D.CORE_SECTIONS.map((sec) =>
      `<tr class="sec-row"><td colspan="3"><b>${esc(L(sec))}</b></td></tr>` +
      sec.items.map((it) => critInput('core', it)).join('')).join('');
    const deptRows = dep.items.map((it) => critInput('dept', it)).join('');
    return `<div class="card">
      <h2>${esc(t('coreEval') || 'Core Evaluation')} <span class="muted">(${D.CORE_MAX})</span></h2>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>${esc(t('criterion') || 'Criterion')}</th><th style="text-align:center">${esc(t('weight') || 'Weight')}</th><th>${esc(t('score') || 'Score')}</th>
      </tr></thead><tbody>${coreRows}</tbody></table></div>
    </div>
    <div class="card">
      <h2>${esc(L(dep))} <span class="muted">(${D.DEPT_MAX})</span></h2>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>${esc(t('criterion') || 'Criterion')}</th><th style="text-align:center">${esc(t('weight') || 'Weight')}</th><th>${esc(t('score') || 'Score')}</th>
      </tr></thead><tbody>${deptRows}</tbody></table></div>
    </div>
    <div class="card" id="score-summary"></div>`;
  }

  function recalc() {
    const el = $('#score-summary'); if (!el) return;
    if (!state.deptId) { el.innerHTML = ''; return; }
    const s = SC.compute(state.deptId, state.ratings);
    el.innerHTML = `<div class="kpi-grid">
      <div class="kpi"><div class="k-val">${s.core}</div><div class="k-lbl">${esc(t('coreEval') || 'Core')} / ${s.coreMax}</div></div>
      <div class="kpi"><div class="k-val">${s.dept}</div><div class="k-lbl">${esc(t('department'))} / ${s.deptMax}</div></div>
      <div class="kpi"><div class="k-val">${s.total}</div><div class="k-lbl">${esc(t('score'))} / ${s.totalMax}</div></div>
      <div class="kpi"><div class="k-val">${s.pct}%</div><div class="k-lbl"><span class="badge" style="background:${s.level.color}">${esc(L(s.level))}</span></div></div>
    </div>`;
  }

  function render() {
    const inv = state.invite;
    const locked = (k) => inv[k] != null && String(inv[k]).trim() !== '';
    const deptLocked = inv.lockDept && inv.deptId;
    const roText = (label, value) => `<div class="field"><label>${esc(label)}</label><input value="${esc(value)}" readonly></div>`;
    const editText = (id, label, value) => `<div class="field"><label>${esc(label)}</label><input id="${id}" value="${esc(value || '')}"></div>`;

    // Hotel: preset by the admin → read-only; otherwise the manager picks it.
    const hotelPreset = !!(inv.hotelName && String(inv.hotelName).trim());
    const hotels = D.SEED_HOTELS || [];
    const hotelField = hotelPreset
      ? roText(t('hotel'), inv.hotelName)
      : `<div class="field"><label>${esc(t('hotel'))}</label>
          <select id="iv-hotel"><option value="">${esc(t('chooseHotel') || t('hotel'))}</option>
            ${hotels.map((h) => `<option value="${esc(L(h))}" ${state.hotelName === L(h) ? 'selected' : ''}>${esc(L(h))}</option>`).join('')}
          </select></div>`;

    const deptField = deptLocked
      ? roText(t('department'), L(SC.getDepartment(inv.deptId) || {}))
      : `<div class="field"><label>${esc(t('department'))}</label>
          <select id="iv-dept"><option value="">${esc(t('chooseDept') || t('managerChoosesDept'))}</option>
            ${D.DEPARTMENTS.map((d) => `<option value="${d.id}" ${state.deptId === d.id ? 'selected' : ''}>${esc(L(d))}</option>`).join('')}
          </select></div>`;

    const heroDept = inv.deptId ? L(SC.getDepartment(inv.deptId) || {}) : '';
    const heroBits = [inv.hotelName, heroDept].filter(Boolean).join(' · ');
    $('#invite-root').innerHTML =
      `<div class="invite-hero">
        <div class="ih-badge">${esc(t('evalFormTitle'))}</div>
        <h1>${esc(inv.employeeName || t('employee'))}</h1>
        ${heroBits ? `<div class="ih-sub">${esc(heroBits)}</div>` : ''}
        <p class="ih-intro">${esc(t('inviteIntro'))}</p>
        ${inv.note ? `<div class="ih-note"><b>${esc(t('note'))}:</b> ${esc(inv.note)}</div>` : ''}
      </div>
      <div class="card"><h2>${esc(t('employee'))}</h2>
        <div class="grid-2">
          ${hotelField}
          ${deptField}
          ${locked('employeeName') ? roText(t('employee'), inv.employeeName) : editText('iv-emp', t('employee'), '')}
          ${locked('employeeNo') ? roText(t('fileNo'), inv.employeeNo) : editText('iv-fileno', t('fileNo'), '')}
          ${locked('jobTitle') ? roText(t('jobTitle'), inv.jobTitle) : editText('iv-job', t('jobTitle'), '')}
          ${editText('iv-mgr', t('yourName'), inv.managerName || '')}
          <div class="field"><label>${esc(t('evalFrom') || 'From')}</label><input type="date" id="iv-from"></div>
          <div class="field"><label>${esc(t('evalTo') || 'To')}</label><input type="date" id="iv-to"></div>
        </div>
      </div>
      <div id="crit-area">${criteriaHTML()}</div>
      <div class="card"><h2>${esc(t('managerNotes') || 'Manager notes & recommendation')}</h2>
        <div class="field"><label>${esc(t('strengths') || 'Strengths')}</label><textarea id="iv-strengths"></textarea></div>
        <div class="field"><label>${esc(t('improvements') || 'Areas to improve')}</label><textarea id="iv-improvements"></textarea></div>
        <div class="field"><label>${esc(t('objectives') || 'Objectives / improvement actions')}</label><textarea id="iv-objectives"></textarea></div>
        <div class="field"><label>${esc(t('managerNotes') || 'Notes')}</label><textarea id="iv-notes"></textarea></div>
        <div class="field"><label>${esc(t('recommendation') || 'Direct manager recommendation')}</label>
          <select id="iv-rec"><option value="">—</option>
            ${D.DIRECT_MANAGER_RECOMMENDATIONS.map((r) => `<option value="${r.id}">${esc(L(r))}</option>`).join('')}</select></div>
      </div>
      <div class="card" id="iv-sign-card"><h2>${esc(t('signatures'))}</h2>
        <div id="iv-sign-status"></div>
        <div id="iv-sign-pads"></div>
      </div>
      <div class="page-title" style="justify-content:flex-end">
        <button class="btn btn-primary" id="iv-submit">${esc(t('submitEvaluation'))}</button>
      </div>`;

    const hotelSel = $('#iv-hotel');
    if (hotelSel) hotelSel.addEventListener('change', (e) => {
      state.hotelName = e.target.value || '';
      const sub = document.querySelector('.invite-hero .ih-sub');
      const bits = [state.hotelName, state.deptId ? L(SC.getDepartment(state.deptId) || {}) : ''].filter(Boolean).join(' · ');
      if (sub) sub.textContent = bits;
    });
    if (!deptLocked) {
      $('#iv-dept').addEventListener('change', (e) => {
        state.deptId = e.target.value || null;
        // drop dept.* ratings when the department changes
        Object.keys(state.ratings).forEach((k) => { if (k.startsWith('dept.')) delete state.ratings[k]; });
        $('#crit-area').innerHTML = criteriaHTML();
        bindCrit(); recalc();
      });
    }
    bindCrit(); recalc();
    initSignatures();
    $('#iv-submit').addEventListener('click', submit);
  }

  function refreshSignStatus() {
    const el = $('#iv-sign-status'); if (!el) return;
    el.innerHTML = window.SigPad.statusHTML({ signatories: D.SIGNATORIES, signatures: state.signatures, lang: state.lang, t });
  }
  function initSignatures() {
    const pads = $('#iv-sign-pads'); if (!pads || !window.SigPad) return;
    pads.innerHTML = window.SigPad.card({ signatories: D.SIGNATORIES, signatures: state.signatures, t, lang: state.lang });
    window.SigPad.init(pads, state.signatures, refreshSignStatus, t);
    refreshSignStatus();
  }

  function bindCrit() {
    const area = $('#crit-area') || document;
    window.ScoreCtl.bind(area, (key, val) => {
      if (val === null) delete state.ratings[key]; else state.ratings[key] = val;
      recalc();
    });
  }

  function firstInvalid() {
    // Hotel + department must be chosen before starting the evaluation.
    if ($('#iv-hotel') && !state.hotelName) return $('#iv-hotel');
    if (!state.deptId) return $('#iv-dept');
    const inv = state.invite;
    if (!(inv.employeeName || (($('#iv-emp') && $('#iv-emp').value) || '').trim())) return $('#iv-emp');
    if (!(($('#iv-mgr') && $('#iv-mgr').value) || '').trim()) return $('#iv-mgr');
    const missingCtl = $$('.score-ctl').find((c) => !c.classList.contains('has-val'));
    return missingCtl ? missingCtl.querySelector('.sc-num') : null;
  }

  async function submit() {
    const bad = firstInvalid();
    if (bad) {
      const ctl = bad.closest ? bad.closest('.score-ctl') : null;
      (ctl || bad).classList.add('invalid');
      bad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { bad.focus(); } catch (e) {}
      toast(t('fillRequired') || t('required'));
      return;
    }
    const inv = state.invite;
    const val = (id) => { const el = $(id); return el ? el.value.trim() : ''; };
    const payload = {
      deptId: state.deptId,
      employeeName: inv.employeeName || val('#iv-emp'),
      employeeNo: inv.employeeNo || val('#iv-fileno'),
      jobTitle: inv.jobTitle || val('#iv-job'),
      managerName: val('#iv-mgr') || inv.managerName || '',
      periodId: inv.periodId || '',
      hotelName: inv.hotelName || state.hotelName || '',
      evalDateFrom: val('#iv-from'), evalDateTo: val('#iv-to'),
      ratings: state.ratings,
      strengths: val('#iv-strengths'), improvements: val('#iv-improvements'), objectives: val('#iv-objectives'),
      managerNotes: val('#iv-notes'), managerRecommendation: val('#iv-rec'),
      signatures: state.signatures,
      lang: state.lang,
    };
    const btn = $('#iv-submit'); btn.disabled = true; btn.textContent = t('loading');
    const r = await req('POST', '/api/public/invite/' + encodeURIComponent(state.token) + '/submit', payload);
    if (r.ok && r.data && r.data.ok) {
      const s = r.data.score || {};
      const again = r.data.reusable ? `<button class="btn btn-primary" id="iv-again" style="margin-top:14px">${esc(t('submitAnother'))}</button>` : '';
      const signStatus = window.SigPad.statusHTML({ signatories: D.SIGNATORIES, signatures: state.signatures, lang: state.lang, t });
      $('#invite-root').innerHTML =
        `<div class="card" style="max-width:560px;margin:48px auto;text-align:center">
          <div style="font-size:52px;line-height:1">✅</div>
          <h2>${esc(t('evalSubmitted'))}</h2>
          <p class="muted">${esc(t('reportNo'))}: <b class="ltr">${esc(r.data.reportNo || '')}</b></p>
          <div style="margin:10px 0">${signStatus}</div>
          <div class="kpi-grid" style="margin-top:8px">
            <div class="kpi"><div class="k-val">${s.total != null ? s.total : '—'}</div><div class="k-lbl">${esc(t('score'))} / ${D.TOTAL_MAX}</div></div>
            <div class="kpi"><div class="k-val">${s.pct != null ? s.pct + '%' : '—'}</div><div class="k-lbl">${esc(t('kpiAvgPct') || '%')}</div></div>
          </div>
          ${again}
        </div>`;
      const againBtn = $('#iv-again');
      if (againBtn) againBtn.addEventListener('click', () => {
        state.ratings = {};
        if (!(state.invite.lockDept && state.invite.deptId)) state.deptId = state.invite.deptId || null;
        render();
        window.scrollTo(0, 0);
      });
    } else {
      btn.disabled = false; btn.textContent = t('submitEvaluation');
      const reason = r.data && r.data.error;
      const map = { submitted: 'inviteSubmittedAlready', revoked: 'inviteRevoked', expired: 'inviteExpired', not_found: 'inviteInvalid' };
      toast(t(map[reason] || 'saveFailed'));
      if (reason && map[reason] && reason !== 'department_required' && reason !== 'employee_name_required') {
        messageCard(t(map[reason]));
      }
    }
  }

  async function init() {
    try { state.lang = localStorage.getItem('mig_lang') || 'ar'; } catch (e) {}
    applyLang();
    $('#lang-toggle').addEventListener('click', () => { state.lang = state.lang === 'ar' ? 'en' : 'ar'; applyLang(); });

    state.token = tokenFromUrl();
    if (!state.token) return messageCard(t('inviteInvalid'));
    const r = await req('GET', '/api/public/invite/' + encodeURIComponent(state.token));
    if (!r.ok || !r.data || !r.data.invite) return messageCard(t('inviteInvalid'));
    state.invite = r.data.invite;
    if (!r.data.usable) {
      const map = { submitted: 'inviteSubmittedAlready', revoked: 'inviteRevoked', expired: 'inviteExpired', not_found: 'inviteInvalid' };
      return messageCard(t(map[r.data.reason] || 'inviteInvalid'));
    }
    state.deptId = state.invite.deptId || null;
    state.hotelName = state.invite.hotelName || '';
    render();
  }

  init();
})();
