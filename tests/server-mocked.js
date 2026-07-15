import { departments, doctors, hospital } from "../app/lib/data.ts";

const mockDbState = {
  rateLimits: {},
  appointments: [],
  sessions: [],
  verifiedTokens: new Set(),
};

export function resetMockDb() {
  mockDbState.rateLimits = {};
  mockDbState.appointments = [];
  mockDbState.sessions = [];
  mockDbState.verifiedTokens.clear();
}

export async function query(statement, binds = []) {
  if (statement.includes("SELECT status, department_name, requested_date, requested_time, created_at, phone FROM appointments")) {
    const requestId = binds[0];
    const results = mockDbState.appointments.filter(a => a.request_id === requestId);
    return { results };
  }
  if (statement.includes("SELECT * FROM appointments")) {
    return { results: mockDbState.appointments };
  }
  if (statement.includes("SELECT count, reset_at FROM rate_limits")) {
    const id = binds[0];
    const record = mockDbState.rateLimits[id] || { count: 0, reset_at: Date.now() + 10000 };
    return { results: [record] };
  }
  if (statement.includes("SELECT signature FROM verified_tokens")) {
    const sig = binds[0];
    const results = mockDbState.verifiedTokens.has(sig) ? [{ signature: sig }] : [];
    return { results };
  }
  return { results: [] };
}

export async function run(statement, ...binds) {
  if (statement.includes("INSERT INTO rate_limits") || statement.includes("ON CONFLICT(id) DO UPDATE")) {
    const id = binds[0];
    const now = Date.now();
    if (!mockDbState.rateLimits[id]) {
      mockDbState.rateLimits[id] = { count: 1, reset_at: now + 600 * 1000 };
    } else {
      const record = mockDbState.rateLimits[id];
      if (now >= record.reset_at) {
        record.count = 1;
        record.reset_at = now + 600 * 1000;
      } else {
        record.count++;
      }
    }
    return { success: true };
  }
  if (statement.includes("INSERT OR IGNORE INTO verified_tokens")) {
    const sig = binds[0];
    mockDbState.verifiedTokens.add(sig);
    return { success: true };
  }
  return { success: true };
}

export function getClientIp(request) {
  return request.headers.get("x-forwarded-for") || "127.0.0.1";
}

export async function checkRateLimit(action, identifier, limit, windowSeconds) {
  const id = `${action}:${identifier}`;
  await run("INSERT INTO rate_limits", id, action, identifier, windowSeconds);
  const res = await query("SELECT count, reset_at FROM rate_limits WHERE id = ?", [id]);
  const row = res.results[0];
  if (row.count > limit) {
    return { ok: false, retryAfterMs: row.reset_at - Date.now() };
  }
  return { ok: true, remaining: limit - row.count };
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
    status: init?.status || 200,
  });
}

let mockAdminSessionVal = { ok: true, session: { email: "staff@protoncare.in", role: "STAFF" } };

export function setMockAdminSession(session) {
  mockAdminSessionVal = session;
}

export async function requireAdmin() {
  return mockAdminSessionVal;
}

export function verifyCsrf(request, session) {
  const token = request.headers.get("x-csrf-token");
  return Boolean(session.csrf && token && token === session.csrf);
}

export function addMockAppointment(app) {
  mockDbState.appointments.push(app);
}

export async function verifyFirebaseToken(token, phoneToVerify) {
  if (token === "valid-token") {
    return { ok: true, phone: phoneToVerify };
  }
  return { ok: false };
}

export async function audit() {
  return;
}

export function parseYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
  return match ? match[1] : null;
}

export async function hashPassword(pwd) {
  return `hashed-${pwd}`;
}
