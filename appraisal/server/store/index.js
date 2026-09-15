/* =============================================================
   Storage selector
   Uses MySQL when a connection is configured (DATABASE_URL or
   MYSQL_* env vars), otherwise falls back to the zero-setup JSON
   file store. Both expose the same async interface.
   ============================================================= */
const { createJsonStore } = require('./json');
const { createMysqlStore, isConfigured } = require('./mysql');

let storePromise = null;

async function getStore() {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    if (isConfigured()) {
      try {
        const s = await createMysqlStore();
        await s.init();
        console.log('[store] MySQL connected:', s.dataLocation);
        return s;
      } catch (e) {
        console.error('[store] MySQL init failed, falling back to JSON file store:', e.message);
      }
    }
    const j = createJsonStore();
    await j.init();
    console.log('[store] JSON file store at:', j.dataLocation);
    return j;
  })();
  return storePromise;
}

module.exports = { getStore };
