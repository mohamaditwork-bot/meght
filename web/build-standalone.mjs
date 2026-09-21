import fs from 'fs';
const read = (p) => fs.readFileSync(p, 'utf8');

// Inline logos + QR as data URIs (no asset paths in an artifact).
const dataUri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27');
const logo = dataUri(read('public/assets/logo.svg'));
const logoWhite = dataUri(read('public/assets/logo-white.svg'));
const qr = dataUri(read('public/assets/qr-linktree.svg'));

const css = read('public/css/app.css');
const reportCss = read('public/css/report.css');

// Body markup from index.html: keep the login + app shell, drop head/scripts.
let idx = read('public/index.html');
let bodyMarkup = idx.substring(idx.indexOf('<body>') + 6, idx.indexOf('</body>'));
bodyMarkup = bodyMarkup.replace(/<script[\s\S]*?<\/script>/g, '').trim();

let shim = read('web/shim.bundle.js');
let icons = read('public/js/icons.js');
let charts = read('public/js/charts.js');
let pages = read('public/js/pages.js');
let report = read('public/js/report.js');
let i18n = read('public/js/i18n.js');
let app = read('public/js/app.js');            // unified controller (uses window.clientApi when present)
let uploadMod = read('web/upload.standalone.js');

// Vendor chart + Excel + paged.js libraries inline so the page never depends on
// a CDN. ECharts is clean UTF-8 (inlined directly). SheetJS and paged.js contain
// U+FFFD codepoints the artifact publisher rejects, so they are base64-encoded
// and decoded + evaluated at runtime.
const echartsSrc = read('public/js/vendor/echarts.min.js');
const xlsxB64 = fs.readFileSync('public/js/vendor/xlsx.full.min.js').toString('base64');
const pagedB64 = fs.readFileSync('public/js/vendor/paged.min.js').toString('base64');

// Replace logo + QR asset references with data URIs across markup + scripts.
const swap = (s) => s
  .split('assets/logo-white.svg').join(logoWhite)
  .split('assets/logo.svg').join(logo)
  .split('assets/qr-linktree.svg').join(qr);
bodyMarkup = swap(bodyMarkup);
pages = swap(pages); charts = swap(charts); app = swap(app); shim = swap(shim); uploadMod = swap(uploadMod); report = swap(report);

const decodeEval = (b64, label) => `<script>(function(){try{var bin=atob("${b64}");var by=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)by[i]=bin.charCodeAt(i);(0,eval)(new TextDecoder('utf-8').decode(by));}catch(e){console.error('${label} load failed',e);}})();</script>`;

const html = `<title>MAYSAN INT. GROUP — الموارد البشرية</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${css}
/* standalone: subtle ribbon */
.demo-ribbon{position:fixed;bottom:12px;inset-inline-start:12px;z-index:80;background:rgba(8,28,15,.88);color:#C5EAD0;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px}
@media print{.demo-ribbon{display:none}}
</style>
<script>/* apply saved theme + language before first paint */(function(){try{var t=localStorage.getItem('hr_theme')||'light';var l=localStorage.getItem('hr_lang')||'ar';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('dir',l==='ar'?'rtl':'ltr');document.documentElement.setAttribute('lang',l);}catch(e){}})();</script>
<script>window.__REPORT_CSS__=${JSON.stringify(reportCss)};</script>
${bodyMarkup}
<div class="demo-ribbon">MAYSAN INT. GROUP · يمكنك رفع ملف Excel وتحديث البيانات مباشرة</div>
<script>${echartsSrc}</script>
${decodeEval(xlsxB64, 'xlsx')}
${decodeEval(pagedB64, 'paged.js')}
<script>${shim}</script>
<script>${i18n}</script>
<script>${icons}</script>
<script>${charts}</script>
<script>${pages}</script>
<script>${report}</script>
<script>${uploadMod}</script>
<script>${app}</script>
`;

fs.writeFileSync('web/standalone.html', html);
console.log('standalone.html size:', (html.length / 1024).toFixed(0) + 'KB');
