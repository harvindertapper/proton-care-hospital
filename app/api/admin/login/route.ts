import {
  audit,
  checkRateLimit,
  createAdminSession,
  getClientIp,
  json,
  setAdminCookie,
} from "@/app/lib/server";

function adminAccounts() {
  const production = process.env.NODE_ENV === "production";
  const superEmail = process.env.ADMIN_SUPER_EMAIL || (!production ? "super@protonecarehospital.com" : "");
  const superPassword = process.env.ADMIN_SUPER_PASSWORD || (!production ? "ChangeMeSuper#2026" : "");
  const staffEmail = process.env.ADMIN_STAFF_EMAIL || (!production ? "staff@protonecarehospital.com" : "");
  const staffPassword = process.env.ADMIN_STAFF_PASSWORD || (!production ? "ChangeMeStaff#2026" : "");
  return [
    { email: superEmail.toLowerCase(), password: superPassword, role: "SUPER_ADMIN" as const },
    { email: staffEmail.toLowerCase(), password: staffPassword, role: "STAFF" as const },
  ].filter((account) => account.email && account.password);
}

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

  const account = adminAccounts().find((item) => item.email === email && item.password === password);
  if (!account) {
    await audit(email || "unknown", "ADMIN_LOGIN_FAILED", "Admin", email, `Failed login from ${ip}`);
    return json({ error: "Invalid admin credentials." }, { status: 401 });
  }

  const session = await createAdminSession(account.email, account.role);
  await setAdminCookie(session.token);
  await audit(account.email, "ADMIN_LOGIN_SUCCESS", "Admin", account.email, `Role ${account.role}`);
  return json({ success: true, role: account.role, csrf: session.csrf });
}
