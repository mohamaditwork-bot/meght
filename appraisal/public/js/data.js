/* Maysan International Group — performance appraisal master data
   Scoring model: Core Evaluation 70 + Department Evaluation 40 = 110 points. */
/* ---- Core evaluation: 8 essential criteria, total = 70 ---- */
const CORE_SECTIONS = [
  {
    id: "service_quality", en: "Service Quality & Results", ar: "جودة الخدمة والنتائج",
    items: [
      { id: "quality", en: "Quality of Work & Guest Service", ar: "جودة العمل وخدمة الضيوف", weight: 10 },
      { id: "productivity", en: "Productivity & Timely Completion", ar: "إنجاز المهام في الوقت المحدد", weight: 10 }
    ]
  },
  {
    id: "reliability_discipline", en: "Reliability & Discipline", ar: "الموثوقية والانضباط",
    items: [
      { id: "attendance", en: "Attendance, Punctuality & Responsibility", ar: "الحضور والانضباط وتحمل المسؤولية", weight: 10 },
      { id: "procedures", en: "Compliance with Hotel Policies", ar: "الالتزام بسياسات وإجراءات الفندق", weight: 10 }
    ]
  },
  {
    id: "teamwork_communication", en: "Teamwork & Communication", ar: "العمل الجماعي والتواصل",
    items: [
      { id: "teamwork", en: "Teamwork & Cross-Department Cooperation", ar: "العمل الجماعي والتعاون بين الأقسام", weight: 8 },
      { id: "communication", en: "Professional Communication & Guest Care", ar: "التواصل المهني والعناية بالضيف", weight: 7 }
    ]
  },
  {
    id: "safety_improvement", en: "Safety & Improvement", ar: "السلامة والتحسين",
    items: [
      { id: "safety", en: "Safety, Hygiene & Security Awareness", ar: "الوعي بالسلامة والنظافة والأمن", weight: 8 },
      { id: "initiative", en: "Problem Solving & Continuous Improvement", ar: "حل المشكلات والتحسين المستمر", weight: 7 }
    ]
  }
];

/* Each department receives five focused criteria (8 points each = 40). */
function dept(id, en, ar, items) {
  return { id, en, ar, items: items.map((it) => ({ id: it[0], en: it[1], ar: it[2], weight: 8 })) };
}

const DEPARTMENTS = [
  dept("security", "Security", "الأمن والسلامة", [
    ["patrol", "Patrol & Access Control", "الدوريات والتحكم في الدخول"],
    ["cctv", "CCTV & Incident Monitoring", "مراقبة الكاميرات والحوادث"],
    ["emergency", "Emergency Response", "الاستجابة للطوارئ"],
    ["reporting", "Incident Reporting", "إعداد تقارير الحوادث"],
    ["sop", "Security SOP Compliance", "الالتزام بإجراءات الأمن"]
  ]),
  dept("front_office", "Front Office", "مكتب الاستقبال", [
    ["checkin", "Check-in / Check-out Accuracy", "دقة إجراءات الوصول والمغادرة"],
    ["reservation", "Reservations & PMS Accuracy", "دقة الحجوزات ونظام إدارة الفندق"],
    ["complaints", "Guest Complaint Resolution", "معالجة شكاوى الضيوف"],
    ["cash", "Cash & Billing Accuracy", "دقة التعامل مع النقد والفواتير"],
    ["upselling", "Guest Relations & Upselling", "علاقات الضيوف والبيع الإضافي"]
  ]),
  dept("housekeeping", "Housekeeping", "التدبير الفندقي", [
    ["room", "Room Cleaning Quality", "جودة تنظيف الغرف"],
    ["inspection", "Room Inspection Readiness", "جاهزية الغرف للفحص"],
    ["linen", "Linen & Amenities Control", "ضبط المفروشات والمستلزمات"],
    ["chemical", "Safe Use of Chemicals", "الاستخدام الآمن للمواد الكيميائية"],
    ["lostfound", "Lost & Found Procedures", "إجراءات المفقودات والموجودات"]
  ]),
  dept("kitchen", "Kitchen", "المطبخ", [
    ["food_quality", "Food Quality & Presentation", "جودة الطعام وتقديمه"],
    ["hygiene", "Food Safety & Hygiene", "سلامة الغذاء والنظافة"],
    ["temperature", "Temperature & Storage Control", "ضبط درجات الحرارة والتخزين"],
    ["waste", "Waste & Cost Control", "ضبط الهدر والتكلفة"],
    ["production", "Production Timeliness", "إنجاز الإنتاج في الوقت المحدد"]
  ]),
  dept("accounting", "Accounting", "المحاسبة", [
    ["accuracy", "Accounting Accuracy", "دقة القيود المحاسبية"],
    ["reconcile", "Reconciliation & Controls", "المطابقات والضوابط"],
    ["reporting", "Financial Reporting", "إعداد التقارير المالية"],
    ["deadlines", "Timely Closing & Deadlines", "الإقفال والالتزام بالمواعيد"],
    ["confidential", "Confidentiality & Compliance", "السرية والالتزام"]
  ]),
  dept("it", "IT", "تقنية المعلومات", [
    ["support", "User Support Resolution", "حل طلبات دعم المستخدمين"],
    ["uptime", "System Availability", "استقرار الأنظمة"],
    ["security", "Information Security", "أمن المعلومات"],
    ["backup", "Backup & Recovery", "النسخ الاحتياطي والاستعادة"],
    ["documentation", "Technical Documentation", "التوثيق الفني"]
  ]),
  dept("purchasing", "Purchasing", "المشتريات", [
    ["cost", "Cost Optimisation", "ترشيد التكاليف"],
    ["supplier", "Supplier Management", "إدارة الموردين"],
    ["order", "Order Accuracy", "دقة الطلبات"],
    ["timely", "Timely Procurement", "التوريد في الوقت المناسب"],
    ["compliance", "Purchasing Compliance", "الالتزام بإجراءات المشتريات"]
  ]),
  dept("hr", "Human Resources", "الموارد البشرية", [
    ["records", "Employee Records Accuracy", "دقة سجلات الموظفين"],
    ["recruitment", "Recruitment & Onboarding", "التوظيف وإجراءات الالتحاق"],
    ["relations", "Employee Relations", "علاقات الموظفين"],
    ["training", "Training Coordination", "تنسيق التدريب"],
    ["policy", "Policy & Labour Compliance", "الالتزام بالسياسات وأنظمة العمل"]
  ]),
  dept("service", "F&B Service", "خدمة الأطعمة والمشروبات", [
    ["service", "Service Speed & Accuracy", "سرعة ودقة الخدمة"],
    ["guest", "Guest Interaction", "التعامل مع الضيوف"],
    ["setup", "Outlet & Table Readiness", "جاهزية الصالة والطاولات"],
    ["billing", "Order & Billing Accuracy", "دقة الطلبات والفواتير"],
    ["hygiene", "Hygiene & Grooming", "النظافة والمظهر المهني"]
  ]),
  dept("stewarding", "Stewarding", "الإشراف على الأواني", [
    ["cleaning", "Equipment Cleaning Quality", "جودة تنظيف المعدات"],
    ["sanitation", "Sanitation Standards", "معايير التعقيم"],
    ["storage", "Storage & Organisation", "التخزين والتنظيم"],
    ["waste", "Waste Handling", "التعامل مع النفايات"],
    ["safety", "Safety Compliance", "الالتزام بالسلامة"]
  ]),
  dept("bellmen", "Bellmen", "خدمة الحقائب", [
    ["luggage", "Luggage Handling", "التعامل مع الحقائب"],
    ["greeting", "Guest Greeting & Escorting", "استقبال ومرافقة الضيوف"],
    ["information", "Hotel Information Accuracy", "دقة المعلومات المقدمة للضيف"],
    ["dispatch", "Transport & Request Coordination", "تنسيق النقل والطلبات"],
    ["appearance", "Professional Appearance", "المظهر المهني"]
  ]),
  dept("laundry", "Laundry", "المغسلة", [
    ["quality", "Linen Quality", "جودة المفروشات"],
    ["sorting", "Sorting & Labelling Accuracy", "دقة الفرز والترميز"],
    ["timeliness", "Turnaround Time", "سرعة الإنجاز"],
    ["equipment", "Equipment Care", "العناية بالمعدات"],
    ["safety", "Chemical & Safety Compliance", "الالتزام بالمواد والسلامة"]
  ]),
  dept("staff_cafeteria", "Staff Cafeteria", "كافيتيريا الموظفين", [
    ["food", "Food Quality & Availability", "جودة وتوفر الطعام"],
    ["hygiene", "Hygiene Standards", "معايير النظافة"],
    ["service", "Service & Queue Management", "إدارة الخدمة والانتظار"],
    ["waste", "Waste Control", "ضبط الهدر"],
    ["stock", "Stock & Equipment Care", "العناية بالمخزون والمعدات"]
  ]),
  dept("customer_service", "Customer Service", "خدمة العملاء", [
    ["resolution", "Request & Complaint Resolution", "حل الطلبات والشكاوى"],
    ["communication", "Professional Communication", "التواصل المهني"],
    ["followup", "Follow-up & Closure", "المتابعة وإغلاق الطلبات"],
    ["knowledge", "Hotel Knowledge", "الإلمام بخدمات الفندق"],
    ["satisfaction", "Guest Satisfaction", "رضا الضيوف"]
  ])
];

const SEED_HOTELS = [
  { id: "maysan_al_harithiyah", en: "Maysan Al-Harithiyah Hotel", ar: "فندق ميسان الحارثية" },
  { id: "shaza_regency_plaza", en: "Shaza Regency Plaza Hotel", ar: "فندق شذا ريجنسي بلازا" },
  { id: "grand_plaza_badr_al_maqam", en: "Grand Plaza Badr Al Maqam Hotel", ar: "فندق جراند بلازا بدر المقام" },
  { id: "grand_plaza_madinah", en: "Grand Plaza Al Madinah Hotel", ar: "فندق جراند بلازا المدينة المنورة" },
  { id: "maysan_rihab_al_misk", en: "Maysan Rihab Al Misk Hotel", ar: "فندق ميسان رحاب المسك" },
  { id: "maysan_al_taqwa", en: "Maysan Al Taqwa Hotel", ar: "فندق ميسان التقوى" },
  { id: "plaza_inn_ohud", en: "Plaza Inn Ohud Hotel", ar: "فندق بلازا إن أحد" }
];

const SEED_EMPLOYEES = [];

const PERIODS = [
  { id: "probation1", en: "Probation Period 1 (3 Months)", ar: "فترة تجربة (1) — 3 أشهر" },
  { id: "probation2", en: "Probation Period 2 (6 Months)", ar: "فترة تجربة (2) — 6 أشهر" },
  { id: "annual", en: "Annual", ar: "سنوي" }
];

const PERFORMANCE_LEVELS = [
  { min: 95, en: "Outstanding", ar: "متميّز", color: "#15803d" },
  { min: 90, en: "Excellent", ar: "ممتاز", color: "#16a34a" },
  { min: 80, en: "Very Good", ar: "جيد جدًا", color: "#65a30d" },
  { min: 70, en: "Good", ar: "جيد", color: "#ca8a04" },
  { min: 60, en: "Fair", ar: "مقبول", color: "#ea580c" },
  { min: 0, en: "Needs Improvement", ar: "يحتاج إلى تحسين", color: "#dc2626" }
];

const TRAINING_NEEDS = [
  { id: "orientation", en: "Hotel Orientation", ar: "برامج تعريفية بالفندق والشركة" },
  { id: "guest", en: "Guest Relations & Service Quality", ar: "علاقات الضيوف وجودة الخدمة" },
  { id: "professional", en: "Professional & Behavioral Skills", ar: "المهارات المهنية والسلوكية" },
  { id: "management", en: "Management & Supervisory Skills", ar: "المهارات الإدارية والإشرافية" },
  { id: "safety", en: "Safety, Security & Food Hygiene", ar: "الأمن والسلامة والنظافة الغذائية" },
  { id: "other", en: "Other Programs", ar: "برامج أخرى" }
];

const PROMOTION_OPTIONS = [
  { id: "now", en: "Now", ar: "الآن" },
  { id: "6month", en: "6 Months", ar: "6 أشهر" },
  { id: "1year", en: "1 Year", ar: "سنة" },
  { id: "notyet", en: "Not Yet", ar: "ليس بعد" }
];

const DIRECT_MANAGER_RECOMMENDATIONS = [
  { id: "continue", en: "Continue in Position", ar: "يوصى بالاستمرار في الوظيفة" },
  { id: "continue_development", en: "Continue with Development Plan", ar: "يوصى بالاستمرار مع خطة تطوير" },
  { id: "training_followup", en: "Training and Follow-up", ar: "يوصى بالتدريب والمتابعة" },
  { id: "reassess", en: "Reassess after Improvement Period", ar: "يوصى بإعادة التقييم بعد فترة تحسين" },
  { id: "not_recommended", en: "Not Recommended to Continue", ar: "لا يوصى بالاستمرار" }
];

const PERFORMANCE_APPROVERS = [
  { id: "direct_manager", en: "Direct Manager", ar: "المدير المباشر" },
  { id: "human_resources", en: "Human Resources", ar: "الموارد البشرية" },
  { id: "final_management", en: "Final Management", ar: "الإدارة النهائية" }
];

const SIGNATORIES = [
  { id: "employee", en: "Employee", ar: "الموظف" },
  { id: "direct_manager", en: "Direct Manager", ar: "المدير المباشر" },
  { id: "hotel_manager", en: "Hotel Manager", ar: "مدير الفندق" }
];

const CORE_MAX = CORE_SECTIONS.reduce((sum, sec) => sum + sec.items.reduce((total, item) => total + item.weight, 0), 0);
const DEPT_MAX = 40;
const TOTAL_MAX = CORE_MAX + DEPT_MAX;

window.APPRAISAL_DATA = {
  CORE_SECTIONS, DEPARTMENTS, SEED_HOTELS, SEED_EMPLOYEES,
  PERIODS, PERFORMANCE_LEVELS, TRAINING_NEEDS,
  PROMOTION_OPTIONS, DIRECT_MANAGER_RECOMMENDATIONS, PERFORMANCE_APPROVERS, SIGNATORIES,
  CORE_MAX, DEPT_MAX, TOTAL_MAX
};
