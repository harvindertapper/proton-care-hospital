import { env } from "cloudflare:workers";
import {
  audit,
  checkIdempotency,
  checkRateLimit,
  getClientIp,
  isHoneypotTriggered,
  json,
  normalizePhone,
  run,
  saveIdempotency,
  sanitizeHtml,
  validateEmail,
  validatePhone,
  verifyTurnstile,
} from "@/app/lib/server";
import { clean } from "@/app/lib/utils";

// Assert production environment secrets on route load
if (process.env.NODE_ENV === "production") {
  if (!env.ADMIN_SESSION_SECRET && !env.AUTH_SECRET) {
    throw new Error("Initialization assertion failed: ADMIN_SESSION_SECRET or AUTH_SECRET environment variable is missing.");
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (isHoneypotTriggered(body)) return json({ success: true });

  const limit = await checkRateLimit("contact", ip, 4, 10 * 60);
  if (!limit.ok) return json({ error: "Please wait before sending another message." }, { status: 429 });

  const turnstile = await verifyTurnstile(clean(body.turnstileToken, 2000), ip);
  if (!turnstile.ok) {
    return json({ error: "Security verification failed." }, { status: 403 });
  }

  const name = sanitizeHtml(clean(body.name, 100));
  const phone = normalizePhone(clean(body.phone, 20));
  const email = sanitizeHtml(clean(body.email, 160).toLowerCase());
  const subject = sanitizeHtml(clean(body.subject, 160));
  const message = sanitizeHtml(clean(body.message, 1400));

  if (name.length < 2 || !validateEmail(email) || message.length < 8) {
    return json({ error: "Please enter name, valid email, and message." }, { status: 400 });
  }
  if (phone && !validatePhone(phone)) {
    return json({ error: "Please enter a valid Indian mobile number or leave phone blank." }, { status: 400 });
  }

  const idempotencyKey = request.headers.get("idempotency-key") || clean(body.idempotencyKey, 100);
  if (idempotencyKey) {
    try {
      const cached = await checkIdempotency(idempotencyKey, {
        name,
        phone,
        email,
        subject,
        message,
      });
      if (cached) return json(cached);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Idempotency check failed." }, { status: 400 });
    }
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

  const responseData = { success: true, message: "Thank you. The hospital desk has received your message." };
  if (idempotencyKey) {
    await saveIdempotency(idempotencyKey, {
      name,
      phone,
      email,
      subject,
      message,
    }, responseData);
  }

  return json(responseData);
}
