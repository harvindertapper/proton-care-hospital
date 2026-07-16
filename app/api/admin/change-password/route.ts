import {
  audit,
  checkRateLimit,
  getClientIp,
  json,
  query,
  run,
  requireAdmin,
  verifyCsrf,
  hashPassword,
  verifyPassword
} from "@/app/lib/server";
import { validateAdminPassword } from "@/app/lib/adminAuth";

export async function POST(request: Request) {
  const admin = await requireAdmin({ allowPasswordChangeRequired: true });
  if (!admin.ok) return json({ error: admin.error }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });

  const ip = getClientIp(request);
  const limit = await checkRateLimit(
    "admin-password-change",
    `${admin.session.email}:${ip}`,
    5,
    15 * 60,
  );
  if (!limit.ok) {
    return json({ error: "Too many password-change attempts. Please wait and try again." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    oldPassword?: string;
    newPassword?: string;
    otp?: string;
  };
  const oldPassword = body.oldPassword || "";
  const newPassword = body.newPassword || "";
  const otpInput = (body.otp || "").trim();

  if (!otpInput) {
    return json({ error: "Verification code is required." }, { status: 400 });
  }

  const policy = validateAdminPassword(newPassword, oldPassword);
  if (!policy.ok) {
    return json({ error: policy.error }, { status: 400 });
  }

  const rows = await query<{ email: string; password_hash: string }>(
    "SELECT email, password_hash FROM admin_users WHERE email = ? LIMIT 1",
    admin.session.email
  );
  const account = rows.results?.[0];

  if (!account || !(await verifyPassword(oldPassword, account.password_hash))) {
    await audit(admin.session.email, "ADMIN_PASSWORD_CHANGE_FAILED", "Admin", admin.session.email, "Incorrect old password");
    return json({ error: "Incorrect current password." }, { status: 401 });
  }

  // Verify OTP
  const msgBuffer = new TextEncoder().encode(otpInput);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const otpHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const otpRes = await query<{
    id: string;
    otp_hash: string;
    attempts: number;
    expires_at: number;
  }>(
    `SELECT id, otp_hash, attempts, expires_at 
     FROM admin_email_otps 
     WHERE lower(email) = lower(?) AND purpose = 'change_password'
     ORDER BY created_at DESC LIMIT 1`,
    admin.session.email
  );
  const challenge = otpRes.results?.[0];

  if (!challenge) {
    return json({ error: "No active verification code request found. Please request a new code." }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (challenge.expires_at < now) {
    await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);
    return json({ error: "Verification code has expired. Please request a new one." }, { status: 400 });
  }

  if (challenge.attempts >= 3) {
    await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);
    return json({ error: "Too many incorrect attempts. Please request a new code." }, { status: 400 });
  }

  if (otpHash !== challenge.otp_hash) {
    await run("UPDATE admin_email_otps SET attempts = attempts + 1 WHERE id = ?", challenge.id);
    return json({ error: "Invalid verification code." }, { status: 400 });
  }

  // Verification successful, delete challenge
  await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);

  const newHash = await hashPassword(newPassword);

  try {
    await run(
      `UPDATE admin_users
       SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
       WHERE lower(email) = lower(?)`,
      newHash,
      admin.session.email,
    );
    await run("UPDATE sessions SET revoked = 1 WHERE email = ?", admin.session.email);
    await audit(admin.session.email, "ADMIN_PASSWORD_CHANGED", "Admin", admin.session.email, "Password changed and sessions revoked");
    return json({ success: true, loginRequired: true });
  } catch (error) {
    console.error("Change password error:", error);
    return json({ error: "Failed to update password." }, { status: 500 });
  }
}
