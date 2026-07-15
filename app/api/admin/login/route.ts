import {
  audit,
  checkRateLimit,
  createAdminSession,
  getClientIp,
  json,
  setAdminCookie,
  query,
  verifyPassword
} from "@/app/lib/server";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  const ipLimit = await checkRateLimit("admin-login-ip", ip, 8, 15 * 60);
  const emailLimit = await checkRateLimit("admin-login-email", email || "blank", 6, 15 * 60);
  if (!ipLimit.ok || !emailLimit.ok) {
    return json({ error: "Too many login attempts. Please wait and try again." }, { status: 429 });
  }

  if (process.env.NODE_ENV === "production" && !(process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET)) {
    return json({ error: "Admin session secret is not configured." }, { status: 503 });
  }

  const rows = await query<{ email: string; role: "SUPER_ADMIN" | "STAFF"; password_hash: string }>(
    "SELECT email, role, password_hash FROM admin_users WHERE email = ? LIMIT 1",
    email
  );
  const account = rows.results?.[0];

  if (!account || !(await verifyPassword(password, account.password_hash))) {
    await audit(email || "unknown", "ADMIN_LOGIN_FAILED", "Admin", email, `Failed login from ${ip}`);
    return json({ error: "Invalid admin credentials." }, { status: 401 });
  }

  const session = await createAdminSession(account.email, account.role);
  await setAdminCookie(session.token);
  await audit(account.email, "ADMIN_LOGIN_SUCCESS", "Admin", account.email, `Role ${account.role}`);
  return json({ success: true, role: account.role, csrf: session.csrf });
}
