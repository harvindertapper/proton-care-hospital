import { checkRateLimit, createOtpChallenge, getClientIp, json, normalizePhone, validatePhone } from "@/app/lib/server";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as { phone?: string; purpose?: string };
  const phone = normalizePhone(body.phone || "");
  const purpose = body.purpose === "feedback" ? "feedback" : "appointment";

  if (!validatePhone(phone)) {
    return json({ error: "Please enter a valid Indian mobile number." }, { status: 400 });
  }

  const ipLimit = await checkRateLimit("otp-ip", ip, 6, 15 * 60);
  const phoneLimit = await checkRateLimit("otp-phone", `${purpose}:${phone}`, 3, 15 * 60);
  if (!ipLimit.ok || !phoneLimit.ok) {
    return json({ error: "OTP limit reached. Please wait before requesting another OTP." }, { status: 429 });
  }

  const challenge = await createOtpChallenge(purpose, phone, ip);
  if (!challenge.delivery.ok) {
    return json(
      { error: "SMS OTP is not configured for production yet. Please contact the hospital desk.", delivery: challenge.delivery },
      { status: 503 },
    );
  }
  return json({
    success: true,
    challengeId: challenge.id,
    delivery: challenge.delivery,
    previewOtp: challenge.code,
    message: challenge.delivery.configured
      ? "OTP sent through SMS91."
      : "OTP preview generated. Configure SMS91 credentials before production launch.",
  });
}
