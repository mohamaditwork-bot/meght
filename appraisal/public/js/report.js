/* =============================================================
   Shared bilingual report builder (on-screen view + PDF/print).
   Always renders BOTH English and Arabic.
   Employee data is taken directly from the appraisal (manual entry).
   Signatures are drawn images (data URLs) rendered inline.
   ============================================================= */
(function () {
  const D = window.APPRAISAL_DATA;

  // Logo inlined as a data URI so it renders in the print window / PDF / offline
  const LOGO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 220" role="img" aria-label="Maysan Int. Group">' +
    '<defs><linearGradient id="mig-grad" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#0d4f4a"/><stop offset="0.55" stop-color="#128a3f"/><stop offset="1" stop-color="#22c55e"/>' +
    '</linearGradient></defs>' +
    '<g fill="url(#mig-grad)" font-family="Georgia,\'Times New Roman\',serif" font-weight="700">' +
    '<text x="260" y="150" font-size="170" text-anchor="middle" letter-spacing="-6">MG</text></g>' +
    '<g fill="#0d4f4a" font-family="Arial,Helvetica,sans-serif" font-weight="700">' +
    '<text x="260" y="200" font-size="34" text-anchor="middle" letter-spacing="10">MAYSAN INT. GROUP</text></g></svg>';
  const LOGO = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(LOGO_SVG);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function qrDataURL(text) {
    try {
      const qr = qrcode(0, "M");
      qr.addData(text); qr.make();
      return qr.createDataURL(4, 8);
    } catch (e) { return ""; }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toISOString().slice(0, 10);
  }

  function dateRange(a) {
    const f = fmtDate(a.evalDateFrom || a.evalDate);
    const to = fmtDate(a.evalDateTo);
    if (f && to) return f + " → " + to;
    return f || to || fmtDate(a.createdAt) || "";
  }

  function criteriaRows(items, prefix, ratings, remarks) {
    return items.map((it) => {
      const key = prefix + "." + it.id;
      const hasScore = Object.prototype.hasOwnProperty.call(ratings, key);
      const rv = hasScore ? window.SCORING.itemPoints(it.weight, ratings[key]) : null;
      const rem = remarks && remarks[key] ? remarks[key] : "";
      return (
        "<tr>" +
        '<td class="c-name">' + esc(it.en) + '<span class="ar">' + esc(it.ar) + "</span></td>" +
        '<td class="c-num">' + it.weight + "</td>" +
        '<td class="c-rate">' + (rv === null ? "—" : (rv + " / " + it.weight)) + "</td>" +
        '<td class="c-rem">' + esc(rem) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function buildReportBody(a) {
    const dep = window.SCORING.getDepartment(a.deptId) || { en: a.deptId, ar: "", items: [] };
    const period = D.PERIODS.find((p) => p.id === a.periodId) || { en: a.periodId, ar: "" };
    const s = window.SCORING.compute(a.deptId, a.ratings || {});

    const qrText = "https://linktr.ee/maysan.group";
    const qr = qrDataURL(qrText);

    let coreHTML = "";
    D.CORE_SECTIONS.forEach((sec) => {
      const ss = window.SCORING.sectionScore(sec, a.ratings || {});
      coreHTML +=
        '<tr class="sec-row"><td colspan="4">' + esc(sec.en) + ' — <span class="ar">' + esc(sec.ar) +
        '</span> <span class="sec-score"><span class="ltr">' + ss.earned + " / " + ss.max + "</span></span></td></tr>" +
        criteriaRows(sec.items, "core", a.ratings || {}, a.remarks || {});
    });

    const deptHTML =
      '<tr class="sec-row"><td colspan="4">' + esc(dep.en) + ' — <span class="ar">' + esc(dep.ar) +
      '</span> <span class="sec-score"><span class="ltr">' + s.dept + " / " + s.deptMax + "</span></span></td></tr>" +
      criteriaRows(dep.items, "dept", a.ratings || {}, a.remarks || {});

    const training = (a.trainingNeeds || []).map((id) => {
      const t = D.TRAINING_NEEDS.find((x) => x.id === id);
      return t ? (esc(t.en) + " / " + esc(t.ar)) : "";
    }).filter(Boolean);

    const promo = D.PROMOTION_OPTIONS.find((p) => p.id === a.promotion);
    const promoTxt = promo ? (promo.en + " / " + promo.ar) : "—";

    const sigRows = D.SIGNATORIES.map((sg) => {
      const sig = (a.signatures && a.signatures[sg.id]) || {};
      const img = sig.img ? '<img class="sig-img" src="' + sig.img + '" alt="signature"/>' : "";
      const nm = sig.name ? esc(sig.name) : "";
      return (
        '<div class="sig-box">' +
        '<div class="sig-line">' + img + "</div>" +
        '<div class="sig-name">' + nm + "</div>" +
        '<div class="sig-role">' + esc(sg.en) + " — " + esc(sg.ar) + "</div>" +
        "</div>"
      );
    }).join("");

    function devBlock(labelEn, labelAr, val) {
      return (
        '<div class="dev-item"><div class="dev-label">' + esc(labelEn) + ' <span class="ar">' + esc(labelAr) +
        '</span></div><div class="dev-val">' + esc(val || "—") + "</div></div>"
      );
    }

    return (
      '<div class="report">' +
      '<div class="rep-head">' +
        '<img class="rep-logo" src="' + LOGO + '" alt="Maysan Int. Group"/>' +
        '<div class="rep-title">' +
          "<h1>Evaluation Report</h1>" +
          '<h2 class="ar">تقرير التقييم</h2>' +
          '<div class="rep-sub">Maysan International Group — مجموعة ميسان الدولية</div>' +
        "</div>" +
        '<div class="rep-qr">' + (qr ? '<img src="' + qr + '" alt="QR"/>' : "") +
          '<div class="qr-cap">Scan to visit<br><span class="ar">امسح للزيارة</span></div>' +
        "</div>" +
      "</div>" +

      '<div class="rep-meta">' +
        '<div><span>Report No. / رقم التقرير:</span> <b>' + esc(a.reportNo || "—") + "</b></div>" +
        '<div><span>Employee / الموظف:</span> <b>' + esc(a.employeeName || "—") + "</b></div>" +
        '<div><span>File No. / رقم الملف:</span> <b>' + esc(a.fileNo || "—") + "</b></div>" +
        '<div><span>Job Title / المسمى:</span> <b>' + esc(a.jobTitle || "—") + "</b></div>" +
        '<div><span>Hotel / الفندق:</span> <b>' + esc(a.hotelName || "—") + "</b></div>" +
        '<div><span>Department / القسم:</span> <b>' + esc(dep.en) + " — " + esc(dep.ar) + "</b></div>" +
        '<div><span>Direct Manager / المدير المباشر:</span> <b>' + esc(a.directManager || "—") + "</b></div>" +
        '<div><span>Joining Date / تاريخ الالتحاق:</span> <b>' + esc(fmtDate(a.joiningDate) || "—") + "</b></div>" +
        '<div><span>Period / الفترة:</span> <b>' + esc(period.en) + " — " + esc(period.ar) + "</b></div>" +
        '<div><span>Evaluation Period / فترة التقييم:</span> <b><span class="ltr">' + esc(dateRange(a)) + "</span></b></div>" +
      "</div>" +

      '<h3 class="rep-sec">Core Evaluation (' + D.CORE_MAX + ') — <span class="ar">التقييم الأساسي</span></h3>' +
      '<table class="rep-table"><thead><tr>' +
        "<th>Criterion / المعيار</th><th>Wt</th><th>Direct Score / التقدير المباشر</th><th>Remarks / ملاحظات</th>" +
      "</tr></thead><tbody>" + coreHTML + "</tbody></table>" +

      '<h3 class="rep-sec">Department Evaluation (40) — <span class="ar">تقييم القسم</span></h3>' +
      '<table class="rep-table"><thead><tr>' +
        "<th>Criterion / المعيار</th><th>Wt</th><th>Direct Score / التقدير المباشر</th><th>Remarks / ملاحظات</th>" +
      "</tr></thead><tbody>" + deptHTML + "</tbody></table>" +

      '<div class="rep-summary">' +
        '<div class="sum-card"><div class="sum-lbl">Core / الأساسي</div><div class="sum-val"><span class="ltr">' + s.core + " / " + s.coreMax + "</span></div></div>" +
        '<div class="sum-card"><div class="sum-lbl">Department / القسم</div><div class="sum-val"><span class="ltr">' + s.dept + " / " + s.deptMax + "</span></div></div>" +
        '<div class="sum-card total"><div class="sum-lbl">Total / الإجمالي</div><div class="sum-val"><span class="ltr">' + s.total + " / " + s.totalMax + "</span></div></div>" +
        '<div class="sum-card"><div class="sum-lbl">Percentage / النسبة</div><div class="sum-val"><span class="ltr">' + s.pct + "%</span></div></div>" +
        '<div class="sum-card" style="background:' + s.level.color + '20;border-color:' + s.level.color +
          '"><div class="sum-lbl">Level / المستوى</div><div class="sum-val" style="color:' + s.level.color + '">' +
          esc(s.level.en) + '<br><span class="ar">' + esc(s.level.ar) + "</span></div></div>" +
      "</div>" +

      '<h3 class="rep-sec">Employee Development — <span class="ar">تطوير الموظف</span></h3>' +
      '<div class="dev-grid">' +
        devBlock("Strengths", "نقاط القوة", a.strengths) +
        devBlock("Areas for Improvement", "نقاط تحتاج إلى تحسين", a.improvements) +
        devBlock("Action Plan", "خطة التحسين", a.actionPlan) +
        devBlock("Operational Objectives", "الأهداف التشغيلية", a.objectives) +
        devBlock("Manager Comments", "تعليقات المدير", a.managerComments) +
        devBlock("Employee Comments", "تعليقات الموظف", a.employeeComments) +
      "</div>" +
      '<div class="dev-row">' +
        '<div><b>Training Needs / الاحتياجات التدريبية:</b> ' + esc(training.join("، ") || "—") + "</div>" +
        '<div><b>Promotion Readiness / الجاهزية للترقية:</b> ' + esc(promoTxt) + "</div>" +
        '<div><b>Contract Renewal / تجديد العقد:</b> ' + (a.contractRenewal === "yes" ? "Yes / نعم" : a.contractRenewal === "no" ? "No / لا" : "—") + "</div>" +
      "</div>" +

      '<h3 class="rep-sec">Signatures — <span class="ar">التواقيع</span></h3>' +
      '<div class="sig-grid">' + sigRows + "</div>" +

      '<div class="rep-foot">Generated on ' + esc(fmtDate(new Date().toISOString())) +
        " — " + esc(a.reportNo || "") + ' · <span class="ar">صدر بتاريخ ' + esc(fmtDate(new Date().toISOString())) + "</span></div>" +
      "</div>"
    );
  }

  window.REPORT = { buildReportBody, qrDataURL, fmtDate, dateRange };
})();
