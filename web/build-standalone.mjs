import fs from 'fs';
const read = (p) => fs.readFileSync(p, 'utf8');

// Inline logos as data URIs (no asset paths in an artifact).
const dataUri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27');
const logo = dataUri(read('public/assets/logo.svg'));
const logoWhite = dataUri(read('public/assets/logo-white.svg'));

const css = read('public/css/app.css');

// Body markup from index.html: keep the login + app shell, drop head/scripts.
let idx = read('public/index.html');
let bodyMarkup = idx.substring(idx.indexOf('<body>') + 6, idx.indexOf('</body>'));
// remove all <script> includes; keep the login/app/toast/modal markup
bodyMarkup = bodyMarkup.replace(/<script[\s\S]*?<\/script>/g, '').trim();

let shim = read('web/shim.bundle.js');
let icons = read('public/js/icons.js');
let charts = read('public/js/charts.js');
let pages = read('public/js/pages.js');
let app = read('web/app.standalone.js');
let uploadMod = read('web/upload.standalone.js');
// Vendor the chart + Excel libraries inline so the page never depends on a CDN
// (guarantees charts render even when external scripts are blocked). ECharts is
// clean UTF-8 and inlined directly; SheetJS legitimately contains U+FFFD chars
// (codepage data) that the artifact publisher rejects, so it is base64-encoded
// and decoded+evaluated at runtime.
const echartsSrc = read('public/js/vendor/echarts.min.js');
const xlsxB64 = fs.readFileSync('public/js/vendor/xlsx.full.min.js').toString('base64');

// Replace logo asset references with data URIs across markup + scripts.
const swap = (s) => s.split('assets/logo-white.svg').join(logoWhite).split('assets/logo.svg').join(logo);
bodyMarkup = swap(bodyMarkup);
pages = swap(pages); charts = swap(charts); app = swap(app); shim = swap(shim); uploadMod = swap(uploadMod);

const html = `<title>MAYSAN HR Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${css}
/* standalone: subtle ribbon */
.demo-ribbon{position:fixed;bottom:12px;inset-inline-start:12px;z-index:80;background:rgba(8,28,15,.88);color:#C5EAD0;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px}
@media print{.demo-ribbon{display:none}}
</style>
${bodyMarkup}
<div class="demo-ribbon">MAYSAN INT. GROUP · نسخة تعمل في المتصفح — يمكنك رفع ملف Excel وتحديث البيانات</div>
<script>${echartsSrc}</script>
<script>(function(){try{var bin=atob("${xlsxB64}");var by=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)by[i]=bin.charCodeAt(i);(0,eval)(new TextDecoder('utf-8').decode(by));}catch(e){console.error('xlsx load failed',e);}})();</script>
<script>${shim}</script>
<script>${icons}</script>
<script>${charts}</script>
<script>${pages}</script>
<script>${uploadMod}</script>
<script>${app}</script>
`;

fs.writeFileSync('web/standalone.html', html);
console.log('standalone.html size:', (html.length / 1024).toFixed(0) + 'KB');
