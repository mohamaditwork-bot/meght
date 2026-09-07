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
let uploadOverride = read('web/upload-override.js');

// Replace logo asset references with data URIs across markup + scripts.
const swap = (s) => s.split('assets/logo-white.svg').join(logoWhite).split('assets/logo.svg').join(logo);
bodyMarkup = swap(bodyMarkup);
pages = swap(pages); charts = swap(charts); app = swap(app); shim = swap(shim);

const html = `<title>MAYSAN HR Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
<style>
${css}
/* standalone: show a small demo ribbon */
.demo-ribbon{position:fixed;bottom:12px;inset-inline-start:12px;z-index:80;background:rgba(15,30,43,.9);color:#cdeede;font-size:11px;font-weight:700;padding:6px 12px;border-radius:20px}
@media print{.demo-ribbon{display:none}}
</style>
${bodyMarkup}
<div class="demo-ribbon">MAYSAN INT. GROUP · نسخة عرض حيّة (بيانات سبتمبر 2026)</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script>${shim}</script>
<script>${icons}</script>
<script>${charts}</script>
<script>${pages}</script>
<script>${app}</script>
<script>${uploadOverride}</script>
`;

fs.writeFileSync('web/standalone.html', html);
console.log('standalone.html size:', (html.length / 1024).toFixed(0) + 'KB');
