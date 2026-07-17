import {
  audit,
  checkRateLimit,
  getClientIp,
  hashPassword,
  json,
  query,
  run,
} from "@/app/lib/server";
import { sendEmail, getOtpEmailTemplate } from "@/app/lib/resend";
import { hashOtp } from "@/app/lib/utils";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    email?: string;
    otp?: string;
    newPassword?: string;
  };

  const action = body.action || "";
  const email = (body.email || "").trim().toLowerCase();

  if (!email) {
    return json({ error: "Email address is required." }, { status: 400 });
  }

  // Rate limit check
  const ipLimit = await checkRateLimit("forgot-password-ip", ip, 5, 15 * 60);
  const emailLimit = await checkRateLimit("forgot-password-email", email, 5, 15 * 60);
  if (!ipLimit.ok || !emailLimit.ok) {
    return json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  if (action === "request") {
    // Look up the account without disclosing its existence or state.
    const userRes = await query(
      "SELECT id, is_active FROM admin_users WHERE lower(email) = lower(?) LIMIT 1",
      email
    );
    const user = userRes.results?.[0];

    // Always return a generic, identical response to prevent account enumeration.
    const genericResponse = json({
      success: true,
      message: "If an admin account exists for that email, a verification code has been sent.",
    });

    if (!user || user.is_active !== 1) {
      return genericResponse;
    }

    // 2. Generate 6-digit OTP using a cryptographically secure source.
    const otpArray = new Uint32Array(1);
    crypto.getRandomValues(otpArray);
    const otp = String(otpArray[0] % 1_000_000).padStart(6, "0");
    const otpHash = await hashOtp(otp);
    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60; // 10 minutes from now

    // 3. Save OTP challenge to DB
    await run(
      `INSERT OR REPLACE INTO admin_email_otps (id, email, otp_hash, purpose, attempts, expires_at)
       VALUES (?, ?, ?, 'forgot_password', 0, ?)`,
      crypto.randomUUID(),
      email,
      otpHash,
      expiresAt
    );

    // 4. Send email
    const emailRes = await sendEmail({
      to: email,
      subject: "Your Admin Password Reset Verification Code",
      html: getOtpEmailTemplate(otp, "forgot_password"),
    });

    if (!emailRes.success) {
      return json({ error: "Failed to send verification email. Please try again." }, { status: 500 });
    }

    await audit(email, "ADMIN_FORGOT_PASSWORD_REQUESTED", "AdminUser", email, `OTP generated and sent to ${email}`);
    return genericResponse;
  }

  if (action === "verify") {
    const otpInput = (body.otp || "").trim();
    const newPassword = body.newPassword || "";

    if (!otpInput) {
      return json({ error: "Verification code is required." }, { status: 400 });
    }

    if (!newPassword || newPassword.length < 15 || newPassword.length > 128) {
      return json({ error: "New password must be between 15 and 128 characters." }, { status: 400 });
    }

    // Find the latest active OTP challenge
    const otpRes = await query<{
      id: string;
      otp_hash: string;
      attempts: number;
      expires_at: number;
    }>(
      `SELECT id, otp_hash, attempts, expires_at 
       FROM admin_email_otps 
       WHERE lower(email) = lower(?) AND purpose = 'forgot_password'
       ORDER BY created_at DESC LIMIT 1`,
      email
    );
    const challenge = otpRes.results?.[0];

    if (!challenge) {
      return json({ error: "No active verification request found." }, { status: 400 });
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

    // Verify OTP code hash
    const inputHash = await hashOtp(otpInput);
    if (inputHash !== challenge.otp_hash) {
      await run("UPDATE admin_email_otps SET attempts = attempts + 1 WHERE id = ?", challenge.id);
      return json({ error: "Invalid verification code." }, { status: 400 });
    }

    // Reset password & revoke active sessions
    const pHash = await hashPassword(newPassword);
    await run(
      "UPDATE admin_users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE lower(email) = lower(?)",
      pHash,
      email
    );

    // Delete the OTP and revoke all existing sessions
    await run("DELETE FROM admin_email_otps WHERE id = ?", challenge.id);
    await run("UPDATE sessions SET revoked = 1 WHERE lower(email) = lower(?)", email);

    await audit(email, "ADMIN_PASSWORD_RESET_SUCCESS", "AdminUser", email, "Password successfully reset via email OTP");
    return json({ success: true, message: "Password reset successfully. You can now sign in." });
  }

  return json({ error: "Invalid action." }, { status: 400 });
}
