-- MAYSAN INTERNATIONAL GROUP — Appraisal system MySQL schema
-- The server creates these tables automatically on startup, but you can
-- also apply this file manually:  mysql <db> < db/schema.sql

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
