interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends a transactional email using the Resend HTTP API.
 * Expects RESEND_API_KEY to be configured as an environment secret.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams) {
  let apiKey: string | undefined;
  try {
    // Dynamic import to avoid Node link-time crash during testing
    const { env } = await import("cloudflare:workers");
    apiKey = (env as Record<string, any>).RESEND_API_KEY;
  } catch {
    // Fallback for local testing environments if process.env is populated
    apiKey = typeof process !== "undefined" ? process.env?.RESEND_API_KEY : undefined;
  }

  if (!apiKey) {
    console.warn(`[RESEND EMAIL MOCK] Key not configured. To: ${to}, Subject: ${subject}`);
    // If not configured, we log it and return success during development/testing.
    return { success: true, mocked: true };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Protone Care Hospital <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RESEND EMAIL ERROR] Failed to send to ${to}: ${errorText}`);
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    console.error(`[RESEND EMAIL ERROR] Fetch error for ${to}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Renders HTML template for OTP verification.
 */
export function getOtpEmailTemplate(otp: string, purpose: string, meta?: { newEmail?: string }) {
  let actionText = "authorize this action";
  if (purpose === "forgot_password") actionText = "reset your admin password";
  if (purpose === "change_password") actionText = "change your password";
  if (purpose === "change_email") {
    const emailStr = meta?.newEmail ? ` to <strong>${meta.newEmail}</strong>` : "";
    actionText = `update your admin email address${emailStr}`;
  }

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2b6cb0; text-align: center;">Security Verification Code</h2>
      <p>Hello,</p>
      <p>You requested to ${actionText} on the Protone Care Hospital Admin Console.</p>
      <div style="background-color: #f7fafc; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2d3748;">${otp}</span>
      </div>
      <p style="color: #718096; font-size: 14px;">This verification code is valid for 10 minutes. If you did not request this, please ignore this email or contact the super administrator.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="text-align: center; font-size: 12px; color: #a0aec0;">Protone Care Hospital © ${new Date().getFullYear()}</p>
    </div>
  `;
}

/**
 * Renders HTML template for Staff welcome/onboarding.
 */
export function getStaffOnboardingTemplate(name: string, email: string, tempPass: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2b6cb0; text-align: center;">Welcome to Protone Care Hospital</h2>
      <p>Hello ${name},</p>
      <p>An administrator has created a staff account for you on the Protone Care Hospital Admin Console.</p>
      <p>Here are your temporary credentials to sign in:</p>
      <table style="width: 100%; background-color: #f7fafc; border-radius: 6px; margin: 20px 0; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Login Email:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Temporary Password:</td>
          <td style="padding: 10px;"><code>${tempPass}</code></td>
        </tr>
      </table>
      <p>Upon your first sign in, you will be required to change your password to secure your account.</p>
      <p><a href="${typeof process !== "undefined" ? (process.env?.NEXT_PUBLIC_SITE_URL || 'https://protonecarehospital.com') : 'https://protonecarehospital.com'}/admin/login" style="display: inline-block; background-color: #3182ce; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Go to Admin Login</a></p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="text-align: center; font-size: 12px; color: #a0aec0;">Protone Care Hospital © ${new Date().getFullYear()}</p>
    </div>
  `;
}
