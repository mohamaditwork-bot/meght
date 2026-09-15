/* =============================================================
   Server-side appraisal model + scoring.
   Loads the SAME public/js/data.js and public/js/scoring.js used
   by the browser (via a tiny sandbox) so the master data and the
   scoring formula never drift between client and server. The score
   submitted through a manager link is therefore recomputed and
   verified on the server — the client cannot forge it.
   ============================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PUB = path.join(__dirname, '..', 'public', 'js');

function load() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  for (const f of ['data.js', 'scoring.js']) {
    const code = fs.readFileSync(path.join(PUB, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return { D: sandbox.window.APPRAISAL_DATA, SCORING: sandbox.window.SCORING };
}

const { D, SCORING } = load();

function departmentById(id) { return D.DEPARTMENTS.find((d) => d.id === id) || null; }
function hotelById(id) { return D.SEED_HOTELS.find((h) => h.id === id) || null; }

module.exports = { D, SCORING, departmentById, hotelById };
