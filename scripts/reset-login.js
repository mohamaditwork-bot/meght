// reset-login.js — clears saved accounts/sessions so the default admin passcode
// (056023, or HR_ADMIN_PASSCODE) is re-seeded on the next start. Cross-platform.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');
const usersFile = path.join(DATA, 'users.json');

let removed = false;
try {
  if (fs.existsSync(usersFile)) { fs.unlinkSync(usersFile); removed = true; }
} catch (e) { /* ignore */ }

console.log(removed
  ? '✓ تم حذف ملف الحسابات القديم. شغّل الآن: npm start  ثم ادخل بالرمز 056023'
  : 'ℹ️ لا يوجد ملف حسابات محفوظ. الرمز الافتراضي 056023 سيعمل مباشرة بعد npm start');
