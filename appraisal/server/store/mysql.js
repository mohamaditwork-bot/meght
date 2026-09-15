/* =============================================================
   MySQL storage adapter (production)
   Enabled when a MySQL connection is configured via env:
     DATABASE_URL=mysql://user:pass@host:3306/dbname
   or the discrete MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD /
   MYSQL_DATABASE / MYSQL_PORT variables.
   Nested objects (ratings, signatures, payload…) are stored in
   JSON columns. Schema lives in db/schema.sql and is created
   automatically on init.
   ============================================================= */
const mysql = require('mysql2/promise');

function config() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const host = process.env.MYSQL_HOST || process.env.MYSQLHOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306),
    user: process.env.MYSQL_USER || process.env.MYSQLUSER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.MYSQLDATABASE || 'maysan_appraisal',
  };
}

function isConfigured() { return !!config(); }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(191) PRIMARY KEY,
  v JSON NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS appraisals (
  id VARCHAR(64) PRIMARY KEY,
  report_no VARCHAR(64) NULL,
  hotel_name VARCHAR(255) NULL,
  employee_name VARCHAR(255) NULL,
  employee_no VARCHAR(64) NULL,
  job_title VARCHAR(255) NULL,
  dept_id VARCHAR(64) NULL,
  total DECIMAL(6,2) NULL,
  pct DECIMAL(6,2) NULL,
  source VARCHAR(32) NULL,
  invite_token VARCHAR(64) NULL,
  doc JSON NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX idx_appraisals_dept (dept_id),
  INDEX idx_appraisals_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS performance_reviews (
  id VARCHAR(64) PRIMARY KEY,
  report_no VARCHAR(64) NULL,
  doc JSON NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invites (
  token VARCHAR(64) PRIMARY KEY,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  hotel_id VARCHAR(64) NULL,
  hotel_name VARCHAR(255) NULL,
  dept_id VARCHAR(64) NULL,
  lock_dept TINYINT(1) NOT NULL DEFAULT 0,
  employee_name VARCHAR(255) NULL,
  employee_no VARCHAR(64) NULL,
  job_title VARCHAR(255) NULL,
  manager_name VARCHAR(255) NULL,
  period_id VARCHAR(64) NULL,
  note TEXT NULL,
  result_id VARCHAR(64) NULL,
  created_by VARCHAR(255) NULL,
  created_at DATETIME NULL,
  submitted_at DATETIME NULL,
  expires_at DATETIME NULL,
  doc JSON NULL,
  INDEX idx_invites_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

function toDate(iso) { return iso ? new Date(iso) : null; }
function parseDoc(row) {
  if (!row) return null;
  const doc = typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc;
  return doc || null;
}

async function createMysqlStore() {
  const cfg = config();
  const pool = mysql.createPool(
    typeof cfg === 'string'
      ? cfg + (cfg.includes('?') ? '&' : '?') + 'connectionLimit=8&waitForConnections=true'
      : Object.assign({}, cfg, { connectionLimit: 8, waitForConnections: true })
  );

  async function exec(sql, params) { const [r] = await pool.query(sql, params); return r; }

  return {
    kind: 'mysql',
    dataLocation: typeof cfg === 'string' ? cfg.replace(/:[^:@/]*@/, ':****@') : `${cfg.host}/${cfg.database}`,
    async init() {
      // Run each statement separately (multipleStatements off by default).
      for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) {
        await exec(stmt);
      }
      return true;
    },

    settings: {
      async get(key, fallback) {
        const rows = await exec('SELECT v FROM settings WHERE k=?', [key]);
        if (!rows.length) return fallback;
        const v = rows[0].v;
        return v == null ? fallback : (typeof v === 'string' ? JSON.parse(v) : v);
      },
      async set(key, value) {
        await exec('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [key, JSON.stringify(value)]);
        return value;
      },
    },
    async nextSeq(name) {
      const key = 'seq:' + name;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.query('SELECT v FROM settings WHERE k=? FOR UPDATE', [key]);
        let cur = 0;
        if (rows.length && rows[0].v != null) cur = Number(typeof rows[0].v === 'string' ? JSON.parse(rows[0].v) : rows[0].v) || 0;
        const next = cur + 1;
        await conn.query('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [key, JSON.stringify(next)]);
        await conn.commit();
        return next;
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },

    appraisals: {
      async list() {
        const rows = await exec('SELECT doc FROM appraisals ORDER BY created_at ASC', []);
        return rows.map(parseDoc);
      },
      async get(id) {
        const rows = await exec('SELECT doc FROM appraisals WHERE id=?', [id]);
        return rows.length ? parseDoc(rows[0]) : null;
      },
      async save(obj) {
        const s = obj.score || {};
        await exec(
          `INSERT INTO appraisals (id, report_no, hotel_name, employee_name, employee_no, job_title, dept_id, total, pct, source, invite_token, doc, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE report_no=VALUES(report_no), hotel_name=VALUES(hotel_name), employee_name=VALUES(employee_name),
             employee_no=VALUES(employee_no), job_title=VALUES(job_title), dept_id=VALUES(dept_id), total=VALUES(total), pct=VALUES(pct),
             source=VALUES(source), invite_token=VALUES(invite_token), doc=VALUES(doc), updated_at=VALUES(updated_at)`,
          [obj.id, obj.reportNo || null, obj.hotelName || null, obj.employeeName || null, obj.employeeNo || null,
           obj.jobTitle || null, obj.deptId || null, s.total != null ? s.total : null, s.pct != null ? s.pct : null,
           obj.source || 'admin', obj.inviteToken || null, JSON.stringify(obj), toDate(obj.createdAt) || new Date(), new Date()]
        );
        return obj;
      },
      async remove(id) { await exec('DELETE FROM appraisals WHERE id=?', [id]); },
    },

    performance: {
      async list() {
        const rows = await exec('SELECT doc FROM performance_reviews ORDER BY created_at ASC', []);
        return rows.map(parseDoc);
      },
      async get(id) {
        const rows = await exec('SELECT doc FROM performance_reviews WHERE id=?', [id]);
        return rows.length ? parseDoc(rows[0]) : null;
      },
      async save(obj) {
        await exec(
          `INSERT INTO performance_reviews (id, report_no, doc, created_at, updated_at) VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE report_no=VALUES(report_no), doc=VALUES(doc), updated_at=VALUES(updated_at)`,
          [obj.id, obj.reportNo || null, JSON.stringify(obj), toDate(obj.createdAt) || new Date(), new Date()]
        );
        return obj;
      },
      async remove(id) { await exec('DELETE FROM performance_reviews WHERE id=?', [id]); },
    },

    invites: {
      async list() {
        const rows = await exec('SELECT doc FROM invites ORDER BY created_at DESC', []);
        return rows.map(parseDoc);
      },
      async get(token) {
        const rows = await exec('SELECT doc FROM invites WHERE token=?', [token]);
        return rows.length ? parseDoc(rows[0]) : null;
      },
      async create(obj) {
        await exec(
          `INSERT INTO invites (token, status, hotel_id, hotel_name, dept_id, lock_dept, employee_name, employee_no, job_title, manager_name, period_id, note, result_id, created_by, created_at, submitted_at, expires_at, doc)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [obj.token, obj.status || 'open', obj.hotelId || null, obj.hotelName || null, obj.deptId || null,
           obj.lockDept ? 1 : 0, obj.employeeName || null, obj.employeeNo || null, obj.jobTitle || null,
           obj.managerName || null, obj.periodId || null, obj.note || null, obj.resultId || null, obj.createdBy || null,
           toDate(obj.createdAt) || new Date(), toDate(obj.submittedAt), toDate(obj.expiresAt), JSON.stringify(obj)]
        );
        return obj;
      },
      async update(token, patch) {
        const cur = await this.get(token);
        if (!cur) return null;
        const next = Object.assign({}, cur, patch);
        await exec(
          `UPDATE invites SET status=?, result_id=?, submitted_at=?, doc=? WHERE token=?`,
          [next.status || 'open', next.resultId || null, toDate(next.submittedAt), JSON.stringify(next), token]
        );
        return next;
      },
      async remove(token) { await exec('DELETE FROM invites WHERE token=?', [token]); },
    },
  };
}

module.exports = { createMysqlStore, isConfigured };
