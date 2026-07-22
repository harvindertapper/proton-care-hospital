import { sendEmail } from "./resend.ts";

export interface AppointmentAlertDetails {
  requestId: string;
  patientName: string;
  phone: string;
  email: string;
  departmentName: string;
  requestedDate: string;
  requestedTime: string;
  concern: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolves the hospital alert recipient email address.
 * Priority: APPOINTMENT_ALERT_TO_EMAIL → ADMIN_SUPER_EMAIL → null (skip).
 */
async function resolveRecipient(): Promise<string | null> {
  try {
    // Dynamic import to avoid Node link-time crash during testing
    const { env } = await import("cloudflare:workers");
    const typed = env as unknown as Record<string, string | undefined>;
    return typed.APPOINTMENT_ALERT_TO_EMAIL || typed.ADMIN_SUPER_EMAIL || null;
  } catch {
    return (
      (typeof process !== "undefined" && (process.env?.APPOINTMENT_ALERT_TO_EMAIL || process.env?.ADMIN_SUPER_EMAIL)) ||
      null
    );
  }
}

/**
 * Returns the full HTML template for the hospital appointment alert email.
 */
export function getHospitalAppointmentAlertTemplate(details: AppointmentAlertDetails): string {
  const esc = escapeHtml;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #2b6cb0; text-align: center;">New Appointment Request</h2>
      <p>A new appointment request has been submitted on the Protone Care Hospital website.</p>
      <table style="width: 100%; background-color: #f7fafc; border-radius: 6px; margin: 20px 0; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Request ID:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.requestId)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Patient Name:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.patientName)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Phone:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.phone)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Email:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.email)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Department:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.departmentName)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Date:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.requestedDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Time:</td>
          <td style="padding: 10px; border-bottom: 1px solid #edf2f7;">${esc(details.requestedTime)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">Concern:</td>
          <td style="padding: 10px;">${esc(details.concern)}</td>
        </tr>
      </table>
      <p style="color: #718096; font-size: 14px;">This is an automated alert. Please review and follow up with the patient as soon as possible.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="text-align: center; font-size: 12px; color: #a0aec0;">Protone Care Hospital &copy; ${new Date().getFullYear()}</p>
    </div>
  `;
}

/**
 * Sends the hospital appointment alert email.
 * Always returns a result object; never throws.
 */
export async function sendHospitalAppointmentAlert(
  details: AppointmentAlertDetails,
): Promise<{ sent: boolean; recipient: string | null; error?: string }> {
  const recipient = await resolveRecipient();
  if (!recipient) {
    return { sent: false, recipient: null, error: "No recipient configured" };
  }

  const html = getHospitalAppointmentAlertTemplate(details);
  const subject = `New Appointment Request — ${details.patientName} (${details.requestId})`;

  try {
    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      replyTo: details.email,
    });

    if (result.success) {
      return { sent: true, recipient };
    }

    return { sent: false, recipient, error: result.error || "Email send failed" };
  } catch (error) {
    return { sent: false, recipient, error: String(error) };
  }
}
