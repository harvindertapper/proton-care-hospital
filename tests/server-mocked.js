const mockDbState = {
  rateLimits: {},
  appointments: [],
  sessions: [],
  adminUsers: [],
  audits: [],
  revokedEmails: [],
  verifiedTokens: new Set(),
};

export function resetMockDb() {
  mockDbState.rateLimits = {};
  mockDbState.appointments = [];
  mockDbState.sessions = [];
  mockDbState.adminUsers = [];
  mockDbState.audits = [];
  mockDbState.revokedEmails = [];
  mockDbState.verifiedTokens.clear();
}

export async function query(statement, ...binds) {
  if (binds.length === 1 && Array.isArray(binds[0])) binds = binds[0];
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
  if (statement.includes("SELECT id FROM admin_users WHERE lower(email)")) {
    const email = String(binds[0] || "").toLowerCase();
    return { results: mockDbState.adminUsers.filter((user) => user.email.toLowerCase() === email).map(({ id }) => ({ id })) };
  }
  if (statement.includes("SELECT email, role, is_active FROM admin_users WHERE id")) {
    return { results: mockDbState.adminUsers.filter((user) => user.id === binds[0]) };
  }
  if (statement.includes("FROM admin_users WHERE role = 'STAFF'")) {
    return { results: mockDbState.adminUsers.filter((user) => user.role === "STAFF") };
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
  if (statement.includes("INSERT INTO admin_users")) {
    mockDbState.adminUsers.push({
      id: binds[0],
      email: binds[1],
      name: binds[2],
      role: "STAFF",
      password_hash: binds[3],
      is_active: 1,
      must_change_password: 1,
    });
    return { success: true };
  }
  if (statement.includes("UPDATE admin_users SET is_active")) {
    const user = mockDbState.adminUsers.find((item) => item.id === binds[1]);
    if (user) user.is_active = binds[0];
    return { success: true };
  }
  if (statement.includes("UPDATE sessions SET revoked = 1 WHERE lower(email)")) {
    mockDbState.revokedEmails.push(binds[0]);
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
  const res = await query("SELECT count, reset_at FROM rate_limits WHERE id = ?", id);
  const row = res.results[0];
  if (row.count > limit) {
    return { ok: false, retryAfterMs: row.reset_at - Date.now() };
  }
  return { ok: true, remaining: limit - row.count };
}
export class MutationNotFoundError extends Error {
  constructor(entityLabel) {
    super(`${entityLabel} was not found.`);
    this.name = "MutationNotFoundError";
  }
}

export function requireAppliedMutation(result, entityExists, entityLabel) {
  if (!entityExists || Number(result.meta?.changes || 0) < 1) {
    throw new MutationNotFoundError(entityLabel);
  }
  return { outcome: "APPLIED" };
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

export async function requireAdmin(requirement = {}) {
  if (mockAdminSessionVal.ok && requirement.role && mockAdminSessionVal.session.role !== requirement.role) {
    return { ok: false, status: 403, error: "Super admin approval is required for this action." };
  }
  return mockAdminSessionVal;
}

export function getMockAdminState() {
  return structuredClone({
    adminUsers: mockDbState.adminUsers,
    audits: mockDbState.audits,
    revokedEmails: mockDbState.revokedEmails,
  });
}

export function verifyCsrf(request, session) {
  const token = request.headers.get("x-csrf-token");
  return Boolean(session.csrf && token && token === session.csrf);
}

export function addMockAppointment(app) {
  mockDbState.appointments.push(app);
}


export async function audit(actorEmail, action, entityType, entityId, details = "") {
  mockDbState.audits.push({ actorEmail, action, entityType, entityId, details });
}

export function parseYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/);
  return match ? match[1] : null;
}

export async function hashPassword(pwd) {
  return `hashed-${pwd}`;
}

export async function nextRequestId() {
  return "PCH-MOCK-0001";
}
