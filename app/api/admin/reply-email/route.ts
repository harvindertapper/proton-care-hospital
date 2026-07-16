import { audit, json, requireAdmin, run, verifyCsrf } from "@/app/lib/server";
import { sendEmail } from "@/app/lib/resend";

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

    // Update the message state in contact_messages
    await run(
      "UPDATE contact_messages SET status = 'CONTACTED', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      contactId
    );

    // Audit the action
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
