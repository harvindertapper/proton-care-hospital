import {
  audit,
  checkRateLimit,
  json,
  query,
  run,
  verifyAdminSession,
  verifyCsrf,
} from "@/app/lib/server";
import { sendEmail, getOtpEmailTemplate } from "@/app/lib/resend";
import { hashOtp } from "@/app/lib/utils";

export async function POST(request: Request) {
  const session = await verifyAdminSession();
  if (!session) {
    return json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!verifyCsrf(request, session)) {
    return json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    purpose?: "change_password" | "change_email";
    newEmail?: string;
  };

  const purpose = body.purpose || "";
  const newEmail = (body.newEmail || "").trim().toLowerCase();

  if (purpose !== "change_password" && purpose !== "change_email") {
    return json({ error: "Invalid purpose specified." }, { status: 400 });
  }

  if (purpose === "change_email" && !newEmail) {
    return json({ error: "New email address is required." }, { status: 400 });
  }

  if (purpose === "change_email") {
    // Validate format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(newEmail) || newEmail.length > 254) {
      return json({ error: "Invalid email address format." }, { status: 400 });
    }
    // Check if new email is already in use
    const checkEmail = await query("SELECT id FROM admin_users WHERE lower(email) = lower(?) LIMIT 1", newEmail);
    if (checkEmail.results?.length) {
      return json({ error: "Email address is already in use by another account." }, { status: 400 });
    }
  }

  // Rate limit
  const rateLimitKey = `otp-request-${session.email}`;
  const limit = await checkRateLimit(rateLimitKey, session.email, 5, 10 * 60);
  if (!limit.ok) {
    return json({ error: "Too many OTP requests. Please wait and try again." }, { status: 429 });
  }

  // Generate 6-digit OTP using a cryptographically secure source.
  const otpArray = new Uint32Array(1);
  crypto.getRandomValues(otpArray);
  const otp = String(otpArray[0] % 1_000_000).padStart(6, "0");
  const otpHash = await hashOtp(otp);
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60; // 10 mins

  // Always send the verification OTP to the CURRENT admin email to prevent hijacks
  const targetEmail = session.email;

  // Save OTP challenge
  const metaJson = purpose === "change_email" ? JSON.stringify({ newEmail }) : null;
  await run(
    `INSERT OR REPLACE INTO admin_email_otps (id, email, otp_hash, purpose, meta_json, attempts, expires_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
    crypto.randomUUID(),
    session.email, // Kept indexed under current admin email
    otpHash,
    purpose,
    metaJson,
    expiresAt
  );

  // Send Email
  const emailRes = await sendEmail({
    to: targetEmail,
    subject: "Your Admin Security Verification Code",
    html: getOtpEmailTemplate(otp, purpose, purpose === "change_email" ? { newEmail } : undefined),
  });

  if (!emailRes.success) {
    return json({ error: "Failed to send verification code. Please try again." }, { status: 500 });
  }

  await audit(
    session.email,
    "ADMIN_OTP_REQUESTED",
    "AdminUser",
    session.email,
    `Requested verification OTP for ${purpose} sent to current email ${targetEmail}` +
      (purpose === "change_email" ? ` (proposed new email: ${newEmail})` : "")
  );
  return json({ success: true, message: "Verification code sent successfully." });
}
