import {
  audit,
  checkRateLimit,
  getClientIp,
  isHoneypotTriggered,
  json,
  normalizePhone,
  run,
  sanitizeHtml,
  validatePhone,
  verifyTurnstile,
} from "@/app/lib/server";
import { clean } from "@/app/lib/utils";

const FEEDBACK_PHONE_DAILY_LIMIT = 3;

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (isHoneypotTriggered(body)) return json({ success: true });

  const limit = await checkRateLimit("feedback", ip, 2, 10 * 60);
  if (!limit.ok) return json({ error: "Please wait before submitting more feedback." }, { status: 429 });

  const turnstile = await verifyTurnstile(clean(body.turnstileToken, 2000), ip);
  if (!turnstile.ok) return json({ error: "Security verification failed." }, { status: 403 });

  const patientName = sanitizeHtml(clean(body.patientName, 100));
  const phone = normalizePhone(clean(body.phone, 20));
  const rating = Number(body.rating || 0);
  const message = sanitizeHtml(clean(body.message, 1500));
  const consent = body.consent === true;

  if (patientName.length < 2 || !validatePhone(phone) || rating < 1 || rating > 5 || message.length < 10 || !consent) {
    return json({ error: "Please complete feedback, rating, phone, and consent." }, { status: 400 });
  }

  const phoneLimit = await checkRateLimit("feedback-phone", phone, FEEDBACK_PHONE_DAILY_LIMIT, 24 * 60 * 60);
  if (!phoneLimit.ok) {
    return json({ error: `Daily limit reached. Maximum of ${FEEDBACK_PHONE_DAILY_LIMIT} feedback submissions per phone number within 24 hours.` }, { status: 429 });
  }

  const id = crypto.randomUUID();
  await run(
    "INSERT INTO feedback (id, patient_name, phone, rating, message, consent, otp_verified) VALUES (?, ?, ?, ?, ?, 1, 0)",
    id,
    patientName,
    phone,
    rating,
    message,
  );
  await audit("system", "FEEDBACK_SUBMITTED", "Feedback", id, `Feedback submitted by ${patientName}; needs review`);
  return json({ success: true, message: "Thank you. Your feedback has been submitted for hospital review." });
}
