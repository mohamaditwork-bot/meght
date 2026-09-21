/* =============================================================
   MIG HR Appraisal — main SPA controller
   Manual employee entry (no database) + in-app drawn signatures.
   ============================================================= */
(function () {
  const D = window.APPRAISAL_DATA;
  const S = window.STORE;
  const SC = window.SCORING;

  S.ensureSeeded();

  const state = {
    lang: S.getLang(),
    view: "new",
    draft: null,
    performanceDraft: null,
    viewingId: null
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const t = (k) => { const d = window.I18N[state.lang]; return (d && k in d) ? d[k] : k; };
  const L = (o) => (o ? (state.lang === "ar" ? (o.ar || o.en) : (o.en || o.ar)) : "");

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.classList.remove("hidden", "toast-show");
    void el.offsetWidth; el.classList.add("toast-show");
    clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove("toast-show"); el.classList.add("hidden"); }, 2600);
  }
  function animateCards(root) {
    $$(".card", root).forEach((card, index) => {
      card.classList.remove("card-enter");
      card.style.setProperty("--enter-delay", `${Math.min(index * 45, 360)}ms`);
      requestAnimationFrame(() => card.classList.add("card-enter"));
    });
  }

  /* ---------------- Language ---------------- */
  function applyLang() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
    S.setLang(state.lang);
    $("#login-title").textContent = t("loginTitle");
    $("#login-subtitle").textContent = t("loginSubtitle");
    $("#pin-label").textContent = t("pinLabel");
    $("#login-btn").textContent = t("loginBtn");
    $("#login-hint").textContent = t("loginHint");
    $$(".lang-btn").forEach((b) => b.classList.toggle("active", b.dataset.lang === state.lang));
    $("#brand-title").textContent = t("appName");
    $("#brand-tag").textContent = t("tagline");
    $("#lang-toggle").textContent = state.lang === "ar" ? "EN" : "ع";
    $("#logout-btn").textContent = t("logout");
    if (!$("#app").classList.contains("hidden")) { renderNav(); render(); }
  }

  /* ---------------- Auth ---------------- */
  function showApp() {
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    renderNav(); render();
  }
  async function enterApp() {
    try { await S.refresh(); } catch (e) {}
    // Deep-link support: /evaluation#dashboard, #users, #links, ...
    const h = (location.hash || "").replace(/^#\/?/, "");
    if (["new", "performance", "links", "history", "dashboard", "users", "settings"].includes(h)) state.view = h;
    showApp();
  }
  function initLogin() {
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = $("#pin-input").value;
      const btn = $("#login-btn"); btn.disabled = true;
      try {
        await S.login(val);
        $("#login-error").classList.add("hidden");
        $("#pin-input").value = "";
        await enterApp();
      } catch (err) {
        const el = $("#login-error"); el.textContent = t("loginError"); el.classList.remove("hidden");
      } finally { btn.disabled = false; }
    });
    $$(".lang-btn").forEach((b) => b.addEventListener("click", () => { state.lang = b.dataset.lang; applyLang(); }));
    $("#lang-toggle").addEventListener("click", () => { state.lang = state.lang === "ar" ? "en" : "ar"; applyLang(); });
    $("#logout-btn").addEventListener("click", async () => {
      await S.logout();
      $("#app").classList.add("hidden"); $("#login-screen").classList.remove("hidden");
    });
    // Mobile drawer: hamburger opens the vertical sidebar; backdrop closes it.
    const sb = $("#sidebar"), bd = $("#side-backdrop"), mb = $("#menu-btn");
    window.__closeDrawer = () => { if (sb) sb.classList.remove("open"); if (bd) bd.classList.remove("show"); };
    if (mb) mb.addEventListener("click", () => { if (sb) sb.classList.toggle("open"); if (bd) bd.classList.toggle("show"); });
    if (bd) bd.addEventListener("click", window.__closeDrawer);

    // resume an existing server session
    S.me().then((role) => { if (role) enterApp(); });
  }

  /* ---------------- Navigation & roles ---------------- */
  const isAdmin = () => S.role() === "admin";
  const NAV = [
    { id: "new", key: "navNew" },
    { id: "performance", key: "navPerformance" },
    { id: "links", key: "navLinks" },
    { id: "history", key: "navHistory" },
    { id: "dashboard", key: "navDashboard" },
    { id: "users", key: "navUsers", admin: true },
    { id: "settings", key: "navSettings", admin: true }
  ];
  function renderNav() {
    $("#mainnav").innerHTML = NAV.filter((n) => !n.admin || isAdmin()).map((n) =>
      `<button data-view="${n.id}" class="${state.view === n.id ? "active" : ""}">${esc(t(n.key))}</button>`
    ).join("");
    $$("#mainnav button").forEach((b) => b.addEventListener("click", () => {
      state.view = b.dataset.view; state.viewingId = null;
      if (state.view === "new") state.draft = null;
      if (state.view === "performance") state.performanceDraft = null;
      if (window.__closeDrawer) window.__closeDrawer();
      renderNav(); render();
    }));
  }

  // Only settings + user management require admin; managers can create & view.
  const ADMIN_VIEWS = ["settings", "users"];

  function render() {
    const v = $("#view");
    if (state.viewingId) return renderReport(v);
    if (ADMIN_VIEWS.includes(state.view) && !isAdmin()) return renderAdminGate(v);
    switch (state.view) {
      case "new": return renderNew(v);
      case "performance": return renderPerformanceOverview(v);
      case "links": return renderLinks(v);
      case "history": return renderHistory(v);
      case "dashboard": return renderDashboard(v);
      case "users": return renderUsers(v);
      case "settings": return renderSettings(v);
    }
  }

  function renderAdminGate(v) {
    v.innerHTML =
      `<div class="card" style="max-width:420px;margin:48px auto;text-align:center">
        <div style="font-size:44px;line-height:1">🔒</div>
        <h2>${esc(t("adminLockTitle"))}</h2>
        <p class="muted">${esc(t("adminLockDesc"))}</p>
        <div class="field" style="margin-top:12px"><label>${esc(t("adminCode"))}</label>
          <input type="password" id="admin-code" inputmode="numeric" autocomplete="off" style="text-align:center;letter-spacing:4px"></div>
        <button class="btn btn-primary btn-block" id="admin-unlock">${esc(t("unlock"))}</button>
        <div id="admin-err" class="error hidden"></div>
      </div>`;
    const submit = async () => {
      try {
        const r = await S.login($("#admin-code").value);
        if (r.role === "admin") { await S.refresh(); render(); }
        else { const e = $("#admin-err"); e.textContent = t("adminWrong"); e.classList.remove("hidden"); }
      } catch (err) {
        const e = $("#admin-err"); e.textContent = t("adminWrong"); e.classList.remove("hidden");
      }
    };
    $("#admin-unlock").addEventListener("click", submit);
    $("#admin-code").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    $("#admin-code").focus();
  }

  /* ---------------- Performance appraisal: non-numeric follow-up record ---------------- */
  function newPerformanceDraft() {
    const approvals = {};
    D.PERFORMANCE_APPROVERS.forEach((approver) => { approvals[approver.id] = { name: "", status: "pending", date: "" }; });
    return {
      hotelName: "", employeeName: "", fileNo: "", jobTitle: "", joiningDate: "", directManager: "",
      reviewDate: new Date().toISOString().slice(0, 10),
      reasons: Array.from({ length: 4 }, () => ({ gap: "", objective: "" })),
      employeeNotes: "", managerNotes: "", managerRecommendation: "", approvals
    };
  }

  function performanceStatusLabel(status) {
    if (status === "approved") return t("approvalApproved");
    if (status === "returned") return t("approvalReturned");
    return t("approvalPending");
  }

  function renderPerformanceOverview(v) {
    if (!state.performanceDraft) state.performanceDraft = newPerformanceDraft();
    const d = state.performanceDraft;
    const star = '<span class="req-star">*</span>';
    const hotelOpts = `<option value="">${esc(t("chooseHotel"))}</option>` + D.SEED_HOTELS.map((hotel) => {
      const value = hotel.en + " — " + hotel.ar;
      return `<option value="${esc(value)}" ${d.hotelName === value ? "selected" : ""}>${esc(L(hotel))}</option>`;
    }).join("");
    const recommendationOpts = `<option value="">${esc(t("chooseRecommendation"))}</option>` + D.DIRECT_MANAGER_RECOMMENDATIONS.map((recommendation) =>
      `<option value="${esc(recommendation.id)}" ${d.managerRecommendation === recommendation.id ? "selected" : ""}>${esc(L(recommendation))}</option>`).join("");
    const gaps = d.reasons.map((reason, index) => `<tr>
      <td class="w-col">${index + 1}</td>
      <td><textarea data-performance-gap="${index}" placeholder="${esc(t("performanceGap"))}">${esc(reason.gap || "")}</textarea></td>
      <td><textarea data-performance-objective="${index}" placeholder="${esc(t("performanceObjective"))}">${esc(reason.objective || "")}</textarea></td>
    </tr>`).join("");
    const approvals = D.PERFORMANCE_APPROVERS.map((approver) => {
      const approval = d.approvals[approver.id] || { name: "", status: "pending", date: "" };
      const roleKey = approver.id === "direct_manager" ? "approvalDirectManager" : approver.id === "human_resources" ? "approvalHumanResources" : "approvalFinalManagement";
      const statusOpts = ["pending", "approved", "returned"].map((status) =>
        `<option value="${status}" ${approval.status === status ? "selected" : ""}>${esc(performanceStatusLabel(status))}</option>`).join("");
      return `<div class="card" style="margin:0"><h3 style="margin-top:0">${esc(t(roleKey))}</h3>
        <div class="field"><label>${esc(t("approvalName"))}</label><input data-approval-name="${approver.id}" value="${esc(approval.name || "")}"></div>
        <div class="field"><label>${esc(t("approvalStatus"))}</label><select data-approval-status="${approver.id}">${statusOpts}</select></div>
        <div class="field"><label>${esc(t("approvalDate"))}</label><input type="date" data-approval-date="${approver.id}" value="${esc(approval.date || "")}"></div>
      </div>`;
    }).join("");
    const records = S.getPerformanceReviews();
    const historyRows = records.length ? records.slice().reverse().map((review) => {
      const gapsCount = (review.reasons || []).filter((reason) => (reason.gap || "").trim()).length;
      return `<tr><td>${esc(review.reportNo || "—")}</td><td>${esc(review.employeeName || "—")}</td><td>${esc(review.hotelName || "—")}</td><td>${gapsCount}</td><td>${esc(review.createdAt ? review.createdAt.slice(0, 10) : "—")}</td></tr>`;
    }).join("") : `<tr><td colspan="5" class="muted">${esc(t("noPerformanceRecords"))}</td></tr>`;

    v.innerHTML = `<div class="page-title"><h1>${esc(t("performanceFormTitle"))}</h1></div>
      <div class="card"><h2>${esc(t("performanceEmployeeInfo"))}</h2><div class="grid-4">
        <div class="field"><label>${esc(t("hotelName"))} ${star}</label><select id="perf-hotel">${hotelOpts}</select></div>
        <div class="field"><label>${esc(t("employeeName"))} ${star}</label><input id="perf-name" value="${esc(d.employeeName)}"></div>
        <div class="field"><label>${esc(t("fileNo"))}</label><input id="perf-file" value="${esc(d.fileNo)}"></div>
        <div class="field"><label>${esc(t("jobTitle"))}</label><input id="perf-job" value="${esc(d.jobTitle)}"></div>
        <div class="field"><label>${esc(t("joiningDate"))}</label><input type="date" id="perf-joining" value="${esc(d.joiningDate)}"></div>
        <div class="field"><label>${esc(t("directManager"))} ${star}</label><input id="perf-manager" value="${esc(d.directManager)}"></div>
        <div class="field"><label>${esc(t("date"))}</label><input type="date" id="perf-date" value="${esc(d.reviewDate)}"></div>
      </div></div>
      <div class="card"><h2>${esc(t("performanceReviewReasons"))}</h2>
        <table class="eval-table"><thead><tr><th class="w-col">#</th><th>${esc(t("performanceGap"))}</th><th>${esc(t("performanceObjective"))}</th></tr></thead><tbody>${gaps}</tbody></table>
      </div>
      <div class="card"><div class="grid-2">
        <div class="field"><label>${esc(t("performanceEmployeeNotes"))}</label><textarea id="perf-employee-notes">${esc(d.employeeNotes)}</textarea></div>
        <div class="field"><label>${esc(t("performanceManagerNotes"))}</label><textarea id="perf-manager-notes">${esc(d.managerNotes)}</textarea></div>
      </div>
      <div class="field"><label>${esc(t("directManagerRecommendation"))}</label><select id="perf-recommendation">${recommendationOpts}</select></div></div>
      <div class="card"><h2>${esc(t("performanceApprovals"))}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">${approvals}</div></div>
      <div class="card" style="text-align:center"><button class="btn btn-primary" id="save-performance-review">${esc(t("savePerformanceReview"))}</button></div>
      <div class="card"><h2>${esc(t("performanceHistory"))}</h2><div style="overflow-x:auto"><table class="eval-table"><thead><tr><th>${esc(t("reportNo"))}</th><th>${esc(t("employee"))}</th><th>${esc(t("hotel"))}</th><th>${esc(t("performanceReviewReasons"))}</th><th>${esc(t("date"))}</th></tr></thead><tbody>${historyRows}</tbody></table></div></div>`;

    const bindText = (selector, key) => $(selector).addEventListener("input", (event) => { d[key] = event.target.value; });
    $("#perf-hotel").addEventListener("change", (event) => { d.hotelName = event.target.value; });
    bindText("#perf-name", "employeeName"); bindText("#perf-file", "fileNo"); bindText("#perf-job", "jobTitle"); bindText("#perf-manager", "directManager");
    $("#perf-joining").addEventListener("change", (event) => { d.joiningDate = event.target.value; });
    $("#perf-date").addEventListener("change", (event) => { d.reviewDate = event.target.value; });
    $("#perf-recommendation").addEventListener("change", (event) => { d.managerRecommendation = event.target.value; });
    $$("[data-performance-gap]", v).forEach((input) => input.addEventListener("input", (event) => { d.reasons[Number(event.target.dataset.performanceGap)].gap = event.target.value; }));
    $$("[data-performance-objective]", v).forEach((input) => input.addEventListener("input", (event) => { d.reasons[Number(event.target.dataset.performanceObjective)].objective = event.target.value; }));
    $("#perf-employee-notes").addEventListener("input", (event) => { d.employeeNotes = event.target.value; });
    $("#perf-manager-notes").addEventListener("input", (event) => { d.managerNotes = event.target.value; });
    $$("[data-approval-name]", v).forEach((input) => input.addEventListener("input", (event) => { d.approvals[event.target.dataset.approvalName].name = event.target.value; }));
    $$("[data-approval-status]", v).forEach((select) => select.addEventListener("change", (event) => { d.approvals[event.target.dataset.approvalStatus].status = event.target.value; }));
    $$("[data-approval-date]", v).forEach((input) => input.addEventListener("change", (event) => { d.approvals[event.target.dataset.approvalDate].date = event.target.value; }));
    $("#save-performance-review").addEventListener("click", async () => {
      const hasGap = d.reasons.some((reason) => (reason.gap || "").trim());
      if (!d.employeeName.trim() || !d.hotelName || !d.directManager.trim() || !hasGap) { toast(t("performanceRequired")); return; }
      try { await S.savePerformanceReview(d); } catch (e) { toast(t("saveFailed")); return; }
      toast(t("performanceSaved")); state.performanceDraft = null; renderPerformanceOverview(v);
    });
    animateCards(v);
  }

  /* ---------------- New Appraisal ---------------- */
  function newDraft() {
    return {
      hotelName: "", deptId: "", periodId: "",
      evalDateFrom: new Date().toISOString().slice(0, 10), evalDateTo: "",
      employeeName: "", fileNo: "", jobTitle: "", joiningDate: "", directManager: "",
      ratings: {}, remarks: {},
      strengths: "", improvements: "", actionPlan: "", objectives: "",
      managerComments: "", employeeComments: "",
      trainingNeeds: [], promotion: "", contractRenewal: "",
      signatures: {}
    };
  }

  function renderNew(v) {
    if (!state.draft) state.draft = newDraft();
    const d = state.draft;
    const star = '<span class="req-star">*</span>';

    const hotelOpts = `<option value="">${esc(t("chooseHotel"))}</option>` +
      D.SEED_HOTELS.map((h) => {
        const val = h.en + " — " + h.ar;
        return `<option value="${esc(val)}" ${d.hotelName === val ? "selected" : ""}>${esc(L(h))}</option>`;
      }).join("");
    const deptOpts = `<option value="">${esc(t("chooseDept"))}</option>` +
      D.DEPARTMENTS.map((dp) => `<option value="${dp.id}" ${d.deptId === dp.id ? "selected" : ""}>${esc(L(dp))}</option>`).join("");
    const perOpts = `<option value="">${esc(t("choosePeriod"))}</option>` +
      D.PERIODS.map((p) => `<option value="${p.id}" ${d.periodId === p.id ? "selected" : ""}>${esc(L(p))}</option>`).join("");

    v.innerHTML =
      `<div class="page-title"><h1>${esc(t("navNew"))}</h1></div>
      <div class="card">
        <h2>${esc(t("evalDetails"))}</h2>
        <div class="grid-4">
          <div class="field"><label>${esc(t("hotelName"))} ${star}</label><select id="f-hotel">${hotelOpts}</select></div>
          <div class="field"><label>${esc(t("selectDept"))} ${star}</label><select id="sel-dept">${deptOpts}</select></div>
          <div class="field"><label>${esc(t("selectPeriod"))} ${star}</label><select id="sel-period">${perOpts}</select></div>
          <div class="field"><label>${esc(t("dateFrom"))} ${star}</label><input type="date" id="sel-date-from" value="${esc(d.evalDateFrom)}"></div>
          <div class="field"><label>${esc(t("dateTo"))}</label><input type="date" id="sel-date-to" value="${esc(d.evalDateTo)}"></div>
        </div>
      </div>
      <div class="card">
        <h2>${esc(t("employeeInfo"))}</h2>
        ${employeePickerHTML()}
        <div class="grid-4">
          <div class="field"><label>${esc(t("employeeName"))} ${star}</label><input id="f-name" value="${esc(d.employeeName)}"></div>
          <div class="field"><label>${esc(t("fileNo"))} ${star}</label><input id="f-file" value="${esc(d.fileNo)}"></div>
          <div class="field"><label>${esc(t("jobTitle"))} ${star}</label><input id="f-job" value="${esc(d.jobTitle)}"></div>
          <div class="field"><label>${esc(t("joiningDate"))}</label><input type="date" id="f-join" value="${esc(d.joiningDate)}"></div>
          <div class="field"><label>${esc(t("directManager"))} ${star}</label><input id="f-mgr" value="${esc(d.directManager)}"></div>
        </div>
      </div>
      <div id="eval-area"></div>`;

    const bindText = (sel, key) => $(sel).addEventListener("input", (e) => { d[key] = e.target.value; });
    $("#f-hotel").addEventListener("change", (e) => { d.hotelName = e.target.value; });
    bindText("#f-name", "employeeName");
    bindText("#f-file", "fileNo");
    bindText("#f-job", "jobTitle");
    bindText("#f-mgr", "directManager");
    $("#f-join").addEventListener("change", (e) => { d.joiningDate = e.target.value; });
    // Link with HR employee data: pick an employee to auto-fill the fields.
    bindEmployeePicker(v, (e) => {
      const setv = (sel, val) => { const el = $(sel); if (el) el.value = val; };
      d.employeeName = e.arabic_name || e.name || ""; setv("#f-name", d.employeeName);
      d.fileNo = e.employee_code || ""; setv("#f-file", d.fileNo);
      d.jobTitle = e.position || ""; setv("#f-job", d.jobTitle);
      if (e.division) {
        d.hotelName = e.division;
        const hs = $("#f-hotel");
        if (hs) {
          if (!Array.from(hs.options).some((o) => o.value === e.division)) {
            const opt = document.createElement("option"); opt.value = e.division; opt.textContent = e.division; hs.appendChild(opt);
          }
          hs.value = e.division;
        }
      }
      const dep = deptFromSection(e.section, e.position);
      if (dep) { const ds = $("#sel-dept"); if (ds) { ds.value = dep; ds.dispatchEvent(new Event("change")); } }
      toast(state.lang === "en" ? "Employee loaded from HR" : "تم جلب بيانات الموظف من الموارد البشرية");
    });
    $("#sel-period").addEventListener("change", (e) => { d.periodId = e.target.value; });
    $("#sel-date-from").addEventListener("change", (e) => { d.evalDateFrom = e.target.value; });
    $("#sel-date-to").addEventListener("change", (e) => { d.evalDateTo = e.target.value; });
    $("#sel-dept").addEventListener("change", (e) => {
      d.deptId = e.target.value; d.ratings = pruneDeptRatings(d.ratings); renderEvalArea();
    });

    animateCards(v);
    if (d.deptId) renderEvalArea();

    function renderEvalArea() { renderEvalForm($("#eval-area")); }
  }

  function pruneDeptRatings(ratings) {
    const out = {};
    Object.keys(ratings).forEach((k) => { if (k.startsWith("core.")) out[k] = ratings[k]; });
    return out;
  }

  function directScoreInput(key, weight, value) {
    const val = value === undefined || value === null ? "" : SC.itemPoints(weight, value);
    return `<input type="number" class="score-input${val !== "" ? " has-rating" : ""}" data-key="${key}" min="0" max="${weight}" step="0.5" inputmode="decimal" value="${esc(val)}" placeholder="0 – ${weight}">`;
  }

  function critRow(it, prefix) {
    const key = prefix + "." + it.id;
    const val = state.draft.ratings[key];
    const rem = state.draft.remarks[key] || "";
    return `<tr>
      <td class="crit"><span class="en">${esc(it.en)}</span><span class="ar">${esc(it.ar)}</span></td>
      <td class="w-col">${it.weight}</td>
      <td class="score-col">${directScoreInput(key, it.weight, val)}</td>
      <td><input class="rem-input" data-rem="${key}" value="${esc(rem)}" placeholder="${esc(t("remarks"))}"></td>
    </tr>`;
  }

  function evalTableHead() {
    return `<thead><tr>
      <th>${esc(t("criterion"))}</th><th class="w-col">${esc(t("weightMax"))}</th>
      <th class="score-col">${esc(t("ratingOutOfFive"))}</th><th>${esc(t("remarks"))}</th>
    </tr></thead>`;
  }

  function renderEvalForm(area) {
    const d = state.draft;
    const dep = SC.getDepartment(d.deptId);

    let coreHTML = "";
    D.CORE_SECTIONS.forEach((sec) => {
      const ss = SC.sectionScore(sec, d.ratings);
      coreHTML += `<div class="eval-section">
        <div class="eval-head"><span>${esc(sec.en)} <span class="ar">${esc(sec.ar)}</span></span>
          <span class="sec-total" data-sec="${sec.id}">${ss.earned} / ${ss.max}</span></div>
        <table class="eval-table">${evalTableHead()}<tbody>
          ${sec.items.map((it) => critRow(it, "core")).join("")}
        </tbody></table></div>`;
    });

    const deptScore = SC.deptScore(d.deptId, d.ratings);
    const deptHTML = `<div class="eval-section">
      <div class="eval-head"><span>${esc(dep.en)} <span class="ar">${esc(dep.ar)}</span></span>
        <span class="sec-total" data-sec="dept">${deptScore} / ${D.DEPT_MAX}</span></div>
      <table class="eval-table">${evalTableHead()}<tbody>
        ${dep.items.map((it) => critRow(it, "dept")).join("")}
      </tbody></table></div>`;

    const scoringHint = `<div class="scoring-hint"><strong>${esc(t("scoringGuide"))}</strong><span>${esc(t("scoringGuideText"))}</span></div>`;
    area.innerHTML =
      `${scoringHint}<div class="card"><h2>${esc(t("coreEvaluation"))} (${D.CORE_MAX})</h2>${coreHTML}</div>
       <div class="card"><h2>${esc(t("deptEvaluation"))} (40) — ${esc(L(dep))}</h2>${deptHTML}</div>
       ${developmentCard()}
       ${signaturesCard()}
       <div class="score-bar" id="score-bar"></div>
       <div class="card" style="margin-top:20px;text-align:center">
         <button class="btn btn-primary" id="save-print-btn">${esc(t("saveAndPrint"))}</button>
         <button class="btn btn-outline" id="save-btn">${esc(t("save"))}</button>
       </div>`;

    $$(".score-input", area).forEach((input) => input.addEventListener("input", (e) => {
      const max = Number(e.target.max) || 0;
      if (e.target.value === "") { delete d.ratings[e.target.dataset.key]; e.target.classList.remove("has-rating"); recalc(area); return; }
      const score = Math.min(max, Math.max(0, Number(e.target.value) || 0));
      if (Number(e.target.value) !== score) e.target.value = String(score);
      d.ratings[e.target.dataset.key] = score;
      e.target.classList.add("has-rating");
      const row = e.target.closest("tr");
      if (row) { row.classList.remove("rating-updated"); void row.offsetWidth; row.classList.add("rating-updated"); }
      recalc(area);
    }));
    $$(".rem-input", area).forEach((inp) => inp.addEventListener("input", (e) => {
      d.remarks[e.target.dataset.rem] = e.target.value;
    }));
    bindDevelopment(area);
    initSignaturePads(area);
    animateCards(area);
    $("#save-btn").addEventListener("click", () => saveDraft(false));
    $("#save-print-btn").addEventListener("click", () => saveDraft(true));
    recalc(area);
  }

  function recalc(area) {
    const d = state.draft;
    D.CORE_SECTIONS.forEach((sec) => {
      const ss = SC.sectionScore(sec, d.ratings);
      const el = area.querySelector(`[data-sec="${sec.id}"]`);
      if (el) el.textContent = ss.earned + " / " + ss.max;
    });
    const depEl = area.querySelector('[data-sec="dept"]');
    if (depEl) depEl.textContent = SC.deptScore(d.deptId, d.ratings) + " / " + D.DEPT_MAX;

    const s = SC.compute(d.deptId, d.ratings);
    const bar = $("#score-bar", area);
    if (bar) bar.innerHTML =
      `<div class="score-pill"><span class="lbl">${esc(t("corePoints"))}</span><span class="val">${s.core}/${s.coreMax}</span></div>
       <div class="score-pill"><span class="lbl">${esc(t("deptPoints"))}</span><span class="val">${s.dept}/${s.deptMax}</span></div>
       <div class="score-pill total"><span class="lbl">${esc(t("totalScore"))}</span><span class="val">${s.total}/${s.totalMax}</span></div>
       <div class="score-pill"><span class="lbl">${esc(t("percentage"))}</span><span class="val">${s.pct}%</span></div>
       <div class="score-pill level" style="background:${s.level.color}20"><span class="lbl">${esc(t("performanceLevel"))}</span><span class="val" style="color:${s.level.color}">${esc(L(s.level))}</span></div>`;
  }

  /* ---------------- Development section ---------------- */
  function developmentCard() {
    const d = state.draft;
    const ta = (id, label) => `<div class="field"><label>${esc(label)}</label><textarea data-dev="${id}">${esc(d[id] || "")}</textarea></div>`;
    const training = D.TRAINING_NEEDS.map((tn) =>
      `<label class="check-item"><input type="checkbox" data-train="${tn.id}" ${d.trainingNeeds.includes(tn.id) ? "checked" : ""}>
        <span>${esc(tn.en)} — ${esc(tn.ar)}</span></label>`).join("");
    const promo = D.PROMOTION_OPTIONS.map((p) =>
      `<label class="radio-pill ${d.promotion === p.id ? "checked" : ""}"><input type="radio" name="promo" data-promo="${p.id}" ${d.promotion === p.id ? "checked" : ""}>${esc(L(p))}</label>`).join("");
    const renew = ["yes", "no"].map((r) =>
      `<label class="radio-pill ${d.contractRenewal === r ? "checked" : ""}"><input type="radio" name="renew" data-renew="${r}" ${d.contractRenewal === r ? "checked" : ""}>${esc(t(r))}</label>`).join("");

    return `<div class="card"><h2>${esc(t("development"))}</h2>
      <div class="grid-2">
        ${ta("strengths", t("strengths"))}
        ${ta("improvements", t("improvements"))}
        ${ta("actionPlan", t("actionPlan"))}
        ${ta("objectives", t("objectives"))}
        ${ta("managerComments", t("managerComments"))}
        ${ta("employeeComments", t("employeeComments"))}
      </div>
      <div class="field"><label>${esc(t("trainingNeeds"))}</label><div class="check-grid">${training}</div></div>
      <div class="grid-2">
        <div class="field"><label>${esc(t("promotion"))}</label><div class="radio-row">${promo}</div></div>
        <div class="field"><label>${esc(t("contractRenewal"))}</label><div class="radio-row">${renew}</div></div>
      </div>
    </div>`;
  }

  function bindDevelopment(area) {
    const d = state.draft;
    $$("[data-dev]", area).forEach((el) => el.addEventListener("input", (e) => { d[e.target.dataset.dev] = e.target.value; }));
    $$("[data-train]", area).forEach((el) => el.addEventListener("change", (e) => {
      const id = e.target.dataset.train;
      if (e.target.checked) { if (!d.trainingNeeds.includes(id)) d.trainingNeeds.push(id); }
      else d.trainingNeeds = d.trainingNeeds.filter((x) => x !== id);
    }));
    $$("[data-promo]", area).forEach((el) => el.addEventListener("change", (e) => {
      d.promotion = e.target.dataset.promo;
      $$(".radio-pill", area).forEach((p) => { if (p.querySelector("[data-promo]")) p.classList.toggle("checked", p.contains(e.target)); });
    }));
    $$("[data-renew]", area).forEach((el) => el.addEventListener("change", (e) => {
      d.contractRenewal = e.target.dataset.renew;
      $$(".radio-pill", area).forEach((p) => { if (p.querySelector("[data-renew]")) p.classList.toggle("checked", p.contains(e.target)); });
    }));
  }

  /* ---------------- Signatures (draw in-app or upload image) ---------------- */
  function signaturesCard() {
    const d = state.draft;
    d.signatures = d.signatures || {};
    const status = window.SigPad.statusHTML({ signatories: D.SIGNATORIES, signatures: d.signatures, lang: state.lang, t });
    const pads = window.SigPad.card({ signatories: D.SIGNATORIES, signatures: d.signatures, t, lang: state.lang });
    return `<div class="card"><h2>${esc(t("signatures"))}</h2>${status}${pads}</div>`;
  }

  function initSignaturePads(area) {
    const d = state.draft;
    d.signatures = d.signatures || {};
    window.SigPad.init(area, d.signatures, () => {
      const holder = area.querySelector('.sig-status');
      if (holder) holder.outerHTML = window.SigPad.statusHTML({ signatories: D.SIGNATORIES, signatures: d.signatures, lang: state.lang, t });
    }, t);
  }

  // Returns the first empty required element (eval details + personal data + every criterion),
  // or null if everything required is filled. Development section is optional.
  function firstInvalid() {
    const d = state.draft;
    const checks = [
      ["#f-hotel", () => !d.hotelName],
      ["#sel-dept", () => !d.deptId],
      ["#sel-period", () => !d.periodId],
      ["#sel-date-from", () => !d.evalDateFrom],
      ["#f-name", () => !(d.employeeName || "").trim()],
      ["#f-file", () => !(d.fileNo || "").trim()],
      ["#f-job", () => !(d.jobTitle || "").trim()],
      ["#f-mgr", () => !(d.directManager || "").trim()]
    ];
    for (const [sel, empty] of checks) {
      if (empty()) return document.querySelector(sel);
    }
    // every criterion requires a direct score; zero is valid when explicitly entered.
    const inputs = document.querySelectorAll(".score-input");
    for (const input of inputs) {
      if (input.value === "") return input;
    }
    return null;
  }

  async function saveDraft(alsoPrint) {
    const d = state.draft;
    const bad = firstInvalid();
    if (bad) {
      document.querySelectorAll(".invalid").forEach((e) => e.classList.remove("invalid"));
      bad.classList.add("invalid");
      bad.scrollIntoView({ behavior: "smooth", block: "center" });
      try { bad.focus({ preventScroll: true }); } catch (e) {}
      toast(t("fillRequired"));
      return;
    }
    let saved;
    try { saved = await S.saveAppraisal(d); }
    catch (e) { toast(t("saveFailed") + (e && e.message ? " (" + e.message + ")" : "")); return; }
    toast(t("saved"));
    state.draft = null;
    state.viewingId = saved.id; state.view = "history";
    renderNav(); render();
    if (alsoPrint) setTimeout(() => window.EXPORT.printReport(saved), 200);
  }

  /* ---------------- Evaluation links (invites) ---------------- */
  function qrDataURL(text) {
    try { const qr = qrcode(0, "M"); qr.addData(text); qr.make(); return qr.createDataURL(4, 8); } catch (e) { return ""; }
  }
  function inviteTargetLabel(inv) {
    const dep = inv.deptId ? (SC.getDepartment(inv.deptId) || {}) : null;
    const bits = [];
    if (inv.employeeName) bits.push(inv.employeeName);
    if (inv.jobTitle) bits.push(inv.jobTitle);
    if (dep) bits.push(L(dep)); else if (!inv.deptId) bits.push(t("managerChoosesDept"));
    return bits.join(" · ") || "—";
  }
  function inviteStatusBadge(inv) {
    const map = { open: ["#0ea5e9", t("statusOpen")], submitted: ["#16a34a", t("statusSubmitted")], revoked: ["#6b7280", t("statusRevoked")] };
    const m = map[inv.status] || map.open;
    let html = `<span class="badge" style="background:${m[0]}">${esc(m[1])}</span>`;
    if (inv.reusable) html += ` <span class="badge" style="background:#0891b2">🔁 ${esc(t("reusableShort"))}${inv.submitCount ? " " + inv.submitCount : ""}</span>`;
    return html;
  }

  // Best-effort map an HR section/position to an appraisal department id.
  function deptFromSection(section, position) {
    const hay = ((section || '') + ' ' + (position || '')).toLowerCase();
    for (const d of D.DEPARTMENTS) {
      const ar = String(d.ar || '').toLowerCase(), en = String(d.en || '').toLowerCase();
      if ((ar && hay.includes(ar)) || (en && hay.includes(en))) return d.id;
    }
    return '';
  }
  // HR employee picker: search box + results; onPick(emp) fills the form.
  function employeePickerHTML() {
    const lbl = state.lang === 'en' ? 'Pick an employee from HR data' : 'اختر موظفاً من بيانات الموارد البشرية';
    const ph = state.lang === 'en' ? 'Search by name / ID / job…' : 'ابحث بالاسم أو الرقم الوظيفي أو المسمى…';
    return `<div class="field emp-picker"><label>${esc(lbl)}</label>
      <input id="emp-search" autocomplete="off" placeholder="${esc(ph)}">
      <div id="emp-results" class="emp-results"></div></div>`;
  }
  function bindEmployeePicker(root, onPick) {
    const inp = root.querySelector('#emp-search'), box = root.querySelector('#emp-results');
    if (!inp || !box) return;
    let tmr;
    inp.addEventListener('input', () => {
      clearTimeout(tmr); const q = inp.value.trim();
      tmr = setTimeout(async () => {
        if (!q) { box.innerHTML = ''; return; }
        let list = []; try { list = await S.hrEmployees(q); } catch (e) {}
        if (!list.length) {
          box.innerHTML = `<div class="emp-empty">${esc(state.lang === 'en' ? 'No HR employees found (upload the Excel in the HR platform first).' : 'لا توجد بيانات موظفين — ارفع ملف الإكسل في نظام الموارد البشرية أولاً.')}</div>`;
          return;
        }
        box.innerHTML = list.slice(0, 25).map((e, i) =>
          `<div class="emp-item" data-i="${i}"><b>${esc(e.arabic_name || e.name || '')}</b>` +
          `<span class="emp-meta">${esc(e.employee_code || '')}${e.position ? ' · ' + esc(e.position) : ''}${e.division ? ' · ' + esc(e.division) : ''}</span></div>`).join('');
        box.querySelectorAll('.emp-item').forEach((el) => el.addEventListener('click', () => {
          const e = list[Number(el.dataset.i)]; box.innerHTML = ''; inp.value = e.arabic_name || e.name || ''; onPick(e);
        }));
      }, 250);
    });
  }

  function renderLinks(v) {
    let lkHotel = '';
    v.innerHTML =
      `<div class="page-title"><h1>${esc(t("linksTitle"))}</h1></div>
      <div class="card">
        <h2>${esc(t("createLink"))}</h2>
        <p class="muted">${esc(t("createLinkDesc"))}</p>
        ${employeePickerHTML()}
        <div class="grid-2">
          <div class="field"><label>${esc(t("hotel"))}</label>
            <select id="lk-hotel"><option value="">${esc(t("chooseHotel"))}</option>
              ${D.SEED_HOTELS.map((h) => `<option value="${h.id}">${esc(L(h))}</option>`).join("")}</select></div>
          <div class="field"><label>${esc(t("department"))}</label>
            <select id="lk-dept"><option value="">${esc(t("managerChoosesDept"))}</option>
              ${D.DEPARTMENTS.map((d) => `<option value="${d.id}">${esc(L(d))}</option>`).join("")}</select></div>
          <div class="field"><label>${esc(t("employee"))}</label><input id="lk-emp" placeholder="${esc(t("optional"))}"></div>
          <div class="field"><label>${esc(t("fileNo"))}</label><input id="lk-fileno" placeholder="${esc(t("optional"))}"></div>
          <div class="field"><label>${esc(t("jobTitle"))}</label><input id="lk-job" placeholder="${esc(t("optional"))}"></div>
          <div class="field"><label>${esc(t("directManager"))}</label><input id="lk-mgr" placeholder="${esc(t("optional"))}"></div>
          <div class="field"><label>${esc(t("period"))}</label>
            <select id="lk-period"><option value="">${esc(t("choosePeriod"))}</option>
              ${D.PERIODS.map((p) => `<option value="${p.id}">${esc(L(p))}</option>`).join("")}</select></div>
          <div class="field"><label>${esc(t("note"))}</label><input id="lk-note" placeholder="${esc(t("optional"))}"></div>
        </div>
        <label class="check-line" id="lk-openrow" style="display:none;margin:4px 0 10px">
          <input type="checkbox" id="lk-openchoice"> ${esc(t("allowManagerChangeDept"))}</label>
        <label class="check-line" style="margin:4px 0 10px">
          <input type="checkbox" id="lk-reusable"> ${esc(t("reusableLink"))}</label>
        <button class="btn btn-primary" id="lk-create">${esc(t("createLink"))}</button>
        <div id="lk-result"></div>
      </div>
      <div class="card"><h2>${esc(t("existingLinks"))}</h2><div id="lk-list"><div class="empty">${esc(t("loading"))}</div></div></div>`;

    const deptSel = $("#lk-dept"), openRow = $("#lk-openrow");
    deptSel.addEventListener("change", () => { openRow.style.display = deptSel.value ? "flex" : "none"; });

    // Link with the HR employee data: pick an employee to auto-fill the fields.
    bindEmployeePicker(v, (e) => {
      $("#lk-emp").value = e.arabic_name || e.name || "";
      $("#lk-fileno").value = e.employee_code || "";
      $("#lk-job").value = e.position || "";
      lkHotel = e.division || "";
      const dep = deptFromSection(e.section, e.position);
      if (dep) { deptSel.value = dep; openRow.style.display = "flex"; }
      toast(state.lang === "en" ? "Employee loaded from HR" : "تم جلب بيانات الموظف من الموارد البشرية");
    });

    $("#lk-create").addEventListener("click", async () => {
      const payload = {
        hotelId: $("#lk-hotel").value || null,
        hotelName: lkHotel || null,
        deptId: $("#lk-dept").value || null,
        lockDept: $("#lk-dept").value ? !$("#lk-openchoice").checked : false,
        employeeName: $("#lk-emp").value.trim() || null,
        employeeNo: $("#lk-fileno").value.trim() || null,
        jobTitle: $("#lk-job").value.trim() || null,
        managerName: $("#lk-mgr").value.trim() || null,
        periodId: $("#lk-period").value || null,
        note: $("#lk-note").value.trim() || null,
        reusable: $("#lk-reusable").checked,
      };
      const btn = $("#lk-create"); btn.disabled = true;
      try {
        const inv = await S.createInvite(payload);
        showLinkResult(inv);
        loadLinks();
        toast(t("linkCreated"));
      } catch (e) { toast(t("saveFailed")); } finally { btn.disabled = false; }
    });

    function showLinkResult(inv) {
      const url = inv.url;
      $("#lk-result").innerHTML =
        `<div class="link-result">
          <div class="link-qr"><img src="${qrDataURL(url)}" alt="QR"></div>
          <div class="link-body">
            <div class="muted">${esc(t("shareThisLink"))}</div>
            <div class="link-url"><input id="lk-url" readonly value="${esc(url)}"></div>
            <div class="inline-actions">
              <button class="btn btn-primary btn-sm" id="lk-copy">${esc(t("copyLink"))}</button>
              <a class="btn btn-outline btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${esc(t("openLink"))}</a>
            </div>
          </div>
        </div>`;
      $("#lk-copy").addEventListener("click", () => {
        const inp = $("#lk-url"); inp.select();
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
          .then(() => toast(t("copied"))).catch(() => { try { document.execCommand("copy"); toast(t("copied")); } catch (e) {} });
      });
    }

    async function loadLinks() {
      const listEl = $("#lk-list");
      let invites = [];
      try { invites = await S.listInvites(); } catch (e) { listEl.innerHTML = `<div class="empty">${esc(t("noData"))}</div>`; return; }
      if (!invites.length) { listEl.innerHTML = `<div class="empty">${esc(t("noLinks"))}</div>`; return; }
      listEl.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>${esc(t("date"))}</th><th>${esc(t("target"))}</th><th>${esc(t("hotel"))}</th>
        <th>${esc(t("status"))}</th><th>${esc(t("actions"))}</th></tr></thead><tbody>
        ${invites.map((inv) => `<tr>
          <td><span class="ltr">${esc((inv.createdAt || "").slice(0, 10))}</span></td>
          <td>${esc(inviteTargetLabel(inv))}</td>
          <td>${esc(inv.hotelName || "—")}</td>
          <td>${inviteStatusBadge(inv)}</td>
          <td class="inline-actions">
            <button class="btn btn-sm btn-outline" data-copy="${esc(inv.url)}">${esc(t("copyLink"))}</button>
            ${inv.resultId ? `<button class="btn btn-sm btn-outline" data-result="${esc(inv.resultId)}">${esc(t("viewResult"))}</button>` : ""}
            ${isAdmin() && inv.status === "open" ? `<button class="btn btn-sm btn-danger" data-revoke="${esc(inv.token)}">${esc(t("revoke"))}</button>` : ""}
            ${isAdmin() ? `<button class="btn btn-sm btn-danger" data-del="${esc(inv.token)}">${esc(t("delete"))}</button>` : ""}
          </td></tr>`).join("")}
      </tbody></table></div>`;
      $$("[data-copy]", listEl).forEach((b) => b.addEventListener("click", () => {
        const url = b.dataset.copy;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast(t("copied"))).catch(() => {});
      }));
      $$("[data-result]", listEl).forEach((b) => b.addEventListener("click", async () => {
        // ensure the appraisal is in cache, then open it
        if (!S.getAppraisal(b.dataset.result)) { try { await S.refresh(); } catch (e) {} }
        state.viewingId = b.dataset.result; render();
      }));
      $$("[data-revoke]", listEl).forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(t("confirmRevoke"))) return;
        try { await S.revokeInvite(b.dataset.revoke); } catch (e) {} loadLinks();
      }));
      $$("[data-del]", listEl).forEach((b) => b.addEventListener("click", async () => {
        if (!confirm(t("confirmDelete"))) return;
        try { await S.deleteInvite(b.dataset.del); } catch (e) {} loadLinks();
      }));
    }
    loadLinks();
    animateCards(v);
  }

  /* ---------------- History ---------------- */
  async function renderHistory(v) {
    v.innerHTML = `<div class="page-title"><h1>${esc(t("historyTitle"))}</h1></div><div class="card empty">${esc(t("loading"))}</div>`;
    try { await S.refresh(); } catch (e) {}
    if (state.view !== "history" || state.viewingId) return; // navigated away while loading
    const all = S.getAppraisals().slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    v.innerHTML = `<div class="page-title"><h1>${esc(t("historyTitle"))}</h1>
      <input id="hist-search" placeholder="${esc(t("searchPlaceholder"))}" style="max-width:320px">
    </div><div id="hist-list"></div>`;
    const listEl = $("#hist-list");
    function draw(filter) {
      const f = (filter || "").toLowerCase();
      const rows = all.filter((a) =>
        !f || [a.reportNo, a.employeeName, a.hotelName].join(" ").toLowerCase().includes(f));
      if (!rows.length) { listEl.innerHTML = `<div class="card empty">${esc(t("noRecords"))}</div>`; return; }
      listEl.innerHTML = `<div class="card table-wrap"><table class="data-table"><thead><tr>
        <th>${esc(t("reportNo"))}</th><th>${esc(t("date"))}</th><th>${esc(t("employee"))}</th>
        <th>${esc(t("hotel"))}</th><th>${esc(t("department"))}</th><th>${esc(t("score"))}</th>
        <th>${esc(t("level"))}</th><th>${esc(t("actions"))}</th></tr></thead><tbody>
        ${rows.map((a) => {
          const dep = SC.getDepartment(a.deptId) || {}; const s = SC.compute(a.deptId, a.ratings || {});
          return `<tr>
            <td>${esc(a.reportNo || "")}</td>
            <td><span class="ltr">${esc(window.REPORT.dateRange(a))}</span></td>
            <td>${esc(a.employeeName || "")}</td>
            <td>${esc(a.hotelName || "")}</td>
            <td>${esc(L(dep))}</td>
            <td><b>${s.total}</b>/${s.totalMax} (${s.pct}%)</td>
            <td><span class="badge" style="background:${s.level.color}">${esc(L(s.level))}</span></td>
            <td class="inline-actions">
              <button class="btn btn-sm btn-outline" data-view-id="${a.id}">${esc(t("view"))}</button>
              ${isAdmin() ? `<button class="btn btn-sm btn-danger" data-del-id="${a.id}">${esc(t("delete"))}</button>` : ""}
            </td></tr>`;
        }).join("")}
      </tbody></table></div>`;
      $$("[data-view-id]").forEach((b) => b.addEventListener("click", () => { state.viewingId = b.dataset.viewId; render(); }));
      $$("[data-del-id]").forEach((b) => b.addEventListener("click", async () => {
        if (confirm(t("confirmDelete"))) { try { await S.deleteAppraisal(b.dataset.delId); } catch (e) {} renderHistory(v); }
      }));
    }
    draw("");
    $("#hist-search").addEventListener("input", (e) => draw(e.target.value));
  }

  /* ---------------- Report view ---------------- */
  function renderReport(v) {
    const a = S.getAppraisal(state.viewingId);
    if (!a) { state.viewingId = null; return render(); }
    // reuse the exact print styles for an accurate on-screen preview (strip the global body rule)
    const previewCSS = (window.EXPORT.getPrintCSS() || "").replace(/\bbody\s*\{[^}]*\}/, "");
    v.innerHTML = `<div class="page-title">
        <button class="btn btn-outline" id="back-btn">← ${esc(t("back"))}</button>
        <div class="inline-actions">
          <button class="btn btn-primary" id="pdf-btn">${esc(t("print"))} / ${esc(t("exportPdf"))}</button>
          <button class="btn btn-outline" id="xls-btn">${esc(t("exportExcel"))}</button>
        </div></div>
      <style>${previewCSS}</style>
      <div class="card" style="overflow-x:auto">${window.REPORT.buildReportBody(a)}</div>`;
    $("#back-btn").addEventListener("click", () => { state.viewingId = null; state.view = "history"; renderNav(); render(); });
    $("#pdf-btn").addEventListener("click", () => window.EXPORT.printReport(a));
    $("#xls-btn").addEventListener("click", () => window.EXPORT.exportExcel(a));
  }

  /* ---------------- Dashboard ---------------- */
  let dashF = { hotel: "", dept: "", job: "", period: "", employee: "" };
  const dashCharts = [];
  function disposeDash() { dashCharts.forEach((c) => { try { c.dispose(); } catch (e) {} }); dashCharts.length = 0; }

  async function renderDashboard(v) {
    v.innerHTML = `<div class="page-title"><h1>${esc(t("dashboardTitle"))}</h1></div><div class="card empty">${esc(t("loading"))}</div>`;
    try { await S.refresh(); } catch (e) {}
    if (state.view !== "dashboard" || state.viewingId) return;
    const all = S.getAppraisals();
    if (!all.length) { v.innerHTML = `<div class="page-title"><h1>${esc(t("dashboardTitle"))}</h1></div><div class="card empty">${esc(t("noData"))}</div>`; return; }

    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const deptLabel = (id) => L(SC.getDepartment(id) || { en: id });
    const periodLabel = (id) => { const p = (D.PERIODS || []).find((x) => x.id === id); return p ? L(p) : id; };
    const opts = (list, labeler) => list.map((x) => `<option value="${esc(x)}">${esc(labeler ? labeler(x) : x)}</option>`).join("");
    const avg = (arr) => arr.length ? +(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(1) : 0;
    const allLbl = state.lang === "en" ? "All" : "الكل";

    function draw() {
      const filtered = all.filter((a) =>
        (!dashF.hotel || a.hotelName === dashF.hotel) &&
        (!dashF.dept || a.deptId === dashF.dept) &&
        (!dashF.job || a.jobTitle === dashF.job) &&
        (!dashF.period || a.periodId === dashF.period) &&
        (!dashF.employee || a.employeeName === dashF.employee)
      ).map((a) => ({ a, s: SC.compute(a.deptId, a.ratings || {}) }));

      const wrap = $("#dash-body");
      if (!filtered.length) { disposeDash(); wrap.innerHTML = `<div class="card empty">${esc(t("noData"))}</div>`; return; }
      const totalAvg = avg(filtered.map((x) => x.s.total));
      const pctAvg = avg(filtered.map((x) => x.s.pct));
      const empCount = new Set(filtered.map((x) => (x.a.employeeName || "").trim().toLowerCase()).filter(Boolean)).size;
      const best = filtered.slice().sort((a, b) => b.s.total - a.s.total)[0];
      const groupAvg = (keyer, labeler) => { const m = {}; filtered.forEach((x) => { const k = keyer(x) || "—"; (m[k] = m[k] || []).push(x.s.total); }); return Object.keys(m).map((k) => ({ label: labeler ? labeler(k) : k, val: avg(m[k]) })).sort((a, b) => b.val - a.val); };
      const byDept = groupAvg((x) => x.a.deptId, deptLabel);
      const byHotel = groupAvg((x) => x.a.hotelName, null);
      const byJob = groupAvg((x) => x.a.jobTitle, null).slice(0, 8);
      const dist = {}; filtered.forEach((x) => { dist[x.s.level.en] = (dist[x.s.level.en] || 0) + 1; });
      const levelData = D.PERFORMANCE_LEVELS.filter((lv) => dist[lv.en]).map((lv) => ({ name: L(lv), value: dist[lv.en], itemStyle: { color: lv.color } }));
      const byMonth = {}; filtered.forEach((x) => { const d = (x.a.createdAt || "").slice(0, 7) || "—"; (byMonth[d] = byMonth[d] || []).push(x.s.total); });
      const months = Object.keys(byMonth).sort();
      const trend = months.map((m) => avg(byMonth[m]));
      const top = filtered.slice().sort((a, b) => b.s.total - a.s.total).slice(0, 8);

      wrap.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi"><div class="k-ico">📋</div><div class="k-val">${filtered.length}</div><div class="k-lbl">${esc(t("kpiTotal"))}</div></div>
          <div class="kpi"><div class="k-ico">⭐</div><div class="k-val">${totalAvg}</div><div class="k-lbl">${esc(t("kpiAvgScore"))} / ${D.TOTAL_MAX}</div></div>
          <div class="kpi"><div class="k-ico">📈</div><div class="k-val">${pctAvg}%</div><div class="k-lbl">${esc(t("kpiAvgPct"))}</div></div>
          <div class="kpi"><div class="k-ico">👥</div><div class="k-val">${empCount}</div><div class="k-lbl">${esc(t("kpiEmployees"))}</div></div>
          <div class="kpi"><div class="k-ico">🏆</div><div class="k-val" style="font-size:16px">${esc(best ? (best.a.employeeName || "—") : "—")}</div><div class="k-lbl">${state.lang === "en" ? "Top" : "الأعلى"} · ${best ? best.s.total : 0}</div></div>
        </div>
        <div class="grid-2">
          <div class="card"><h2>${esc(t("byDepartment"))}</h2><div id="ch-dept" class="chart"></div></div>
          <div class="card"><h2>${esc(t("byHotel"))}</h2><div id="ch-hotel" class="chart"></div></div>
        </div>
        <div class="grid-2">
          <div class="card"><h2>${esc(t("levelDistribution"))}</h2><div id="ch-level" class="chart"></div></div>
          <div class="card"><h2>${state.lang === "en" ? "Score trend" : "اتجاه التقييم عبر الوقت"}</h2><div id="ch-trend" class="chart"></div></div>
        </div>
        <div class="card"><h2>${state.lang === "en" ? "By job title" : "حسب المسمى الوظيفي"}</h2><div id="ch-job" class="chart"></div></div>
        <div class="card"><h2>${esc(t("topPerformers"))}</h2><div class="table-wrap"><table class="data-table"><thead><tr>
          <th>${esc(t("employee"))}</th><th>${esc(t("hotel"))}</th><th>${esc(t("department"))}</th><th>${esc(t("score"))}</th><th>${esc(t("level"))}</th></tr></thead><tbody>
          ${top.map((x) => { const dep = SC.getDepartment(x.a.deptId) || {}; return `<tr><td>${esc(x.a.employeeName || "")}</td><td>${esc(x.a.hotelName || "")}</td><td>${esc(L(dep))}</td><td><b>${x.s.total}</b>/${x.s.totalMax} (${x.s.pct}%)</td><td><span class="badge" style="background:${x.s.level.color}">${esc(L(x.s.level))}</span></td></tr>`; }).join("")}
        </tbody></table></div></div>`;

      disposeDash();
      const baseText = { fontFamily: "Tajawal, Inter, sans-serif" };
      const hbar = (color) => ({ grid: { left: 8, right: 20, top: 16, bottom: 8, containLabel: true }, tooltip: { trigger: "axis" }, xAxis: { type: "value", max: D.TOTAL_MAX }, series: [{ type: "bar", itemStyle: { color, borderRadius: [0, 6, 6, 0] }, label: { show: true, position: "right" } }] });
      const mk = (id, option) => { const el = $("#" + id); if (!el || !window.echarts) return; const c = echarts.init(el); c.setOption(Object.assign({ textStyle: baseText }, option)); dashCharts.push(c); };
      requestAnimationFrame(() => {
        mk("ch-dept", Object.assign(hbar("#1E883F"), { yAxis: { type: "category", data: byDept.map((d) => d.label).reverse() }, series: [Object.assign(hbar("#1E883F").series[0], { data: byDept.map((d) => d.val).reverse() })] }));
        mk("ch-hotel", Object.assign(hbar("#156835"), { yAxis: { type: "category", data: byHotel.map((d) => d.label).reverse() }, series: [Object.assign(hbar("#156835").series[0], { data: byHotel.map((d) => d.val).reverse() })] }));
        mk("ch-job", Object.assign(hbar("#27A84E"), { yAxis: { type: "category", data: byJob.map((d) => d.label).reverse() }, series: [Object.assign(hbar("#27A84E").series[0], { data: byJob.map((d) => d.val).reverse() })] }));
        mk("ch-level", { tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: baseText }, series: [{ type: "pie", radius: ["45%", "70%"], data: levelData, label: { formatter: "{b}: {c}" } }] });
        mk("ch-trend", { grid: { left: 8, right: 20, top: 16, bottom: 24, containLabel: true }, tooltip: { trigger: "axis" }, xAxis: { type: "category", data: months }, yAxis: { type: "value", max: D.TOTAL_MAX }, series: [{ type: "line", smooth: true, data: trend, areaStyle: { color: "rgba(30,136,63,.15)" }, lineStyle: { color: "#1E883F", width: 3 }, itemStyle: { color: "#156835" } }] });
      });

      const exp = $("#dash-export");
      if (exp) exp.onclick = () => { try { window.EXPORT.exportList(filtered.map((x) => Object.assign({}, x.a, { score: x.s }))); } catch (e) { toast(t("saveFailed")); } };
    }

    const sel = (id, options, ph) => `<select id="${id}"><option value="">${esc(ph)}</option>${options}</select>`;
    v.innerHTML = `
      <div class="page-title"><h1>${esc(t("dashboardTitle"))}</h1>
        <button class="btn btn-outline" id="dash-export">📥 ${esc(t("exportExcel"))}</button></div>
      <div class="card filters"><div class="grid-4">
        <div class="field"><label>${esc(t("hotel"))}</label>${sel("f-hotel", opts(uniq(all.map((a) => a.hotelName))), allLbl)}</div>
        <div class="field"><label>${esc(t("department"))}</label>${sel("f-dept", opts(uniq(all.map((a) => a.deptId)), deptLabel), allLbl)}</div>
        <div class="field"><label>${esc(t("jobTitle"))}</label>${sel("f-job", opts(uniq(all.map((a) => a.jobTitle))), allLbl)}</div>
        <div class="field"><label>${esc(t("period"))}</label>${sel("f-period", opts(uniq(all.map((a) => a.periodId)), periodLabel), allLbl)}</div>
        <div class="field"><label>${esc(t("employee"))}</label>${sel("f-emp", opts(uniq(all.map((a) => a.employeeName))), allLbl)}</div>
      </div></div>
      <div id="dash-body"></div>`;
    const bind = (id, key) => { const el = $("#" + id); if (!el) return; el.value = dashF[key] || ""; el.addEventListener("change", () => { dashF[key] = el.value; draw(); }); };
    bind("f-hotel", "hotel"); bind("f-dept", "dept"); bind("f-job", "job"); bind("f-period", "period"); bind("f-emp", "employee");
    draw();
  }

  /* ---------------- Settings ---------------- */
  /* ---------------- Users & roles (admin) ---------------- */
  function renderUsers(v) {
    const statusLbl = state.lang === "en" ? "Status" : "الحالة";
    v.innerHTML =
      `<div class="page-title"><h1>${esc(t("manageUsers"))}</h1></div>
       <div class="card">
         <h2>${esc(t("addUser"))}</h2>
         <p class="muted">${esc(t("usersDesc"))}</p>
         <div class="grid-4">
           <div class="field"><label>${esc(t("userName"))}</label><input id="u-name"></div>
           <div class="field"><label>${esc(t("userLogin"))}</label><input id="u-username"></div>
           <div class="field"><label>${esc(t("userPass"))}</label><input id="u-pass" inputmode="numeric" autocomplete="off"></div>
           <div class="field"><label>${esc(t("userRole"))}</label>
             <select id="u-role"><option value="manager">${esc(t("roleManager"))}</option><option value="admin">${esc(t("roleAdmin"))}</option></select></div>
         </div>
         <button class="btn btn-primary" id="u-add">${esc(t("addUser"))}</button>
       </div>
       <div class="card"><h2>${esc(t("navUsers"))}</h2><div id="u-list"><div class="empty">${esc(t("loading"))}</div></div></div>`;
    $("#u-add").addEventListener("click", async () => {
      const payload = { name: $("#u-name").value.trim(), username: $("#u-username").value.trim(), passcode: $("#u-pass").value.trim(), role: $("#u-role").value };
      if (!payload.passcode) { toast(t("required")); return; }
      try { await S.addUser(payload); toast(t("accountAdded")); $("#u-name").value = $("#u-username").value = $("#u-pass").value = ""; loadUsers(); }
      catch (e) { toast(e && e.message === "passcode_taken" ? (state.lang === "en" ? "Passcode already used" : "الرمز مستخدم مسبقاً") : t("saveFailed")); }
    });
    async function loadUsers() {
      const el = $("#u-list");
      let users = [];
      try { users = await S.listUsers(); } catch (e) { el.innerHTML = `<div class="empty">${esc(t("noData"))}</div>`; return; }
      const builtins = [
        { name: state.lang === "en" ? "System admin (default)" : "مدير النظام (افتراضي)", username: "056023", role: "admin", builtin: true },
        { name: state.lang === "en" ? "Manager (default)" : "مدير (افتراضي)", username: "1234", role: "manager", builtin: true },
      ];
      const rows = builtins.concat(users);
      el.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>${esc(t("userName"))}</th><th>${esc(t("userLogin"))}</th><th>${esc(t("userRole"))}</th><th>${esc(statusLbl)}</th><th>${esc(t("actions"))}</th></tr></thead><tbody>
        ${rows.map((u) => `<tr>
          <td>${esc(u.name || "")}</td><td class="ltr">${esc(u.username || "")}</td>
          <td>${u.role === "admin" ? esc(t("roleAdmin")) : esc(t("roleManager"))}</td>
          <td>${u.builtin ? "—" : (u.active ? `<span class="badge" style="background:#16a34a">${esc(t("active"))}</span>` : `<span class="badge" style="background:#6b7280">${esc(t("deactivate"))}</span>`)}</td>
          <td class="inline-actions">${u.builtin ? "" : `
            <button class="btn btn-sm btn-outline" data-toggle="${esc(u.id)}">${u.active ? esc(t("deactivate")) : esc(t("activate"))}</button>
            <button class="btn btn-sm btn-danger" data-del="${esc(u.id)}">${esc(t("delete"))}</button>`}</td></tr>`).join("")}
      </tbody></table></div>`;
      $$("[data-toggle]", el).forEach((b) => b.addEventListener("click", async () => { try { await S.toggleUser(b.dataset.toggle); } catch (e) {} loadUsers(); }));
      $$("[data-del]", el).forEach((b) => b.addEventListener("click", async () => { if (!confirm(t("confirmDelete"))) return; try { await S.deleteUser(b.dataset.del); } catch (e) {} loadUsers(); }));
    }
    loadUsers();
  }

  function renderSettings(v) {
    v.innerHTML =
      `<div class="page-title"><h1>${esc(t("settingsTitle"))}</h1></div>
      <div class="card"><h2>${esc(t("centralStorage"))}</h2>
        <p class="muted">${esc(t("centralStorageDesc"))}</p>
      </div>
      <div class="card"><h2>${esc(t("language"))}</h2>
        <div class="radio-row">
          <label class="radio-pill ${state.lang === "ar" ? "checked" : ""}"><input type="radio" name="lg" value="ar" ${state.lang === "ar" ? "checked" : ""}>العربية</label>
          <label class="radio-pill ${state.lang === "en" ? "checked" : ""}"><input type="radio" name="lg" value="en" ${state.lang === "en" ? "checked" : ""}>English</label>
        </div>
      </div>
      <div class="card"><h2>${esc(t("dataMgmt"))}</h2>
        <p class="muted">${esc(t("backupDesc"))}</p>
        <div class="inline-actions" style="flex-wrap:wrap">
          <button class="btn btn-outline" id="exp-all">${esc(t("exportAll"))}</button>
          <label class="btn btn-outline" style="cursor:pointer">${esc(t("importAll"))}<input type="file" id="imp-all" accept="application/json" hidden></label>
        </div>
      </div>`;

    $$('input[name="lg"]').forEach((r) => r.addEventListener("change", (e) => { state.lang = e.target.value; applyLang(); }));
    $("#exp-all").addEventListener("click", () => window.EXPORT.downloadJSON(S.exportAll(), "mig-appraisal-backup.json"));
    $("#imp-all").addEventListener("change", (e) => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => { try { await S.importAll(JSON.parse(reader.result)); toast(t("saved")); render(); } catch (err) { alert("Invalid file"); } };
      reader.readAsText(file);
    });
  }

  /* ---------------- Boot ---------------- */
  // clear the required-field highlight the moment the user edits that field
  const clearInvalid = (e) => { if (e.target && e.target.classList) e.target.classList.remove("invalid"); };
  document.addEventListener("input", clearInvalid, true);
  document.addEventListener("change", clearInvalid, true);

  applyLang();
  initLogin();
})();
