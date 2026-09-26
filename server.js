// server.js — local / production launcher.
// Loads the data store first (connecting to MySQL and seeding when configured),
// then boots the Express app so all routes read from a ready store.
import { initStore, backend, usingDatabase } from './src/store.js';

const PORT = process.env.PORT || 3000;
// Are we running on an ephemeral cloud container (Railway/Nixpacks/Render…)?
const ON_CLOUD = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID
  || process.env.RENDER || process.env.DYNO || process.env.FLY_APP_NAME || process.env.NIXPACKS_METADATA);

await initStore();
const { default: app } = await import('./app.js');

app.listen(PORT, () => {
  console.log('');
  console.log('  ✅ MAYSAN INT. GROUP — HR Intelligence Platform + Appraisal');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  🗄️   storage backend: ${backend}`);
  console.log(`  🔑  رمز مدير النظام الافتراضي: ${process.env.HR_ADMIN_PASSCODE || '0560239005'}`);
  if (!usingDatabase) {
    console.warn('  ┌──────────────────────────────────────────────────────────────┐');
    console.warn('  │  ⚠️  NO DATABASE CONFIGURED — using local file storage.        │');
    if (ON_CLOUD) {
      console.warn('  │  On this host the disk is EPHEMERAL: data is LOST on every     │');
      console.warn('  │  redeploy/restart. Add a MySQL database and set DATABASE_URL   │');
      console.warn('  │  (or MYSQL_URL) so data persists across deployments.           │');
    }
    console.warn('  └──────────────────────────────────────────────────────────────┘');
  }
  console.log('');
});
