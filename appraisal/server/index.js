/* Standalone launcher for the appraisal app (runs it on its own port).
   In the unified deployment the HR platform mounts createAppraisalApp() at
   /appraisal instead. Both serve the app under the /appraisal path. */
const express = require('express');
const { createAppraisalApp } = require('./app.cjs');

const app = express();
app.disable('x-powered-by');
app.use('/evaluation', createAppraisalApp());
app.get('/', (req, res) => res.redirect('/evaluation/'));
app.get('/healthz', (req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT || 8090);
app.listen(PORT, () => {
  console.log(`MAYSAN appraisal (standalone) on http://localhost:${PORT}/evaluation/`);
});
