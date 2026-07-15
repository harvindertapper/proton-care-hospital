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
  verifyFirebaseToken,
  verifyTurnstile,
} from "@/app/lib/server";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

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
  const otpCode = clean(body.otpCode, 8);
  const consent = body.consent === true;

  if (patientName.length < 2 || !validatePhone(phone) || rating < 1 || rating > 5 || message.length < 10 || !consent) {
    return json({ error: "Please complete feedback, rating, phone, OTP, and consent." }, { status: 400 });
  }

  const firebaseIdToken = clean(body.firebaseIdToken, 2000);
  const otp = await verifyFirebaseToken(firebaseIdToken, phone);
  if (!otp.ok) return json({ error: "Please verify the mobile number with OTP before submitting feedback." }, { status: 400 });

  const id = crypto.randomUUID();
  await run(
    "INSERT INTO feedback (id, patient_name, phone, rating, message, consent, otp_verified) VALUES (?, ?, ?, ?, ?, 1, 1)",
    id,
    patientName,
    phone,
    rating,
    message,
  );
  await audit("system", "FEEDBACK_SUBMITTED", "Feedback", id, `Feedback submitted by ${patientName}; needs review`);
  return json({ success: true, message: "Thank you. Your feedback has been submitted for hospital review." });
}
