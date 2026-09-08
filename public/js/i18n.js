/* i18n.js — bilingual (AR/EN) dictionary + language & theme state.
   Arabic is the source language; English is full parity for app chrome.
   Reports carry their own complete bilingual label map (report.js) so a report
   can be printed in either language independently of the interface language. */
(function () {
  const DICT = {
    ar: {
      // chrome
      brand_sub: 'الموارد البشرية', hr_dept: 'إدارة الموارد البشرية',
      group_name: 'مجموعة ميسان الدولية', group_name_en: 'MAYSAN INTERNATIONAL GROUP',
      login_title: 'الموارد البشرية', login_sub: 'مجموعة ميسان الدولية',
      login_btn: 'تسجيل الدخول', passcode_ph: '• • • • • •',
      rights: 'جميع الحقوق محفوظة', search_ph: 'بحث عن موظف: الرقم الوظيفي، الاسم، القسم، المسمى…',
      logout: 'تسجيل الخروج', print_page: 'طباعة الصفحة الحالية', reports_center: 'مركز التقارير',
      quality: 'جودة', language: 'اللغة', theme: 'المظهر', light: 'فاتح', dark: 'داكن',
      print: 'طباعة', export_excel: 'تصدير Excel', preview_print: 'معاينة وطباعة',
      all_hotels: 'كل الفنادق', hotel: 'الفندق', hotels: 'الفنادق',
      // nav groups
      nav_overview: 'نظرة عامة', nav_workforce: 'القوى العاملة', nav_compliance: 'الامتثال',
      nav_data: 'البيانات والإدارة',
      // nav items (label per route)
      n_dashboard: 'لوحة القيادة', n_insights: 'رؤى الذكاء الاصطناعي', n_workforce: 'تحليلات القوى العاملة',
      n_saudization: 'السعودة والتوطين', n_nationality: 'الجنسيات', n_departments: 'الأقسام',
      n_jobtitles: 'المسميات الوظيفية', n_hotels: 'الفنادق والمقارنة', n_leave: 'الإجازات والأرصدة',
      n_salary: 'الرواتب', n_expiry: 'الانتهاء والامتثال', n_employees: 'الموظفون',
      n_movements: 'الترقيات والحركات', n_monthly: 'الحركة الشهرية', n_compare: 'المقارنة الشهرية',
      n_reports: 'مركز التقارير', n_rules: 'قواعد التوطين', n_jobmap: 'مطابقة المسميات',
      n_upload: 'رفع بيانات Excel', n_uploads: 'سجل رفع البيانات', n_audit: 'سجل التدقيق', n_users: 'المستخدمون والصلاحيات',
    },
    en: {
      brand_sub: 'Human Resources', hr_dept: 'Human Resources Department',
      group_name: 'MAYSAN INTERNATIONAL GROUP', group_name_en: 'MAYSAN INTERNATIONAL GROUP',
      login_title: 'Human Resources', login_sub: 'MAYSAN INTERNATIONAL GROUP',
      login_btn: 'Sign in', passcode_ph: '• • • • • •',
      rights: 'All rights reserved', search_ph: 'Search employee: code, name, department, job title…',
      logout: 'Sign out', print_page: 'Print current page', reports_center: 'Reports Center',
      quality: 'Quality', language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark',
      print: 'Print', export_excel: 'Export Excel', preview_print: 'Preview & Print',
      all_hotels: 'All hotels', hotel: 'Hotel', hotels: 'Hotels',
      nav_overview: 'Overview', nav_workforce: 'Workforce', nav_compliance: 'Compliance',
      nav_data: 'Data & Administration',
      n_dashboard: 'Dashboard', n_insights: 'AI Insights', n_workforce: 'Workforce Analytics',
      n_saudization: 'Saudization', n_nationality: 'Nationalities', n_departments: 'Departments',
      n_jobtitles: 'Job Titles', n_hotels: 'Hotels & Comparison', n_leave: 'Leave & Balances',
      n_salary: 'Salaries', n_expiry: 'Expiry & Compliance', n_employees: 'Employees',
      n_movements: 'Promotions & Movements', n_monthly: 'Monthly Movement', n_compare: 'Monthly Comparison',
      n_reports: 'Reports Center', n_rules: 'Localization Rules', n_jobmap: 'Job Mapping',
      n_upload: 'Upload Excel Data', n_uploads: 'Upload History', n_audit: 'Audit Log', n_users: 'Users & Permissions',
    },
  };

  const LS_LANG = 'hr_lang', LS_THEME = 'hr_theme';
  function getLang() { try { return localStorage.getItem(LS_LANG) || 'ar'; } catch (e) { return 'ar'; } }
  function getTheme() { try { return localStorage.getItem(LS_THEME) || 'light'; } catch (e) { return 'light'; } }

  window.I18N = {
    DICT,
    lang: getLang(),
    theme: getTheme(),
    t(key, lang) { const l = lang || window.I18N.lang; return (DICT[l] && DICT[l][key] != null) ? DICT[l][key] : (DICT.ar[key] != null ? DICT.ar[key] : key); },
    isRTL(lang) { return (lang || window.I18N.lang) === 'ar'; },
    setLang(l) { window.I18N.lang = l; try { localStorage.setItem(LS_LANG, l); } catch (e) {} },
    setTheme(tm) { window.I18N.theme = tm; try { localStorage.setItem(LS_THEME, tm); } catch (e) {} },
  };
})();
