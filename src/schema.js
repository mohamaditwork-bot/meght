// schema.js — Core & dynamic field definitions for the HR Intelligence engine.
// Core fields are the reference contract from the monthly Excel file. Their
// MEANING must never change or be merged. Any unknown column becomes a Dynamic
// field so the schema can grow month to month without a code rewrite.

export const FIELD_TYPES = {
  STRING: 'string',
  NUMBER: 'number',
  DATE: 'date',
  KEY: 'key',
};

// Each core field: canonical key, human label (AR/EN), type, and a list of
// aliases used for name-based (not position-based) matching. Aliases are
// normalized (lowercased, punctuation/space-stripped) before comparison.
export const CORE_FIELDS = [
  {
    key: 'employee_code', label: 'Employee Code', labelAr: 'الرقم الوظيفي',
    type: FIELD_TYPES.KEY, required: true, unique: true,
    aliases: ['employee code', 'emp code', 'employee no', 'employee number', 'emp no',
      'staff id', 'staff code', 'الرقم الوظيفي', 'رقم الموظف', 'كود الموظف', 'الرقم الوظيفى'],
  },
  {
    key: 'name', label: 'Name', labelAr: 'الاسم (إنجليزي)',
    type: FIELD_TYPES.STRING, required: true,
    aliases: ['name', 'english name', 'employee name', 'full name', 'name english', 'eng name'],
  },
  {
    key: 'arabic_name', label: 'Arabic Name', labelAr: 'الاسم (عربي)',
    type: FIELD_TYPES.STRING,
    aliases: ['arabic name', 'name arabic', 'الاسم العربي', 'الاسم بالعربي', 'اسم الموظف', 'الاسم'],
  },
  {
    key: 'level_code', label: 'Level Code', labelAr: 'الدرجة الوظيفية',
    type: FIELD_TYPES.STRING,
    aliases: ['level code', 'level', 'grade', 'grade code', 'job level', 'الدرجة', 'المستوى', 'الدرجة الوظيفية'],
  },
  {
    key: 'division', label: 'Division Arabic Name', labelAr: 'المنشأة / Division',
    type: FIELD_TYPES.STRING,
    aliases: ['division arabic name', 'division', 'division name', 'facility', 'hotel', 'المنشأة',
      'الفندق', 'اسم المنشأة', 'القطاع'],
  },
  {
    key: 'section', label: 'Sections Arabic Name', labelAr: 'القسم',
    type: FIELD_TYPES.STRING,
    aliases: ['sections arabic name', 'section arabic name', 'section', 'department', 'sections',
      'القسم', 'الأقسام', 'اسم القسم'],
  },
  {
    key: 'position', label: 'Positions Arabic Name', labelAr: 'المسمى الوظيفي',
    type: FIELD_TYPES.STRING,
    aliases: ['positions arabic name', 'position arabic name', 'position', 'job title', 'title',
      'positions', 'المسمى الوظيفي', 'المسمى', 'الوظيفة', 'المهنة'],
  },
  {
    key: 'total_salary', label: 'Total Salary', labelAr: 'إجمالي الراتب',
    type: FIELD_TYPES.NUMBER,
    aliases: ['total salary', 'salary', 'gross salary', 'total pay', 'إجمالي الراتب', 'الراتب',
      'الراتب الاجمالي', 'الراتب الإجمالي'],
  },
  {
    key: 'end_annual_balance', label: 'End Annual Balance', labelAr: 'رصيد الإجازة السنوية',
    type: FIELD_TYPES.NUMBER,
    aliases: ['end annual balance', 'annual balance', 'annual leave balance', 'leave balance',
      'رصيد الاجازة السنوية', 'رصيد الإجازة السنوية', 'الرصيد السنوي'],
  },
  {
    key: 'end_holiday_balance', label: 'End Holiday Balance', labelAr: 'رصيد الـHoliday',
    type: FIELD_TYPES.NUMBER,
    aliases: ['end holiday balance', 'holiday balance', 'رصيد الهوليدي', 'رصيد العطلات', 'رصيد الاجازات'],
  },
  {
    key: 'gender', label: 'Gender Arabic Name', labelAr: 'الجنس',
    type: FIELD_TYPES.STRING,
    aliases: ['gender arabic name', 'gender', 'sex', 'الجنس', 'النوع'],
  },
  {
    key: 'nationality', label: 'Nationality Arabic Name', labelAr: 'الجنسية',
    type: FIELD_TYPES.STRING,
    aliases: ['nationality arabic name', 'nationality', 'الجنسية', 'الجنسيه', 'الجنسية العربية'],
  },
  {
    key: 'hiring_date', label: 'Hiring Date', labelAr: 'تاريخ التعيين',
    type: FIELD_TYPES.DATE,
    aliases: ['hiring date', 'hire date', 'joining date', 'date of joining', 'تاريخ التعيين',
      'تاريخ المباشرة', 'تاريخ الالتحاق'],
  },
  {
    key: 'contract_expire_date', label: 'Contract Expire Date', labelAr: 'انتهاء العقد',
    type: FIELD_TYPES.DATE,
    aliases: ['contract expire date', 'contract expiry date', 'contract end date', 'contract expiry',
      'تاريخ انتهاء العقد', 'انتهاء العقد', 'نهاية العقد'],
  },
  {
    key: 'probation_date', label: 'Probation Date', labelAr: 'انتهاء فترة التجربة',
    type: FIELD_TYPES.DATE,
    aliases: ['probation date', 'probation end date', 'probation expiry', 'تاريخ انتهاء التجربة',
      'انتهاء فترة التجربة', 'فترة التجربة'],
  },
  {
    key: 'health_card_expire_date', label: 'Health Card Expire Date', labelAr: 'انتهاء البطاقة الصحية',
    type: FIELD_TYPES.DATE,
    aliases: ['health card expire date', 'health card expiry date', 'health certificate expiry',
      'health card expiry', 'تاريخ انتهاء البطاقة الصحية', 'انتهاء الشهادة الصحية', 'البطاقة الصحية'],
  },
  {
    key: 'residence_expire_date', label: 'Residence Expire Date', labelAr: 'انتهاء الإقامة',
    type: FIELD_TYPES.DATE,
    aliases: ['residence expire date', 'residence expiry date', 'iqama expiry', 'iqama expire date',
      'residence expiry', 'تاريخ انتهاء الإقامة', 'انتهاء الاقامة', 'الإقامة'],
  },
  {
    key: 'passport_expire_date', label: 'Passport Expire Date', labelAr: 'انتهاء الجواز',
    type: FIELD_TYPES.DATE,
    aliases: ['passport expire date', 'passport expiry date', 'passport expiry',
      'تاريخ انتهاء الجواز', 'انتهاء جواز السفر', 'الجواز'],
  },
  {
    // Contractor / labor-supply company. When present the employee belongs to an
    // external contracted company; when empty the employee is a DIRECT employee.
    key: 'contractor', label: 'Location Arabic Name', labelAr: 'الشركة المتعاقدة / الموقع',
    type: FIELD_TYPES.STRING,
    aliases: ['location arabic name', 'location', 'site', 'site code', 'company', 'company name',
      'contractor', 'contractor name', 'كود الموقع', 'اسم الشركة', 'الشركة', 'الموقع',
      'الشركة المتعاقدة', 'اسم الموقع', 'المقاول', 'شركة التوريد'],
  },
];

export const CORE_KEYS = CORE_FIELDS.map((f) => f.key);
export const DATE_KEYS = CORE_FIELDS.filter((f) => f.type === FIELD_TYPES.DATE).map((f) => f.key);
export const CORE_BY_KEY = Object.fromEntries(CORE_FIELDS.map((f) => [f.key, f]));

// Document/expiry fields drive the compliance center.
export const EXPIRY_FIELDS = [
  { key: 'contract_expire_date', label: 'العقد', labelEn: 'Contract' },
  { key: 'probation_date', label: 'فترة التجربة', labelEn: 'Probation' },
  { key: 'health_card_expire_date', label: 'البطاقة الصحية', labelEn: 'Health Card' },
  { key: 'residence_expire_date', label: 'الإقامة', labelEn: 'Residence / Iqama' },
  { key: 'passport_expire_date', label: 'الجواز', labelEn: 'Passport' },
];

// Normalize a header/string for name-based matching.
export function normHeader(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[ً-ٰٟ]/g, '') // strip Arabic diacritics
    .replace(/[إأآا]/g, 'ا') // unify alef forms
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[._\-/\\()[\]{}:;,#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
