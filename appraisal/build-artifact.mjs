import fs from 'fs';
import path from 'path';

const P = (f) => path.join('public', f);
const read = (f) => fs.readFileSync(P(f), 'utf8');

// Logo as a data URI (no external asset paths in an artifact).
const logo = 'data:image/svg+xml,' + encodeURIComponent(read('assets/logo.svg')).replace(/'/g, '%27');

// index.html body: keep the shell markup, drop script tags + the HR-home link.
let idx = read('index.html');
let body = idx.substring(idx.indexOf('<body>') + 6, idx.indexOf('</body>'));
body = body.replace(/<script[\s\S]*?<\/script>/g, '');
// Point the "الموارد البشرية" button at the HR platform's stable link (opens it
// in a new tab from the preview). On the deployed server this stays "/".
const HR_URL = 'https://claude.ai/artifact/Pa7iMKYVBA6zttXEtg6DTL';
body = body.split('<a class="btn btn-ghost" href="/" title="الموارد البشرية">')
  .join('<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + HR_URL + '" title="الموارد البشرية">');
// swap logo asset references to the inlined data URI
body = body.split('/appraisal/assets/logo.svg').join(logo);
body = body.trim();

const css = read('css/styles.css');

// Scripts to inline, in load order. store.artifact.js replaces api.js.
const scripts = ['vendor/qrcode.js', 'js/data.js', 'js/i18n.js', 'js/scoring.js',
  'js/scorectl.js', 'js/store.artifact.js', 'js/report.js', 'js/export.js',
  'js/vendor/echarts.min.js', 'js/app.js']
  .map((f) => `<script>\n${read(f)}\n</script>`).join('\n');

const ribbon = '<div class="demo-ribbon" style="position:fixed;bottom:12px;inset-inline-start:12px;z-index:80;background:rgba(11,77,46,.92);color:#c5ead0;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px">نسخة معاينة — البيانات تُحفظ في هذا المتصفح</div>';

const fonts =
`<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">`;

const out =
`<title>MAYSAN — تقييم الأداء</title>
${fonts}
<style>
${css}
</style>
${body}
${ribbon}
${scripts}
`;

fs.mkdirSync('dist-artifact', { recursive: true });
fs.writeFileSync('dist-artifact/standalone.html', out);
console.log('appraisal artifact:', (out.length / 1024).toFixed(0) + 'KB');
