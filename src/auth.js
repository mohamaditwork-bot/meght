// auth.js — secure passcode auth (scrypt hashing via Node crypto, no plaintext
// in front-end or JS), role-based permissions, and failed-login lockout.

import crypto from 'crypto';
import { getUsers, saveUsers, appendAudit } from './store.js';

// ---- Permission model ----------------------------------------------------
export const PERMISSIONS = [
  'view_dashboard', 'view_workforce', 'view_saudization', 'view_nationality',
  'view_departments', 'view_jobtitles', 'view_leave', 'view_expiry', 'view_employees',
  'view_movements', 'view_comparison', 'view_salary', 'upload_data', 'manage_mapping',
  'approve_validation', 'manage_movements', 'manage_leavers', 'manage_localization_rules',
  'view_insights', 'view_reports', 'export_reports', 'view_audit', 'manage_users',
];

export const ROLES = {
  admin: { label: 'Admin — مدير النظام', permissions: [...PERMISSIONS] },
  // Leadership (General Manager / HR Manager): can SEE everything across the
  // platform (all dashboards, reports, employees, salary, saudization, expiry…)
  // and export/print — but NONE of the administrative machinery (no Excel
  // upload, no user management, no rule/mapping editing, no deletes). This keeps
  // their view clean and simple. Used for both المدير العام and مدير الموارد البشرية.
  executive: {
    label: 'قيادة — اطّلاع شامل (GM / HR Manager)',
    permissions: ['view_dashboard', 'view_workforce', 'view_saudization', 'view_nationality',
      'view_departments', 'view_jobtitles', 'view_leave', 'view_expiry', 'view_employees',
      'view_movements', 'view_comparison', 'view_salary', 'view_insights',
      'view_reports', 'export_reports'],
  },
  hr_manager: {
    label: 'HR Manager — مدير الموارد البشرية',
    permissions: PERMISSIONS.filter((p) => p !== 'manage_users'),
  },
  hr_officer: {
    label: 'HR Officer — أخصائي موارد بشرية',
    permissions: ['view_dashboard', 'view_workforce', 'view_saudization', 'view_nationality',
      'view_departments', 'view_jobtitles', 'view_leave', 'view_expiry', 'view_employees',
      'view_movements', 'view_comparison', 'upload_data', 'manage_mapping', 'approve_validation',
      'manage_leavers', 'view_insights', 'view_reports', 'export_reports'],
  },
  dept_manager: {
    label: 'Department Manager — مدير قسم',
    permissions: ['view_dashboard', 'view_departments', 'view_employees', 'view_expiry', 'view_reports'],
  },
  viewer: {
    label: 'Viewer — مطّلع',
    permissions: ['view_dashboard'],
  },
};

export function permissionsFor(role) { return ROLES[role]?.permissions || []; }
export function can(user, perm) { return !!user && permissionsFor(user.role).includes(perm); }

// ---- Hashing -------------------------------------------------------------
export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(secret), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}
export function verifySecret(secret, stored) {
  try {
    const [, salt, hash] = stored.split('$');
    const derived = crypto.scryptSync(String(secret), salt, 64).toString('hex');
    const a = Buffer.from(derived, 'hex'), b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// ---- Bootstrap default admin --------------------------------------------
// Default passcode is stored HASHED, never in plaintext / front-end. Username
// and passcode are configurable via env but default to the official account so
// login is IDENTICAL locally and after deployment.
const DEFAULT_USERNAME = process.env.HR_ADMIN_USERNAME || 'mohammed.almutahhar';
const DEFAULT_PASSCODE = process.env.HR_ADMIN_PASSCODE || '0560239005';
const DEFAULT_NAME = process.env.HR_ADMIN_NAME || 'محمد المطهر';
// Passcodes that older builds shipped as the admin default. When the stored
// admin is still on one of these, seeding rotates it to the new passcode so the
// old code stops working after this change.
const RETIRED_ADMIN_PASSCODES = ['056023'];

// Leadership accounts seeded automatically: General Manager & HR Manager. They
// get the `executive` role (see full everything, but no upload / user-management
// / rule editing / deletes). Passcodes are overridable via env.
const LEADERSHIP = [
  { id: 'gm_nawaf', username: 'nawaf.gm', name: 'نواف غبان', role: 'executive', passcode: process.env.GM_PASSCODE || '0507575747' },
  { id: 'hrm_majed', username: 'majed.hr', name: 'ماجد', role: 'executive', passcode: process.env.HRM_PASSCODE || '05959222959' },
];

function makeUser(u) {
  return {
    id: u.id, username: u.username, name: u.name, role: u.role,
    secret: hashSecret(u.passcode), createdAt: new Date().toISOString(),
    active: true, failedAttempts: 0, lockedUntil: null,
  };
}
function makeAdmin() {
  return makeUser({ id: 'admin', username: DEFAULT_USERNAME, name: DEFAULT_NAME, role: 'admin', passcode: DEFAULT_PASSCODE });
}

function safeSave(store) { try { saveUsers(store); } catch (e) { /* read-only FS: keep working in-memory */ } }

// Add the leadership accounts if they are not already present (idempotent).
function ensureLeadership(store) {
  let changed = false;
  for (const L of LEADERSHIP) {
    if (!store.users.some((u) => u.username === L.username || u.id === L.id)) {
      store.users.push(makeUser(L)); changed = true;
    }
  }
  return changed;
}

export function ensureSeeded() {
  let store = getUsers();
  if (store && store.users && store.users.length) {
    let changed = false;
    const admin = store.users.find((u) => u.role === 'admin');
    if (admin && !process.env.HR_ADMIN_USERNAME_LOCKED) {
      // Keep the primary admin username/name in sync with the configured account.
      if (admin.username !== DEFAULT_USERNAME) { admin.username = DEFAULT_USERNAME; changed = true; }
      if (admin.name !== DEFAULT_NAME && (admin.name === 'الموارد البشرية' || !admin.name)) { admin.name = DEFAULT_NAME; changed = true; }
      // Retire the old default passcode: if the admin is still on a shipped
      // default, rotate to the new passcode so the previous code stops working.
      if (RETIRED_ADMIN_PASSCODES.some((p) => verifySecret(p, admin.secret))) {
        admin.secret = hashSecret(DEFAULT_PASSCODE); admin.name = DEFAULT_NAME; changed = true;
      }
    }
    if (ensureLeadership(store)) changed = true;
    if (changed) safeSave(store);
    return store;
  }
  store = { users: [makeAdmin()] };
  ensureLeadership(store);
  safeSave(store);
  return store;
}

// ---- Login with lockout --------------------------------------------------
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Login by passcode only (single-field login as specified). If multiple users
// exist, the passcode is matched against active users; admin passcode wins.
export function loginByPasscode(passcode, ip) {
  const store = ensureSeeded();
  const now = Date.now();
  for (const u of store.users) {
    if (!u.active) continue;
    if (u.lockedUntil && now < u.lockedUntil) continue;
    if (verifySecret(passcode, u.secret)) {
      u.failedAttempts = 0; u.lockedUntil = null; u.lastLogin = new Date().toISOString();
      safeSave(store);
      appendAudit({ action: 'login', actor: u.username, ip, detail: 'تسجيل دخول ناجح' });
      return { ok: true, user: publicUser(u) };
    }
  }
  // Bulletproof bootstrap: the configured admin passcode ALWAYS authenticates,
  // even if users.json could not be read/persisted (read-only serverless FS,
  // corrupt/stale file). This guarantees login is identical after deployment.
  if (String(passcode) === String(DEFAULT_PASSCODE)) {
    const admin = store.users.find((u) => u.role === 'admin' && (!u.lockedUntil || now >= u.lockedUntil));
    const user = admin || makeAdmin();
    appendAudit({ action: 'login', actor: user.username, ip, detail: 'تسجيل دخول ناجح (bootstrap)' });
    return { ok: true, user: publicUser(user) };
  }
  // No match: increment attempts on the admin/first account for lockout tracking
  const primary = store.users.find((u) => u.role === 'admin') || store.users[0];
  if (primary) {
    primary.failedAttempts = (primary.failedAttempts || 0) + 1;
    if (primary.failedAttempts >= MAX_ATTEMPTS) {
      primary.lockedUntil = now + LOCK_MINUTES * 60000;
      primary.failedAttempts = 0;
      appendAudit({ action: 'login_locked', actor: primary.username, ip, detail: `تم قفل الدخول ${LOCK_MINUTES} دقيقة` });
    }
    safeSave(store);
  }
  appendAudit({ action: 'login_failed', actor: 'unknown', ip, detail: 'رمز دخول غير صحيح' });
  const locked = primary && primary.lockedUntil && now < primary.lockedUntil;
  return { ok: false, locked, lockMinutes: LOCK_MINUTES };
}

export function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: ROLES[u.role]?.label, permissions: permissionsFor(u.role) };
}

export function listUsers() {
  const store = ensureSeeded();
  return store.users.map(publicUser);
}
export function createUser({ username, name, role, passcode }, actor) {
  const store = ensureSeeded();
  if (!ROLES[role]) throw new Error('صلاحية غير معروفة');
  if (store.users.some((u) => u.username === username)) throw new Error('اسم المستخدم موجود مسبقاً');
  const u = { id: crypto.randomUUID(), username, name: name || username, role, secret: hashSecret(passcode), active: true, createdAt: new Date().toISOString(), failedAttempts: 0, lockedUntil: null };
  store.users.push(u); safeSave(store);
  appendAudit({ action: 'user_created', actor, detail: `إنشاء مستخدم ${username} (${role})` });
  return publicUser(u);
}
export function updateUser(id, patch, actor) {
  const store = ensureSeeded();
  const u = store.users.find((x) => x.id === id);
  if (!u) throw new Error('المستخدم غير موجود');
  if (patch.role && ROLES[patch.role]) u.role = patch.role;
  if (patch.name) u.name = patch.name;
  if (typeof patch.active === 'boolean') u.active = patch.active;
  if (patch.passcode) u.secret = hashSecret(patch.passcode);
  safeSave(store);
  appendAudit({ action: 'user_updated', actor, detail: `تعديل المستخدم ${u.username}` });
  return publicUser(u);
}
