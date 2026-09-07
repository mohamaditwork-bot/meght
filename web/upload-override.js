/* Standalone demo: uploading needs the server, so show an informative notice. */
(function () {
  if (!window.Pages) return;
  Pages.upload = function (content) {
    content.innerHTML =
      '<div class="page-head"><div><h2>رفع بيانات Excel الذكي</h2><div class="sub">متاح في النسخة الكاملة على الخادم</div></div></div>' +
      '<div class="data-note">ℹ️ هذه نسخة عرض حيّة تعمل بالكامل في المتصفح ببيانات سبتمبر 2026 التجريبية. ميزة <b>رفع ملفات Excel الشهرية</b> (القراءة الذكية، مطابقة الأعمدة، الفحص والاعتماد) تعمل في النسخة الكاملة المستضافة على خادم. جميع لوحات التحليل والحركات والتقارير هنا حقيقية ومحسوبة من البيانات.</div>' +
      '<div class="grid g-3"><div class="panel"><div class="panel-head"><h3>القراءة الذكية</h3></div><div class="panel-body"><p style="color:var(--muted)">مطابقة الأعمدة بالاسم لا بالترتيب، مع درجة ثقة وحقول ديناميكية.</p></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>الفحص والتنظيف</h3></div><div class="panel-body"><p style="color:var(--muted)">مؤشر جودة البيانات، كشف التكرار والتواريخ غير الصحيحة، واقتراحات التوحيد.</p></div></div>' +
      '<div class="panel"><div class="panel-head"><h3>الحركات التاريخية</h3></div><div class="panel-body"><p style="color:var(--muted)">مقارنة الملفات الشهرية لاكتشاف الترقيات والتعيينات والمغادرين.</p></div></div></div>';
  };
})();
