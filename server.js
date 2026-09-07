// server.js — local launcher. The Express app lives in app.js so it can also
// be reused by the Netlify serverless function.
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  ✅ MAYSAN INT. GROUP — HR Intelligence Platform');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  🔑  رمز الدخول الافتراضي: ${process.env.HR_ADMIN_PASSCODE || '056023'}`);
  console.log('      (إن تعذّر الدخول، أوقف الخادم ونفّذ: npm run reset-login ثم npm start)');
  console.log('');
});
