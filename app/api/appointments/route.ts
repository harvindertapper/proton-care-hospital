import {
  audit,
  checkIdempotency,
  checkRateLimit,
  getClientIp,
  getDepartment,
  isHoneypotTriggered,
  json,
  nextRequestId,
  normalizePhone,
  run,
  saveIdempotency,
  validatePhone,
  verifyStoredOtp,
  verifyTurnstile,
} from "@/app/lib/server";

// Assert production environment secrets on route load
if (process.env.NODE_ENV === "production") {
  if (!process.env.OTP_HASH_SECRET) {
    throw new Error("Initialization assertion failed: OTP_HASH_SECRET environment variable is missing.");
  }
  if (!process.env.ADMIN_SESSION_SECRET && !process.env.AUTH_SECRET) {
    throw new Error("Initialization assertion failed: ADMIN_SESSION_SECRET or AUTH_SECRET environment variable is missing.");
  }
}

function cleanText(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (isHoneypotTriggered(body)) {
    return json({ success: true, requestId: "PCH-2026-0000" });
  }

  const rateLimit = await checkRateLimit("appointment", ip, 1, 2 * 60);
  if (!rateLimit.ok) {
    return json({ error: "Please wait a couple of minutes before submitting another appointment request." }, { status: 429 });
  }

  const turnstile = await verifyTurnstile(cleanText(body.turnstileToken, 2000), ip);
  if (!turnstile.ok) {
    return json({ error: "Security verification failed. Please refresh and try again." }, { status: 403 });
  }

  const patientName = cleanText(body.patientName, 120);
  const phone = normalizePhone(cleanText(body.phone, 20));
  const email = cleanText(body.email, 160).toLowerCase();
  const departmentSlug = cleanText(body.departmentSlug, 120);
  const requestedDate = cleanText(body.requestedDate, 20);
  const requestedTime = cleanText(body.requestedTime, 20);
  const concern = cleanText(body.concern, 1200);
  const otpCode = cleanText(body.otpCode, 8);
  const consent = body.consent === true;

  if (departmentSlug === "emergency-medicine") {
    return json({ error: "Emergency department requests must be made by phone. Please call 9220463438 immediately." }, { status: 400 });
  }

  const department = getDepartment(departmentSlug);
  const isUntimed = department && !department.timing;
  const timeValid = isUntimed ? (requestedTime === "Manual Allocation") : requestedTime;

  if (patientName.length < 2 || !validatePhone(phone) || !email.includes("@") || !department || !requestedDate || !timeValid || concern.length < 5 || !consent) {
    return json({ error: "Please complete all required appointment fields and consent." }, { status: 400 });
  }

  // Idempotency-Key Check
  const idempotencyKey = request.headers.get("idempotency-key") || cleanText(body.idempotencyKey, 100);
  if (idempotencyKey) {
    try {
      const cached = await checkIdempotency(idempotencyKey, {
        patientName,
        phone,
        email,
        departmentSlug,
        requestedDate,
        requestedTime,
        concern,
        consent,
      });
      if (cached) return json(cached);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Idempotency check failed." }, { status: 400 });
    }
  }

  const duplicate = await checkRateLimit("appointment-duplicate", `${phone}:${email}`, 1, 10 * 60);
  if (!duplicate.ok) {
    return json({ error: "A recent request already exists for these contact details. Our team will contact you shortly." }, { status: 429 });
  }

  const otp = await verifyStoredOtp("appointment", phone, otpCode);
  if (!otp.ok) {
    return json({ error: "Please verify the mobile number with OTP before submitting." }, { status: 400 });
  }

  const requestId = await nextRequestId();
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO appointments
      (id, request_id, patient_name, phone, email, department_slug, department_name, requested_date, requested_time, concern, consent, otp_verified, ip_address, user_agent, schedule_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 1)`,
    id,
    requestId,
    patientName,
    phone,
    email,
    department.slug,
    department.name,
    requestedDate,
    requestedTime,
    concern,
    ip,
    request.headers.get("user-agent") || "",
  );
  await audit("system", "APPOINTMENT_CREATED", "Appointment", id, `${requestId} ${department.name} ${requestedDate} ${requestedTime}`);

  const responseData = {
    success: true,
    requestId,
    message:
      "Your appointment request has been received. Our hospital team will contact you shortly to confirm the appointment. For emergencies, please call 9220463438 or visit Protone Care Hospital directly.",
  };

  if (idempotencyKey) {
    await saveIdempotency(idempotencyKey, {
      patientName,
      phone,
      email,
      departmentSlug,
      requestedDate,
      requestedTime,
      concern,
      consent,
    }, responseData);
  }

  return json(responseData);
}
