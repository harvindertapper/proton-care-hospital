import { cookies, headers } from "next/headers";
import { env } from "cloudflare:workers";
import { departments, doctors, hospital, approvedTimingDepartments } from "./data";

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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  `CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    ip_address TEXT,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TEXT
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
  `CREATE INDEX IF NOT EXISTS otp_phone_purpose_idx ON otp_challenges(phone, purpose, status)`,
  `CREATE INDEX IF NOT EXISTS revisions_status_idx ON content_revisions(status, created_at)`,
  `CREATE INDEX IF NOT EXISTS doctors_department_idx ON doctor_profiles(department_slug, is_visible)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS rate_limits_action_identifier_idx ON rate_limits(action, identifier)`,
  `CREATE TABLE IF NOT EXISTS idempotent_requests (
    id TEXT PRIMARY KEY,
    payload_hash TEXT NOT NULL,
    response_body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
];

let initialized = false;

export async function getD1() {
  const db = env.DB as D1Database | undefined;
  if (!db) {
    throw new Error("D1 binding DB is not configured.");
  }

  if (!initialized) {
    await db.batch(tableStatements.map((statement) => db.prepare(statement)));
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
  const rows = await query<{ payload_hash: string; response_body: string }>(
    "SELECT payload_hash, response_body FROM idempotent_requests WHERE id = ? LIMIT 1",
    key,
  );
  const row = rows.results?.[0];
  if (!row) return null;
  if (row.payload_hash !== hash) {
    throw new Error("Idempotency signature mismatch: Request body does not match the original token.");
  }
  return JSON.parse(row.response_body) as Record<string, unknown>;
}

export async function saveIdempotency(key: string, body: Record<string, unknown>, response: Record<string, unknown>) {
  const hash = await sha256(JSON.stringify(body));
  const resStr = JSON.stringify(response);
  const now = Math.floor(Date.now() / 1000);
  await run(
    "INSERT OR REPLACE INTO idempotent_requests (id, payload_hash, response_body, created_at) VALUES (?, ?, ?, ?)",
    key,
    hash,
    resStr,
    now,
  );
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
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
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
  const secret = process.env.TURNSTILE_SECRET_KEY;
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

async function sha256(value: string) {
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
  const configured = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET;
  if (configured) return configured;
  const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (isDev) return "pch-local-preview-session-secret";
  throw new Error("ADMIN_SESSION_SECRET or AUTH_SECRET env secret is required in production.");
}

export async function hashOtp(code: string, phone: string) {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) {
    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    if (!isDev) {
      throw new Error("OTP_HASH_SECRET env secret is required in production.");
    }
    return sha256(`${phone}:${code}:pch-preview-otp-secret`);
  }
  return sha256(`${phone}:${code}:${secret}`);
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

export async function sendSms91Otp(phone: string, code: string) {
  const authKey = process.env.SMS91_AUTH_KEY || process.env.MSG91_AUTH_KEY;
  const templateId = process.env.SMS91_OTP_TEMPLATE_ID || process.env.MSG91_OTP_TEMPLATE_ID;
  const senderId = process.env.SMS91_SENDER_ID || process.env.MSG91_SENDER_ID;

  if (!authKey || !templateId) {
    return {
      ok: process.env.NODE_ENV !== "production",
      configured: false,
      launchBlocked: true,
      message: "SMS91 credentials/templates are not configured. OTP is stored for preview verification only.",
    };
  }

  const url = new URL("https://control.msg91.com/api/v5/otp");
  url.searchParams.set("template_id", templateId);
  url.searchParams.set("mobile", `91${phone}`);
  url.searchParams.set("otp", code);
  if (senderId) url.searchParams.set("sender", senderId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authkey: authKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({}),
  });

  return { ok: response.ok, configured: true, providerStatus: response.status };
}

export async function verifySms91Otp(phone: string, code: string) {
  const authKey = process.env.SMS91_AUTH_KEY || process.env.MSG91_AUTH_KEY;
  if (!authKey) return { ok: process.env.NODE_ENV !== "production", configured: false, launchBlocked: true };

  const url = new URL("https://control.msg91.com/api/v5/otp/verify");
  url.searchParams.set("mobile", `91${phone}`);
  url.searchParams.set("otp", code);

  const response = await fetch(url, { headers: { authkey: authKey } });
  const payload = (await response.json().catch(() => ({}))) as { type?: string };
  return { ok: response.ok && payload.type !== "error", configured: true };
}

export async function createOtpChallenge(purpose: string, phone: string, ip: string) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await run(
    "INSERT INTO otp_challenges (id, purpose, phone, code_hash, ip_address, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    purpose,
    phone,
    await hashOtp(code, phone),
    ip,
    expiresAt,
  );
  const delivery = await sendSms91Otp(phone, code);
  await audit("system", "OTP_SENT", "OtpChallenge", id, `${purpose} OTP requested for ${phone}; configured=${delivery.configured}`);
  return { id, code: (delivery.configured || process.env.NODE_ENV === "production") ? undefined : code, delivery };
}

export async function verifyStoredOtp(purpose: string, phone: string, code: string) {
  const rows = await query<{ id: string; code_hash: string; attempts: number; expires_at: number; status: string }>(
    "SELECT id, code_hash, attempts, expires_at, status FROM otp_challenges WHERE phone = ? AND purpose = ? AND status IN ('PENDING', 'VERIFIED') ORDER BY created_at DESC LIMIT 1",
    phone,
    purpose,
  );
  const challenge = rows.results?.[0];
  if (!challenge || challenge.expires_at < Date.now()) return { ok: false };

  const providerCheck = await verifySms91Otp(phone, code);
  const localOk = challenge.code_hash === (await hashOtp(code, phone));
  if (challenge.status === "VERIFIED" && localOk) {
    return { ok: true };
  }
  if (providerCheck.ok && localOk) {
    await run("UPDATE otp_challenges SET status = 'VERIFIED', verified_at = CURRENT_TIMESTAMP WHERE id = ?", challenge.id);
    return { ok: true };
  }

  await run("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?", challenge.id);
  return { ok: false };
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

export async function nextRequestId() {
  const year = new Date().getFullYear();
  const rows = await query<{ request_id: string }>(
    "SELECT request_id FROM appointments WHERE request_id LIKE ? ORDER BY request_id DESC LIMIT 1",
    `PCH-${year}-%`,
  );
  const lastId = rows.results?.[0]?.request_id;
  let next = 1;
  if (lastId) {
    const parts = lastId.split("-");
    const numPart = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(numPart)) {
      next = numPart + 1;
    }
  }
  return `PCH-${year}-${String(next).padStart(4, "0")}`;
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
  const csrf = crypto.randomUUID();
  const payload = JSON.stringify({ email, role, csrf, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
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
  if (!encoded || !signature || (await hmac(encoded, secret)) !== signature) return null;

  try {
    const payload = JSON.parse(atob(encoded)) as { email: string; role: "SUPER_ADMIN" | "STAFF"; csrf: string; exp: number };
    if (payload.exp < Date.now()) return null;
    return payload;
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
  cookieStore.delete(name);
}

export async function requireAdmin(requiredRole?: "SUPER_ADMIN") {
  const session = await verifyAdminSession();
  if (!session) return { ok: false as const, status: 401, error: "Admin login required." };
  if (requiredRole && session.role !== requiredRole) {
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
