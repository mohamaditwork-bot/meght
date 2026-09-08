// build-seed.js — build the shipped seed dataset + standalone embed-data.js from
// a REAL Excel file, using the exact production pipeline (name-based mapping →
// records → validation → KPIs). Usage:
//   node scripts/build-seed.js [path/to/file.xlsx] [periodLabel] [asOf]
// Defaults to data/samples/HR_Employees.xlsx.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { readWorkbook } from '../src/workbook.js';
import { proposeMapping } from '../src/mapping.js';
import { buildRecords } from '../src/transform.js';
import { validate } from '../src/validation.js';
import { computeKPIs } from '../src/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const file = process.argv[2] || path.join(root, 'data', 'samples', 'HR_Employees.xlsx');
const periodLabel = process.argv[3] || 'سبتمبر 2026';
const period = process.argv[4] || '2026-09';
const asOf = process.argv[5] || '2026-09-01';
const fileName = path.basename(file);

const buf = fs.readFileSync(file);
const { headers, rows } = readWorkbook(buf);
const mapping = proposeMapping(headers, rows);
const { records, dynamicFields } = buildRecords(headers, rows, mapping, {});
const validation = validate(records, mapping);
const kpis = computeKPIs(records, asOf);

const id = crypto.randomUUID();
const snapDir = path.join(root, 'data', 'seed', 'snapshots');
fs.mkdirSync(snapDir, { recursive: true });
// clear old snapshots
for (const f of fs.readdirSync(snapDir)) fs.unlinkSync(path.join(snapDir, f));
fs.writeFileSync(path.join(snapDir, id + '.json'), JSON.stringify({ records, dynamicFields, validation, asOf, mapping, normalizationMaps: {} }));

const meta = {
  snapshots: [{
    id, period, periodLabel, asOf, fileName,
    uploadedAt: new Date().toISOString(), committedAt: new Date().toISOString(), uploadedBy: 'admin',
    employeeCount: records.length, saudiPct: kpis.saudi_pct, payroll: kpis.total_payroll,
    qualityScore: validation.quality.score, status: 'committed',
  }],
  activeSnapshotId: id,
};
fs.writeFileSync(path.join(root, 'data', 'seed', 'meta.json'), JSON.stringify(meta, null, 2));

// Regenerate the standalone embedded dataset.
const rulesPath = path.join(root, 'data', 'seed', 'localization-rules.json');
const rules = fs.existsSync(rulesPath) ? JSON.parse(fs.readFileSync(rulesPath, 'utf8')) : [];
const SNAPSHOTS = { [id]: { records, asOf, quality: validation.quality, meta: {
  id, period, periodLabel, asOf, fileName, uploadedAt: meta.snapshots[0].uploadedAt,
  uploadedBy: 'admin', employeeCount: records.length, saudiPct: kpis.saudi_pct,
  payroll: kpis.total_payroll, qualityScore: validation.quality.score,
} } };
const META = { snapshots: [SNAPSHOTS[id].meta], activeSnapshotId: id };
const embed = `// Auto-generated embedded data from the real HR Excel file.\n`
  + `export const SNAPSHOTS = ${JSON.stringify(SNAPSHOTS)};\n`
  + `export const META = ${JSON.stringify(META)};\n`
  + `export const RULES = ${JSON.stringify(rules)};\n`;
fs.writeFileSync(path.join(root, 'web', 'embed-data.js'), embed);

const hotels = [...new Set(records.map((r) => r.division).filter(Boolean))];
console.log(`Seed built from ${fileName}: ${records.length} employees | Saudi ${kpis.saudi_employees} (${kpis.saudi_pct.toFixed(2)}%) | quality ${validation.quality.score}`);
console.log(`Hotels (division): ${hotels.length} → ${hotels.join(' · ')}`);
console.log(`Departments ${kpis.departments} | Positions ${kpis.positions} | Nationalities ${kpis.nationalities}`);
