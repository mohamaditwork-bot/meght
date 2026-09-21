// server.js — local / production launcher.
// Loads the data store first (connecting to MySQL and seeding when configured),
// then boots the Express app so all routes read from a ready store.
import { initStore, backend } from './src/store.js';

const PORT = process.env.PORT || 3000;

await initStore();
const { default: app } = await import('./app.js');

app.listen(PORT, () => {
  console.log('');
  console.log('  ✅ MAYSAN INT. GROUP — HR Intelligence Platform + Appraisal');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  🗄️   storage backend: ${backend}`);
  console.log(`  🔑  رمز مدير النظام الافتراضي: ${process.env.HR_ADMIN_PASSCODE || '0560239005'}`);
  console.log('');
});
