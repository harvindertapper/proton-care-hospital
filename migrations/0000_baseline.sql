-- Migration 0000: Baseline Schema
-- Establishes versioned migration history for D1 database while runtime initialization in app/lib/server.ts remains temporarily operational in Bundle B0.

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STAFF',
  password_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STAFF',
  csrf TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  patient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  department_slug TEXT NOT NULL,
  department_name TEXT NOT NULL,
  requested_date TEXT NOT NULL,
  requested_time TEXT NOT NULL,
  concern TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  otp_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NEW',
  internal_notes TEXT NOT NULL DEFAULT '',
  ip_address TEXT,
  user_agent TEXT,
  schedule_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  rating INTEGER,
  message TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 0,
  public_consent INTEGER NOT NULL DEFAULT 0,
  publication_name TEXT NOT NULL DEFAULT 'anonymous',
  otp_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  is_visible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS department_timings (
  id TEXT PRIMARY KEY,
  department_slug TEXT NOT NULL UNIQUE,
  department_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  days TEXT NOT NULL DEFAULT 'Mon-Sat',
  slot_gap_minutes INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  is_visible INTEGER NOT NULL DEFAULT 1,
  proposed_by TEXT,
  approved_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctor_profiles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  speciality TEXT NOT NULL,
  qualification TEXT,
  department_slug TEXT NOT NULL,
  photo_url TEXT,
  profile_note TEXT NOT NULL DEFAULT '',
  consent_status TEXT NOT NULL DEFAULT 'APPROVED_SOURCE',
  status TEXT NOT NULL DEFAULT 'APPROVED',
  is_visible INTEGER NOT NULL DEFAULT 1,
  proposed_by TEXT,
  approved_by TEXT,
  blocked_dates TEXT DEFAULT '',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_revisions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  proposed_by TEXT NOT NULL,
  reviewed_by TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  is_visible INTEGER NOT NULL DEFAULT 0,
  source_note TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  reviewer TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS career_jobs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department TEXT,
  employment_type TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  is_visible INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patient_videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  consent_note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  is_visible INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  purpose TEXT NOT NULL DEFAULT 'admin-upload',
  uploaded_by TEXT NOT NULL,
  consent_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'APPROVED',
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT NOT NULL DEFAULT '',
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  identifier TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS idempotent_requests (
  id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  response_body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_email_otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  meta_json TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS department_closures (
  id TEXT PRIMARY KEY,
  department_slug TEXT NOT NULL,
  closed_date TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(department_slug, closed_date)
);

CREATE TABLE IF NOT EXISTS site_analytics (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  path TEXT NOT NULL,
  session_hash TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_webhooks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  event_trigger TEXT NOT NULL,
  secret TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS appointments_status_created_idx ON appointments(status, created_at);
CREATE INDEX IF NOT EXISTS revisions_status_idx ON content_revisions(status, created_at);
CREATE INDEX IF NOT EXISTS doctors_department_idx ON doctor_profiles(department_slug, is_visible);
CREATE UNIQUE INDEX IF NOT EXISTS rate_limits_action_identifier_idx ON rate_limits(action, identifier);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users(email);
CREATE INDEX IF NOT EXISTS sessions_id_idx ON sessions(id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot ON appointments(department_slug, requested_date, requested_time, phone) WHERE status != 'CANCELLED';
CREATE INDEX IF NOT EXISTS admin_email_otps_email_idx ON admin_email_otps(email);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON site_analytics(event_type);
