import { audit, json, query, requireAdmin, run, verifyCsrf } from "@/app/lib/server";
import { sendEmail } from "@/app/lib/resend";
import { requireAppliedMutation } from "@/app/lib/mutation-result";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return json({ error: admin.error }, { status: admin.status });
  }

  if (!verifyCsrf(request, admin.session)) {
    return json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const contactId = typeof payload.contactId === "string" ? payload.contactId.trim() : "";
    const replyText = typeof payload.replyText === "string" ? payload.replyText.trim() : "";
    const recipientEmail = typeof payload.recipientEmail === "string" ? payload.recipientEmail.trim().toLowerCase() : "";
    const subject = typeof payload.subject === "string" ? payload.subject.trim() : "Reply from Protone Care Hospital";

    if (!contactId || !replyText || !recipientEmail) {
      throw new Error("Required fields: contactId, replyText, recipientEmail are missing.");
    }

    // Prove contact exists before sending email
    const existing = await query(
      "SELECT id FROM contact_messages WHERE id = ?",
      contactId
    );
    const contactExists = Boolean(existing.results && existing.results.length);
    if (!contactExists) {
      throw new Error("Contact message not found.");
    }

    // Send email using Resend
    await sendEmail({
      to: recipientEmail,
      subject: subject,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; borderRadius: 8px;">
          <h2 style="color: #0c4a6e; border-bottom: 2px solid #e0f2fe; padding-bottom: 10px;">Protone Care Hospital</h2>
          <p>Dear Valued Patient,</p>
          <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #0284c7; margin: 20px 0; font-style: italic;">
            "${replyText.replace(/\n/g, "<br/>")}"
          </div>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            Best regards,<br/>
            <strong>Protone Care Hospital Administration</strong><br/>
            Contact Support Desk: 9220463438
          </p>
        </div>
      `,
    });

    // Update the message state in contact_messages (schema-compatible: no updated_at)
    const result = await run(
      "UPDATE contact_messages SET status = 'CONTACTED' WHERE id = ?",
      contactId
    );
    requireAppliedMutation(result, contactExists, "Contact message");

    // Audit only after the database mutation is proved applied
    await audit(admin.session.email, "CONTACT_REPLIED", "ContactMessage", contactId, `Replied to ${recipientEmail}`);

    return json({ success: true });
  } catch (error) {
    console.error("Failed to process email reply:", error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to send email response." },
      { status: 500 }
    );
  }
}
