/* =============================================================
   Export: PDF (print-optimised window) + Excel (.xls, bilingual)
   Both outputs contain BOTH English and Arabic.
   ============================================================= */
(function () {
  const D = window.APPRAISAL_DATA;

  // Compact single-A4-page report. Sized so a full appraisal (13 criteria +
  // summary + development + signatures) fits on ONE printed page.
  const PRINT_CSS = `
  @page { size: A4 portrait; margin: 7mm; }
  * { box-sizing: border-box; }
  html, body { height:auto; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color:#12211f; margin:0; padding:10px; background:#fff; font-size:10px; }
  .ar { font-family: "Segoe UI", Tahoma, "Traditional Arabic", sans-serif; direction:rtl; display:inline-block; }
  .ltr { direction:ltr; unicode-bidi:isolate; display:inline-block; }
  .report { max-width: 800px; margin:0 auto; }
  .rep-head { display:flex; align-items:center; justify-content:space-between; gap:12px; border-bottom:2px solid #128a3f; padding-bottom:6px; }
  .rep-logo { height:52px; width:auto; }
  .rep-title { text-align:center; flex:1; }
  .rep-title h1 { margin:0; font-size:15px; color:#0d4f4a; }
  .rep-title h2 { margin:1px 0; font-size:13px; color:#128a3f; }
  .rep-sub { font-size:9px; color:#555; }
  .rep-qr { text-align:center; }
  .rep-qr img { width:58px; height:58px; }
  .qr-cap { font-size:7px; color:#666; }
  .rep-meta { display:grid; grid-template-columns:1fr 1fr; gap:1px 20px; margin:7px 0; font-size:9.5px; }
  .rep-meta span { color:#666; }
  .rep-sec { background:#0d4f4a; color:#fff; padding:3px 8px; font-size:11px; margin:8px 0 0; border-radius:3px 3px 0 0; break-after:avoid; }
  .rep-sec .ar { color:#c9f2d4; }
  .rep-table { width:100%; border-collapse:collapse; font-size:9px; }
  .rep-table th { background:#e8f5ec; color:#0d4f4a; padding:2px 5px; border:1px solid #cfe6d6; text-align:left; }
  .rep-table td { padding:2px 5px; border:1px solid #e2e8e4; vertical-align:top; }
  .rep-table tr { break-inside:avoid; }
  .rep-table .c-name .ar { display:block; color:#128a3f; font-size:8.5px; }
  .rep-table .c-num { text-align:center; width:38px; }
  .rep-table .c-rate { width:150px; }
  .sec-row td { background:#f1f7f3; font-weight:bold; color:#0d4f4a; }
  .sec-score { float:right; background:#128a3f; color:#fff; padding:0 7px; border-radius:9px; font-size:9px; }
  .rep-summary { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin:9px 0; break-inside:avoid; }
  .sum-card { border:1px solid #cfe6d6; border-radius:6px; padding:5px; text-align:center; background:#f8fbf9; }
  .sum-card.total { background:#0d4f4a; color:#fff; border-color:#0d4f4a; }
  .sum-lbl { font-size:8.5px; color:inherit; opacity:.85; }
  .sum-val { font-size:13px; font-weight:bold; margin-top:2px; }
  .dev-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px; break-inside:avoid; }
  .dev-item { border:1px solid #e2e8e4; border-radius:5px; padding:5px; font-size:9px; }
  .dev-label { font-weight:bold; color:#0d4f4a; margin-bottom:2px; }
  .dev-label .ar { color:#128a3f; font-weight:normal; }
  .dev-val { white-space:pre-wrap; min-height:12px; }
  .dev-row { margin-top:6px; font-size:9px; display:flex; flex-direction:column; gap:2px; }
  .sig-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:8px; break-inside:avoid; }
  .sig-box { text-align:center; }
  .sig-line { border-bottom:1px solid #333; min-height:36px; display:flex; align-items:center; justify-content:center; }
  .sig-img { max-height:34px; max-width:100%; }
  .sig-name { font-weight:bold; font-size:9.5px; margin-top:2px; }
  .sig-role { font-size:8.5px; color:#555; margin-top:1px; }
  .rep-foot { margin-top:8px; text-align:center; font-size:8.5px; color:#888; border-top:1px solid #eee; padding-top:5px; }
  @media print {
    body { padding:0; }
    .report { max-width:none; }
    .rep-sec, .sum-card.total, .sec-score, .sig-badge, .sig-status { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
  `;

  function printReport(appraisal) {
    const body = window.REPORT.buildReportBody(appraisal);
    const w = window.open("", "_blank");
    if (!w) { alert("Please allow pop-ups to export the PDF."); return; }
    w.document.write(
      "<!doctype html><html><head><meta charset='utf-8'><title>" +
      (appraisal.reportNo || "Appraisal") + "</title><style>" + PRINT_CSS + "</style></head><body>" +
      body +
      "<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>" +
      "</body></html>"
    );
    w.document.close();
  }

  // ---- Excel export (.xls, HTML-table SpreadsheetML that Excel opens) ----
  function xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function exportExcel(appraisal) {
    const a = appraisal;
    const dep = window.SCORING.getDepartment(a.deptId) || { items: [] };
    const period = D.PERIODS.find((p) => p.id === a.periodId) || {};
    const s = window.SCORING.compute(a.deptId, a.ratings || {});

    const rows = [];
    const th = (t) => '<td style="background:#0d4f4a;color:#fff;font-weight:bold">' + xmlEsc(t) + "</td>";
    const td = (t) => "<td>" + xmlEsc(t) + "</td>";
    const num = (t) => '<td style="mso-number-format:\'0.00\'">' + xmlEsc(t) + "</td>";

    rows.push("<tr>" + th("Maysan International Group — مجموعة ميسان الدولية") + "</tr>");
    rows.push("<tr>" + td("Report No / رقم التقرير") + td(a.reportNo || "") + "</tr>");
    rows.push("<tr>" + td("Employee / الموظف") + td(a.employeeName || "") + "</tr>");
    rows.push("<tr>" + td("File No / رقم الملف") + td(a.fileNo || "") + "</tr>");
    rows.push("<tr>" + td("Job Title / المسمى") + td(a.jobTitle || "") + "</tr>");
    rows.push("<tr>" + td("Hotel / الفندق") + td(a.hotelName || "") + "</tr>");
    rows.push("<tr>" + td("Department / القسم") + td((dep.en || "") + " — " + (dep.ar || "")) + "</tr>");
    rows.push("<tr>" + td("Direct Manager / المدير المباشر") + td(a.directManager || "") + "</tr>");
    rows.push("<tr>" + td("Period / الفترة") + td((period.en || "") + " — " + (period.ar || "")) + "</tr>");
    rows.push("<tr>" + td("Evaluation Period / فترة التقييم") + td(window.REPORT.dateRange(a)) + "</tr>");
    rows.push("<tr></tr>");

    // header
    rows.push("<tr>" + th("Section / القسم") + th("Criterion (EN)") + th("المعيار (AR)") +
      th("Weight / الوزن") + th("Direct Score / التقدير المباشر") + th("Remarks / ملاحظات") + "</tr>");

    D.CORE_SECTIONS.forEach((sec) => {
      sec.items.forEach((it) => {
        const key = "core." + it.id;
        const hasScore = Object.prototype.hasOwnProperty.call(a.ratings || {}, key);
        const directScore = hasScore ? window.SCORING.itemPoints(it.weight, (a.ratings || {})[key]) : null;
        rows.push("<tr>" + td(sec.en + " / " + sec.ar) + td(it.en) + td(it.ar) + num(it.weight) +
          td(directScore === null ? "—" : directScore + " / " + it.weight) + td((a.remarks || {})[key] || "") + "</tr>");
      });
    });
    dep.items.forEach((it) => {
      const key = "dept." + it.id;
      const hasScore = Object.prototype.hasOwnProperty.call(a.ratings || {}, key);
      const directScore = hasScore ? window.SCORING.itemPoints(it.weight, (a.ratings || {})[key]) : null;
      rows.push("<tr>" + td((dep.en || "") + " / " + (dep.ar || "")) + td(it.en) + td(it.ar) + num(it.weight) +
        td(directScore === null ? "—" : directScore + " / " + it.weight) + td((a.remarks || {})[key] || "") + "</tr>");
    });

    rows.push("<tr></tr>");
    rows.push("<tr>" + td("Core / الأساسي") + num(s.core) + td("/ " + s.coreMax) + "</tr>");
    rows.push("<tr>" + td("Department / القسم") + num(s.dept) + td("/ " + s.deptMax) + "</tr>");
    rows.push("<tr>" + td("Total / الإجمالي") + num(s.total) + td("/ " + s.totalMax) + "</tr>");
    rows.push("<tr>" + td("Percentage / النسبة") + td(s.pct + "%") + "</tr>");
    rows.push("<tr>" + td("Level / المستوى") + td(s.level.en + " / " + s.level.ar) + "</tr>");
    rows.push("<tr></tr>");
    rows.push("<tr>" + td("Strengths / نقاط القوة") + td(a.strengths || "") + "</tr>");
    rows.push("<tr>" + td("Improvements / نقاط التحسين") + td(a.improvements || "") + "</tr>");
    rows.push("<tr>" + td("Action Plan / خطة التحسين") + td(a.actionPlan || "") + "</tr>");
    rows.push("<tr>" + td("Objectives / الأهداف") + td(a.objectives || "") + "</tr>");
    rows.push("<tr>" + td("Manager Comments / تعليقات المدير") + td(a.managerComments || "") + "</tr>");
    rows.push("<tr>" + td("Employee Comments / تعليقات الموظف") + td(a.employeeComments || "") + "</tr>");
    rows.push("<tr></tr>");
    rows.push("<tr>" + th("Signatures / التواقيع") + "</tr>");
    D.SIGNATORIES.forEach((sg) => {
      const sig = (a.signatures || {})[sg.id] || {};
      rows.push("<tr>" + td(sg.en + " / " + sg.ar) + td(sig.name || (sig.img ? "✔ signed / موقّع" : "")) + "</tr>");
    });

    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      "<head><meta charset='utf-8'>" +
      "<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>" +
      "<x:Name>Appraisal</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>" +
      "</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->" +
      "<style>td{border:1px solid #ccc;padding:4px;font-family:Arial;font-size:11px;vertical-align:top}</style>" +
      "</head><body><table>" + rows.join("") + "</table></body></html>";

    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    downloadBlob(blob, (a.reportNo || "appraisal") + ".xls");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    downloadBlob(blob, filename);
  }

  // Aggregate export: a whole (filtered) list of appraisals to one .xls sheet.
  function exportList(list) {
    const SC = window.SCORING;
    const L = (o) => (o ? (o.ar || o.en || "") : "");
    const fmtDate = (a) => (window.REPORT ? window.REPORT.dateRange(a) : (a.evalDateFrom || a.createdAt || "").slice(0, 10));
    const head = ["#", "Report No / رقم التقرير", "Date / التاريخ", "Employee / الموظف", "File No / الرقم",
      "Hotel / الفندق", "Department / القسم", "Job / المسمى", "Core / الأساسي (70)", "Dept / القسم (40)",
      "Total / الإجمالي (110)", "%", "Level / المستوى", "Evaluator / المقيّم"];
    const rows = ["<tr>" + head.map((h) => `<th style="background:#0d4f4a;color:#fff">${xmlEsc(h)}</th>`).join("") + "</tr>"];
    (list || []).forEach((a, i) => {
      const s = a.score || (SC ? SC.compute(a.deptId, a.ratings || {}) : { core: "", dept: "", total: "", pct: "", level: {} });
      const dep = SC ? SC.getDepartment(a.deptId) : null;
      const cells = [i + 1, a.reportNo || "", fmtDate(a), a.employeeName || "", a.employeeNo || a.fileNo || "",
        a.hotelName || "", dep ? L(dep) : (a.deptId || ""), a.jobTitle || "", s.core, s.dept, s.total, s.pct,
        s.level ? L(s.level) : "", a.managerName || a.directManager || ""];
      rows.push("<tr>" + cells.map((c) => `<td>${xmlEsc(c)}</td>`).join("") + "</tr>");
    });
    const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      "<head><meta charset='utf-8'><style>td,th{border:1px solid #ccc;padding:4px;font-family:Arial;font-size:11px}</style></head>" +
      "<body><table>" + rows.join("") + "</table></body></html>";
    const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    downloadBlob(blob, "maysan-appraisals-" + new Date().toISOString().slice(0, 10) + ".xls");
  }

  window.EXPORT = { printReport, exportExcel, exportList, downloadJSON, downloadBlob, getPrintCSS: () => PRINT_CSS };
})();
