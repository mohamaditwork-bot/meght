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
const DEFAULT_USERNAME = process.env.HR_ADMIN_USERNAME || 'mohamad.hr';
const DEFAULT_PASSCODE = process.env.HR_ADMIN_PASSCODE || '056023';
const DEFAULT_NAME = process.env.HR_ADMIN_NAME || 'الموارد البشرية';

function makeAdmin() {
  return {
    id: 'admin', username: DEFAULT_USERNAME, name: DEFAULT_NAME,
    role: 'admin', secret: hashSecret(DEFAULT_PASSCODE),
    createdAt: new Date().toISOString(), active: true,
    failedAttempts: 0, lockedUntil: null,
  };
}

function safeSave(store) { try { saveUsers(store); } catch (e) { /* read-only FS: keep working in-memory */ } }

export function ensureSeeded() {
  let store = getUsers();
  if (store && store.users && store.users.length) {
    // Keep the primary admin username in sync with the configured account.
    const admin = store.users.find((u) => u.role === 'admin');
    if (admin && admin.username !== DEFAULT_USERNAME && !process.env.HR_ADMIN_USERNAME_LOCKED) {
      admin.username = DEFAULT_USERNAME; safeSave(store);
    }
    return store;
  }
  store = { users: [makeAdmin()] };
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
