import { cookies, headers } from "next/headers";
import { env } from "cloudflare:workers";
import { departments, doctors, hospital, approvedTimingDepartments } from "./data";
import {
  applySuperAdminBootstrap,
  hashAdminPassword,
  resolveAdminSessionAccess,
  verifyAdminPassword,
  type SuperAdminBootstrapResult,
} from "./adminAuth";

type D1Result<T = unknown> = { results?: T[]; success?: boolean };

const SESSION_COOKIE = "pch_admin_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const tableStatements = [
  `CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF',
    password_hash TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF',
    csrf TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
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
  )`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    patient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    rating INTEGER,
    message TEXT NOT NULL,
    consent INTEGER NOT NULL DEFAULT 0,
    otp_verified INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    is_visible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEW',
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS department_timings (
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
  )`,
  `CREATE TABLE IF NOT EXISTS doctor_profiles (
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
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS content_revisions (
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
  )`,
  `CREATE TABLE IF NOT EXISTS blog_posts (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    is_visible INTEGER NOT NULL DEFAULT 0,
    source_note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS career_jobs (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    department TEXT,
    employment_type TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    is_visible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS patient_videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    consent_note TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    is_visible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS media_assets (
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
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_email TEXT NOT NULL DEFAULT 'system',
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '',
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    identifier TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS appointments_status_created_idx ON appointments(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS revisions_status_idx ON content_revisions(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS doctors_department_idx ON doctor_profiles(department_slug, is_visible)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rate_limits_action_identifier_idx ON rate_limits(action, identifier)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users(email)`,
  `CREATE INDEX IF NOT EXISTS sessions_id_idx ON sessions(id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot ON appointments(department_slug, requested_date, requested_time, phone) WHERE status != 'CANCELLED'`,
  `CREATE TABLE IF NOT EXISTS idempotent_requests (
    id TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    response_body TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_email_otps (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    meta_json TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS admin_email_otps_email_idx ON admin_email_otps(email)`,
  `CREATE TABLE IF NOT EXISTS department_closures (
    id TEXT PRIMARY KEY,
    department_slug TEXT NOT NULL,
    closed_date TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department_slug, closed_date)
  )`,
  `CREATE TABLE IF NOT EXISTS site_analytics (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    path TEXT NOT NULL,
    session_hash TEXT,
    user_agent TEXT,
    ip_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_event ON site_analytics(event_type)`,
  `CREATE TABLE IF NOT EXISTS admin_webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    event_trigger TEXT NOT NULL,
    secret TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS site_configs (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

let initialized = false;

const adminUserMigrationStatements = [
  "ALTER TABLE admin_users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE admin_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE doctor_profiles ADD COLUMN blocked_dates TEXT DEFAULT ''",
  "CREATE TABLE IF NOT EXISTS department_closures (id TEXT PRIMARY KEY, department_slug TEXT NOT NULL, closed_date TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(department_slug, closed_date))",
  "CREATE TABLE IF NOT EXISTS site_analytics (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, path TEXT NOT NULL, session_hash TEXT, user_agent TEXT, ip_hash TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE INDEX IF NOT EXISTS idx_analytics_event ON site_analytics(event_type)",
  "CREATE TABLE IF NOT EXISTS admin_webhooks (id TEXT PRIMARY KEY, url TEXT NOT NULL, event_trigger TEXT NOT NULL, secret TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS site_configs (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  // Safe migration for existing D1 databases that predate the expires_at column.
  "ALTER TABLE idempotent_requests ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0",
];

export async function getD1() {
  const db = env.DB as D1Database | undefined;
  if (!db) {
    throw new Error("D1 binding DB is not configured.");
  }

  if (!initialized) {
    await db.batch(tableStatements.map((statement) => db.prepare(statement)));
    for (const statement of adminUserMigrationStatements) {
      try {
        await db.prepare(statement).run();
      } catch {
        // Existing databases already have the column after the first successful migration.
      }
    }
    try {
      await db.prepare("SELECT schedule_version FROM appointments LIMIT 1").all();
    } catch {
      try {
        await db.prepare("ALTER TABLE appointments ADD COLUMN schedule_version INTEGER NOT NULL DEFAULT 1").run();
      } catch {}
    }
    try {
      await db.prepare("SELECT status FROM media_assets LIMIT 1").all();
    } catch {
      try {
        await db.prepare("ALTER TABLE media_assets ADD COLUMN status TEXT NOT NULL DEFAULT 'APPROVED'").run();
        await db.prepare("ALTER TABLE media_assets ADD COLUMN is_visible INTEGER NOT NULL DEFAULT 1").run();
      } catch {}
    }
    await seedDepartmentTimings(db);
    await seedDoctorProfiles(db);
    await seedAdminUsers(db);
    initialized = true;
  }

  return db;
}

async function seedDepartmentTimings(db: D1Database) {
  const rows = approvedTimingDepartments();
  if (!rows.length) return;

  await db.batch(
    rows.map((department) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO department_timings
          (id, department_slug, department_name, start_time, end_time, days, slot_gap_minutes, status, is_visible, approved_by)
          VALUES (?, ?, ?, ?, ?, ?, 15, 'APPROVED', 1, 'source-spec')`,
        )
        .bind(
          `timing-${department.slug}`,
          department.slug,
          department.name,
          department.timing?.start,
          department.timing?.end,
          department.timing?.days || "Mon-Sat",
        ),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  return hashAdminPassword(password);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return (await verifyAdminPassword(password, storedHash)).valid;
}

export async function verifyPasswordWithUpgrade(password: string, storedHash: string) {
  return verifyAdminPassword(password, storedHash);
}

async function seedAdminUsers(db: D1Database) {
  await applySuperAdminBootstrap(superAdminBootstrapStore(db), env as unknown as Record<string, string | undefined>);
}

/**
 * Re-evaluates the super admin bootstrap against the *current* D1 state.
 *
 * Worker isolates stay warm across requests, so any module-level flag (like
 * `initialized` above) can hide external data changes — e.g. an admin_users
 * row deleted via the D1 console never triggers a re-seed in a warm isolate.
 * Login calls this directly so the decision is always made from a fresh D1
 * read instead of stale isolate memory. The underlying decision logic is
 * idempotent: when an active super admin already exists it resolves to
 * "preserved" after a single SELECT, so per-login cost is one indexed query.
 */
export async function ensureSuperAdminBootstrap(): Promise<SuperAdminBootstrapResult> {
  const db = await getD1();
  return applySuperAdminBootstrap(superAdminBootstrapStore(db), env as unknown as Record<string, string | undefined>);
}

function superAdminBootstrapStore(db: D1Database) {
  return {
      async listAccounts() {
        const rows = await db
          .prepare("SELECT id, email, role, is_active FROM admin_users ORDER BY created_at")
          .all<{ id: string; email: string; role: "SUPER_ADMIN" | "STAFF"; is_active: number }>();
        return (rows.results || []).map((account) => ({
          id: account.id,
          email: account.email,
          role: account.role,
          isActive: account.is_active === 1,
        }));
      },
      async createSuperAdmin(input) {
        await db
          .prepare(
            `INSERT INTO admin_users
              (id, email, name, role, password_hash, is_active, must_change_password)
             VALUES (?, ?, 'Super Admin', 'SUPER_ADMIN', ?, 1, 0)`,
          )
          .bind(crypto.randomUUID(), input.email, input.passwordHash)
          .run();
      },
      async migrateLegacySuperAdmin(input) {
        await db
          .prepare(
            `UPDATE admin_users
             SET email = ?, name = 'Super Admin', role = 'SUPER_ADMIN', password_hash = ?,
                 is_active = 1, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(input.email, input.passwordHash, input.id)
          .run();
      },
      async reactivateSuperAdmin(input) {
        await db
          .prepare(
            `UPDATE admin_users
             SET password_hash = ?, is_active = 1, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(input.passwordHash, input.id)
          .run();
      },
      async deactivateAccounts(ids) {
        if (ids.length === 0) return;
        await db.batch(
          ids.map((id) =>
            db
              .prepare("UPDATE admin_users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .bind(id),
          ),
        );
      },
      async revokeSessionsForEmails(emails) {
        if (emails.length === 0) return;
        await db.batch(
          emails.map((email) =>
            db.prepare("UPDATE sessions SET revoked = 1 WHERE lower(email) = lower(?)").bind(email),
          ),
        );
      },
      async recordAudit(event) {
        await db
          .prepare(
            `INSERT INTO audit_logs
              (id, actor_email, action, entity_type, entity_id, details)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            event.actorEmail,
            event.action,
            event.entityType,
            event.entityId,
            event.details,
          )
          .run();
      },
  } satisfies Parameters<typeof applySuperAdminBootstrap>[0];
}

async function seedDoctorProfiles(db: D1Database) {
  if (!doctors.length) return;

  await db.batch(
    doctors.map((doctor) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO doctor_profiles
          (id, slug, name, speciality, qualification, department_slug, photo_url, profile_note, consent_status, status, is_visible, approved_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, '', 'APPROVED_SOURCE', 'APPROVED', 1, 'source-spec')`,
        )
        .bind(
          `doctor-${doctor.slug}`,
          doctor.slug,
          doctor.name,
          doctor.speciality,
          doctor.qualification || "",
          doctor.departmentSlug,
          doctor.photo || "",
        ),
    ),
  );
}

async function retryOnLock<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      const msg = error instanceof Error ? error.message : String(error);
      const isLocked = msg.includes("locked") || msg.includes("BUSY") || msg.includes("busy");
      if (isLocked && attempt <= retries) {
        const delay = 200 + Math.random() * 300;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

export async function query<T = Record<string, unknown>>(statement: string, ...binds: unknown[]) {
  const db = await getD1();
  return retryOnLock(() => db.prepare(statement).bind(...binds).all<T>() as Promise<D1Result<T>>);
}

export async function run(statement: string, ...binds: unknown[]) {
  const db = await getD1();
  return retryOnLock(() => db.prepare(statement).bind(...binds).run());
}

export async function checkIdempotency(key: string, body: Record<string, unknown>) {
  const hash = await sha256(JSON.stringify(body));
  const now = Math.floor(Date.now() / 1000);
  const rows = await query<{ payload_hash: string; response_body: string }>(
    "SELECT payload_hash, response_body FROM idempotent_requests WHERE id = ? AND expires_at > ? LIMIT 1",
    key,
    now,
  );
  const row = rows.results?.[0];
  if (!row) return null;
  if (row.payload_hash !== hash) {
    throw new Error("Idempotency signature mismatch: Request body does not match the original token.");
  }
  return JSON.parse(row.response_body) as Record<string, unknown>;
}

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export async function saveIdempotency(key: string, body: Record<string, unknown>, response: Record<string, unknown>) {
  const hash = await sha256(JSON.stringify(body));
  const resStr = JSON.stringify(response);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + IDEMPOTENCY_TTL_SECONDS;
  await run(
    "INSERT OR REPLACE INTO idempotent_requests (id, payload_hash, response_body, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    key,
    hash,
    resStr,
    now,
    expiresAt,
  );
}

let lastIdempotencyCleanup = 0;

export async function cleanupExpiredIdempotency() {
  // Run at most once every 10 minutes per isolate to bound D1 write volume.
  const now = Math.floor(Date.now() / 1000);
  if (now - lastIdempotencyCleanup < 10 * 60) return;
  lastIdempotencyCleanup = now;
  try {
    await run("DELETE FROM idempotent_requests WHERE expires_at <= ?", now);
  } catch (err) {
    console.error("Failed to clean up expired idempotency records:", err);
  }
}

export function getR2() {
  return env.MEDIA as R2Bucket | undefined;
}

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers || {}),
    },
  });
}

export function getClientIp(request: Request) {
  // CF-Connecting-IP is set by the Cloudflare network edge and cannot be
  // spoofed by the client. Always prefer it over client-supplied headers.
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  // Fallback for local dev / non-Cloudflare deployments only.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "127.0.0.1";
  return request.headers.get("x-real-ip")?.trim() || "127.0.0.1";
}

export async function checkRateLimit(action: string, identifier: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const id = `${action}:${identifier}`;
  const resetAt = now + windowSeconds * 1000;

  await run(
    `INSERT INTO rate_limits (id, action, identifier, count, reset_at, updated_at)
     VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END,
       updated_at = CURRENT_TIMESTAMP`,
    id,
    action,
    identifier,
    resetAt,
    now,
    now,
    resetAt,
  );

  const current = await query<{ count: number; reset_at: number }>(
    "SELECT count, reset_at FROM rate_limits WHERE id = ?",
    id,
  );
  const row = current.results?.[0];
  const count = row?.count || 1;
  const rowResetAt = row?.reset_at || resetAt;

  if (count > limit) {
    await audit("system", "RATE_LIMIT_DENIED", action, identifier, `Denied ${action} for ${identifier}`);
    return { ok: false, retryAfterMs: rowResetAt - now };
  }

  return { ok: true, remaining: Math.max(limit - count, 0) };
}

export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: process.env.NODE_ENV !== "production", configured: false, launchBlocked: true };
  }
  if (!token) return { ok: false, configured: true };

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  body.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const result = (await response.json()) as { success?: boolean };
  return { ok: Boolean(result.success), configured: true };
}

export async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sessionSecret() {
  const configured = env.ADMIN_SESSION_SECRET || env.AUTH_SECRET;
  if (configured) return configured;
  const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (isDev) return "pch-local-preview-session-secret";
  throw new Error("ADMIN_SESSION_SECRET or AUTH_SECRET env secret is required in production.");
}



export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits;
}

export function validatePhone(phone: string) {
  return /^[6-9]\d{9}$/.test(normalizePhone(phone));
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}





export async function audit(actorEmail: string, action: string, entityType?: string, entityId?: string, details = "") {
  await run(
    "INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    actorEmail,
    action,
    entityType || null,
    entityId || null,
    details,
  );
}

export async function nextRequestId(): Promise<string> {
  const year = new Date().getFullYear();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  const suffix = Array.from(array)
    .map((b) => chars[b % chars.length])
    .join("");
  const id = `PCH-${year}-${suffix}`;
  
  // Check if it already exists (preventing collision)
  const rows = await query("SELECT 1 FROM appointments WHERE request_id = ? LIMIT 1", id);
  if (rows.results && rows.results.length > 0) {
    return nextRequestId();
  }
  return id;
}

export function getDepartment(slug: string) {
  return departments.find((department) => department.slug === slug);
}

export function getDoctor(slug: string) {
  return doctors.find((doctor) => doctor.slug === slug);
}

export function parseYouTubeId(value: string) {
  const trimmed = value.trim();
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return /^[a-zA-Z0-9_-]{8,}$/.test(trimmed) ? trimmed : "";
}

export async function createAdminSession(email: string, role: "SUPER_ADMIN" | "STAFF") {
  const secret = sessionSecret();
  if (!secret) throw new Error("Admin session secret is not configured.");
  const sessionId = crypto.randomUUID();
  const csrf = crypto.randomUUID();
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

  // Prune expired sessions to keep the table from growing unbounded.
  await run("DELETE FROM sessions WHERE expires_at < ?", Date.now()).catch(() => {});

  await run(
    "INSERT INTO sessions (id, email, role, csrf, expires_at) VALUES (?, ?, ?, ?, ?)",
    sessionId, email, role, csrf, exp
  );
  
  const payload = JSON.stringify({ sessionId });
  const encoded = btoa(payload);
  return { token: `${encoded}.${await hmac(encoded, secret)}`, csrf };
}

export async function verifyAdminSession() {
  const secret = sessionSecret();
  if (!secret) return null;
  const cookieStore = await cookies();
  const name = process.env.NODE_ENV === "production" ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
  const token = cookieStore.get(name)?.value;
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  
  const signatureBytes = new Uint8Array(signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
  const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(encoded));
  if (!isValid) return null;

  try {
    const payload = JSON.parse(atob(encoded)) as { sessionId: string };
    const rows = await query<{
      email: string;
      role: "SUPER_ADMIN" | "STAFF";
      csrf: string;
      expires_at: number;
      revoked: number;
      is_active: number;
      must_change_password: number;
    }>(
      `SELECT s.email, u.role, s.csrf, s.expires_at, s.revoked,
              u.is_active, u.must_change_password
       FROM sessions s
       INNER JOIN admin_users u ON lower(u.email) = lower(s.email)
       WHERE s.id = ?
       LIMIT 1`,
      payload.sessionId
    );
    const session = rows.results?.[0];
    if (!session || session.revoked || session.expires_at < Date.now()) return null;
    const access = resolveAdminSessionAccess({
      role: session.role,
      isActive: session.is_active === 1,
      mustChangePassword: session.must_change_password === 1,
    });
    if (!access.allowed) return null;
    return {
      email: session.email,
      role: access.role,
      csrf: session.csrf,
      sessionId: payload.sessionId,
      mustChangePassword: access.mustChangePassword,
    };
  } catch {
    return null;
  }
}

export function verifyCsrf(request: Request, session: { csrf?: string }) {
  const token = request.headers.get("x-csrf-token");
  return Boolean(session.csrf && token && token === session.csrf);
}

export async function setAdminCookie(token: string) {
  const cookieStore = await cookies();
  const name = process.env.NODE_ENV === "production" ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
  cookieStore.set(name, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  const name = process.env.NODE_ENV === "production" ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
  const token = cookieStore.get(name)?.value;
  cookieStore.delete(name);
  if (token) {
    try {
      const [encoded] = token.split(".");
      if (encoded) {
        const payload = JSON.parse(atob(encoded)) as { sessionId: string };
        await run("UPDATE sessions SET revoked = 1 WHERE id = ?", payload.sessionId);
      }
    } catch {}
  }
}

export async function requireAdmin(requirement: {
  role?: "SUPER_ADMIN";
  allowPasswordChangeRequired?: boolean;
} = {}) {
  const session = await verifyAdminSession();
  if (!session) return { ok: false as const, status: 401, error: "Admin login required." };
  if (session.mustChangePassword && !requirement.allowPasswordChangeRequired) {
    return {
      ok: false as const,
      status: 403,
      code: "PASSWORD_CHANGE_REQUIRED" as const,
      error: "Password change required before continuing.",
    };
  }
  if (requirement.role && session.role !== requirement.role) {
    return { ok: false as const, status: 403, error: "Super admin approval is required for this action." };
  }
  return { ok: true as const, session };
}

export async function submittedByHeader() {
  const requestHeaders = await headers();
  return requestHeaders.get("user-agent") || "unknown";
}

export function isHoneypotTriggered(input: Record<string, unknown>) {
  return typeof input.company === "string" && input.company.trim().length > 0;
}

export function slotSettingsLaunchNote() {
  return `Department OPD schedules and available appointment slots can be updated in the administration panel. Requests remain manual-confirmation only; ${hospital.name} confirms final availability.`;
}
