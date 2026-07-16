import { env } from "cloudflare:workers";
import {
  audit,
  checkRateLimit,
  createAdminSession,
  ensureSuperAdminBootstrap,
  getClientIp,
  hashPassword,
  json,
  run,
  setAdminCookie,
  query,
  verifyPasswordWithUpgrade,
} from "@/app/lib/server";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    const ipLimit = await checkRateLimit("admin-login-ip", ip, 8, 15 * 60);
    const emailLimit = await checkRateLimit("admin-login-email", email || "blank", 6, 15 * 60);
    if (!ipLimit.ok || !emailLimit.ok) {
      return json({ error: "Too many login attempts. Please wait and try again." }, { status: 429 });
    }

    if (process.env.NODE_ENV === "production" && !(env.ADMIN_SESSION_SECRET || env.AUTH_SECRET)) {
      return json({ error: "Admin session secret is not configured." }, { status: 503 });
    }

    // Re-evaluate the bootstrap against live D1 state on every login attempt.
    // Warm isolates skip the getD1() init block, so relying on the module-level
    // status captured at cold start hides external changes (e.g. a super admin
    // row deleted or deactivated via the D1 console). This is rate limited above.
    const bootstrap = await ensureSuperAdminBootstrap();
    if (!bootstrap.ok) {
      return json({ error: "Admin configuration requires review." }, { status: 503 });
    }

    const rows = await query<{
      email: string;
      role: "SUPER_ADMIN" | "STAFF";
      password_hash: string;
      is_active: number;
      must_change_password: number;
    }>(
      `SELECT email, role, password_hash, is_active, must_change_password
       FROM admin_users WHERE lower(email) = lower(?) LIMIT 1`,
      email
    );
    const account = rows.results?.[0];

    const verification = account
      ? await verifyPasswordWithUpgrade(password, account.password_hash)
      : { valid: false, needsRehash: false };

    if (!account) {
      await audit(email || "unknown", "ADMIN_LOGIN_FAILED", "Admin", email, `Failed login from ${ip} - Email not found`);
      return json({ error: "Admin account not found." }, { status: 404 });
    }

    if (account.is_active !== 1) {
      await audit(email, "ADMIN_LOGIN_FAILED", "Admin", email, `Failed login from ${ip} - Account deactivated`);
      return json({ error: "This admin account has been deactivated." }, { status: 403 });
    }

    if (!verification.valid) {
      await audit(email, "ADMIN_LOGIN_FAILED", "Admin", email, `Failed login from ${ip} - Incorrect password`);
      return json({ error: "Incorrect password." }, { status: 401 });
    }

    if (verification.needsRehash) {
      await run(
        "UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = lower(?)",
        await hashPassword(password),
        account.email,
      );
    }

    const session = await createAdminSession(account.email, account.role);
    await setAdminCookie(session.token);
    await audit(account.email, "ADMIN_LOGIN_SUCCESS", "Admin", account.email, `Role ${account.role}`);
    return json({
      success: true,
      role: account.role,
      csrf: session.csrf,
      passwordChangeRequired: account.must_change_password === 1,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("CRITICAL LOGIN EXCEPTION:", err);
    return json(
      { error: "An unexpected error occurred during sign in. Please try again later." },
      { status: 500 },
    );
  }
}
