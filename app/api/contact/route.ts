import { audit, checkRateLimit, getClientIp, isHoneypotTriggered, json, normalizePhone, run, validatePhone } from "@/app/lib/server";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (isHoneypotTriggered(body)) return json({ success: true });

  const limit = await checkRateLimit("contact", ip, 4, 10 * 60);
  if (!limit.ok) return json({ error: "Please wait before sending another message." }, { status: 429 });

  const name = clean(body.name, 100);
  const phone = normalizePhone(clean(body.phone, 20));
  const email = clean(body.email, 160).toLowerCase();
  const subject = clean(body.subject, 160);
  const message = clean(body.message, 1400);

  if (name.length < 2 || !email.includes("@") || message.length < 8) {
    return json({ error: "Please enter name, valid email, and message." }, { status: 400 });
  }
  if (phone && !validatePhone(phone)) {
    return json({ error: "Please enter a valid Indian mobile number or leave phone blank." }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await run(
    "INSERT INTO contact_messages (id, name, phone, email, subject, message, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    name,
    phone,
    email,
    subject,
    message,
    ip,
  );
  await audit("system", "CONTACT_SUBMITTED", "ContactMessage", id, `Contact message from ${name}`);
  return json({ success: true, message: "Thank you. The hospital desk has received your message." });
}
