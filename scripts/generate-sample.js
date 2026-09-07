// generate-sample.js — produce benchmark sample workbooks that reproduce the
// validation targets: 104 employees, 39 Saudi, 65 non-Saudi, 37.50%, 14
// departments, 41 job titles, Division = فندق ذا فينيو الحارثية.
// These are demo files only; real monthly uploads replace them.
//   • September 2026 = canonical 104 (validates the benchmark).
//   • August 2026    = 104 rows with column order SHUFFLED (proves name-based
//     mapping) and small differences to demo movements (new hires, leavers,
//     a promotion and a salary adjustment).

import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'data', 'samples');

const DIVISION = 'فندق ذا فينيو الحارثية';
const SECTIONS = ['الاستقبال', 'المطبخ', 'المطاعم', 'التدبير الفندقي', 'الأمن والسلامة', 'الصيانة',
  'المبيعات والتسويق', 'الموارد البشرية', 'المالية', 'المشتريات', 'خدمة النزلاء', 'المكتب الأمامي',
  'تقنية المعلومات', 'الإدارة العليا'];
const POSITIONS = [
  'موظف استقبال', 'مشرف استقبال', 'كاشير', 'شيف تنفيذي', 'شيف', 'مساعد شيف', 'ستيوارد',
  'كابتن مطعم', 'نادل', 'مضيف', 'مشرف تدبير', 'عامل نظافة', 'غسيل وكي', 'حارس أمن',
  'مشرف أمن', 'فني كهرباء', 'فني تكييف', 'فني سباكة', 'مشرف صيانة', 'أخصائي مبيعات',
  'مدير مبيعات', 'أخصائي تسويق', 'أخصائي موارد بشرية', 'مدير موارد بشرية', 'محاسب',
  'مدير مالي', 'أمين صندوق', 'موظف مشتريات', 'مدير مشتريات', 'موظف علاقات النزلاء',
  'مشرف علاقات النزلاء', 'موظف مكتب أمامي', 'مدير مكتب أمامي', 'أخصائي تقنية معلومات',
  'مدير تقنية معلومات', 'مدير عام', 'مدير تنفيذي', 'سكرتير تنفيذي', 'منسق موارد بشرية',
  'مشرف مطعم', 'موظف خدمة عملاء',
];
const NAT_SAUDI = 'سعودي';
const NON_SAUDI = ['مصري', 'هندي', 'باكستاني', 'بنغلاديشي', 'فلبيني', 'اندونيسيا', 'نيبالي', 'سوداني', 'يمني', 'اردني', 'سريلانكي'];
const HEADERS = ['Employee Code', 'Name', 'Arabic Name', 'Level Code', 'Division Arabic Name',
  'Sections Arabic Name', 'Positions Arabic Name', 'Total Salary', 'End Annual Balance',
  'End Holiday Balance', 'Gender Arabic Name', 'Nationality Arabic Name', 'Hiring Date',
  'Contract Expire Date', 'Probation Date', 'Health Card Expire Date', 'Residence Expire Date',
  'Passport Expire Date'];

function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function pad(n, w) { return String(n).padStart(w, '0'); }
function dateStr(y, m, d) { return `${pad(d, 2)}/${pad(m, 2)}/${y}`; }

function canonical() {
  const r = rng(42);
  const saudiFlags = [];
  for (let i = 0; i < 104; i++) saudiFlags.push(i < 39);
  for (let i = saudiFlags.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [saudiFlags[i], saudiFlags[j]] = [saudiFlags[j], saudiFlags[i]]; }
  const emps = [];
  for (let i = 0; i < 104; i++) {
    const code = 1000 + i;
    const isSaudi = saudiFlags[i];
    let nat = isSaudi ? NAT_SAUDI : NON_SAUDI[i % NON_SAUDI.length];
    if (nat === 'اندونيسيا' && i % 3 === 0) nat = 'اندونسيا'; // spelling variance (matches the reference example)
    const level = 1 + (i % 7);
    emps.push({
      'Employee Code': code,
      'Name': 'Employee ' + code,
      'Arabic Name': 'الموظف رقم ' + code,
      'Level Code': String(level),
      'Division Arabic Name': DIVISION,
      'Sections Arabic Name': SECTIONS[i % SECTIONS.length],
      'Positions Arabic Name': POSITIONS[i % POSITIONS.length],
      'Total Salary': 3000 + (7 - level) * 1200 + Math.floor(r() * 1500),
      'End Annual Balance': Math.round((r() * 40 + 2) * 100) / 100,
      'End Holiday Balance': Math.round((r() * 12) * 100) / 100,
      'Gender Arabic Name': r() < 0.78 ? 'ذكر' : 'أنثى',
      'Nationality Arabic Name': nat,
      'Hiring Date': dateStr(2016 + Math.floor(r() * 9), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)),
      'Contract Expire Date': r() < 0.85 ? dateStr(2026 + Math.floor(r() * 2), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)) : '',
      'Probation Date': r() < 0.15 ? dateStr(2026, 9 + Math.floor(r() * 3), 1 + Math.floor(r() * 28)) : '',
      'Health Card Expire Date': r() < 0.7 ? dateStr(2025 + Math.floor(r() * 2), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)) : '',
      'Residence Expire Date': isSaudi ? '' : (r() < 0.9 ? dateStr(2026 + Math.floor(r() * 2), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)) : ''),
      'Passport Expire Date': isSaudi ? '' : (r() < 0.8 ? dateStr(2027 + Math.floor(r() * 3), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)) : ''),
    });
  }
  return emps;
}

function writeBook(rows, headerOrder, file) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headerOrder });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, path.join(OUT, file));
  const saudi = rows.filter((e) => e['Nationality Arabic Name'] === NAT_SAUDI).length;
  const depts = new Set(rows.map((e) => e['Sections Arabic Name'])).size;
  const titles = new Set(rows.map((e) => e['Positions Arabic Name'])).size;
  console.log(`${file}: ${rows.length} rows | Saudi ${saudi} (${(saudi / rows.length * 100).toFixed(2)}%) | depts ${depts} | titles ${titles}`);
}

// --- September (current, canonical 104) ---
const sep = canonical();
writeBook(sep, HEADERS, 'HR_Employees_2026-09.xlsx');

// --- August (previous): 104 rows, shuffled columns, pre-change values ---
const aug = canonical();
// Remove 3 codes from August -> they become NEW HIRES in September
const newHireCodes = [1101, 1102, 1103];
let augRows = aug.filter((e) => !newHireCodes.includes(e['Employee Code']));
// Add 3 leaver codes to August (absent in September) -> MISSING/leavers
for (let k = 0; k < 3; k++) {
  const base = { ...aug[k], 'Employee Code': 3000 + k, 'Name': 'Employee ' + (3000 + k), 'Arabic Name': 'موظف سابق ' + (3000 + k) };
  augRows.push(base);
}
// Promotion demo: September promoted 1005; August holds the pre-promotion state.
const augPromo = augRows.find((e) => e['Employee Code'] === 1005);
const sepPromo = sep.find((e) => e['Employee Code'] === 1005);
if (augPromo && sepPromo) {
  sepPromo['Positions Arabic Name'] = 'مشرف علاقات النزلاء';
  sepPromo['Level Code'] = String(Math.max(1, +sepPromo['Level Code'] - 1));
  sepPromo['Total Salary'] = +sepPromo['Total Salary'] + 900;
}
// Salary adjustment demo: September 1010 higher; August holds lower value.
const sepAdj = sep.find((e) => e['Employee Code'] === 1010);
if (sepAdj) sepAdj['Total Salary'] = +sepAdj['Total Salary'] + 400;

// shuffle August column order deterministically
const shuffled = [...HEADERS];
const sr = rng(7);
for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(sr() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }

writeBook(augRows, shuffled, 'HR_Employees_2026-08.xlsx');
// rewrite September with promotion/salary applied
writeBook(sep, HEADERS, 'HR_Employees_2026-09.xlsx');
console.log('\nUpload August first, then September, to see movements (3 new hires, 3 leavers, 1 promotion, 1 salary adjustment).');
