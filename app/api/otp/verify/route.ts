import { checkRateLimit, getClientIp, json, normalizePhone, validatePhone, verifyStoredOtp } from "@/app/lib/server";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const body = (await request.json().catch(() => ({}))) as { phone?: string; code?: string; purpose?: string };
  const phone = normalizePhone(body.phone || "");
  const purpose = body.purpose === "feedback" ? "feedback" : "appointment";
  const code = (body.code || "").trim();

  if (!validatePhone(phone) || !/^\d{6}$/.test(code)) {
    return json({ error: "Enter the 6-digit OTP sent to the mobile number." }, { status: 400 });
  }

  const limit = await checkRateLimit("otp-verify", `${ip}:${phone}`, 8, 15 * 60);
  if (!limit.ok) {
    return json({ error: "Too many OTP verification attempts. Please wait and try again." }, { status: 429 });
  }

  const verified = await verifyStoredOtp(purpose, phone, code);
  if (!verified.ok) {
    return json({ error: "OTP verification failed or expired." }, { status: 400 });
  }

  return json({ success: true, message: "Mobile number verified." });
}
