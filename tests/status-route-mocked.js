import { query, checkRateLimit, getClientIp, json } from "./server-mocked.js";

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const limit = await checkRateLimit("appointment-status-check", ip, 5, 10 * 60);
    if (!limit.ok) {
      return json({ error: "Too many status requests. Please try again later." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { requestId, phoneLast4 } = body;

    if (!requestId || typeof requestId !== "string" || !requestId.startsWith("PCH-")) {
      return json({ error: "Invalid Request ID format. Use format: PCH-YYYY-XXXX" }, { status: 400 });
    }

    if (!phoneLast4 || typeof phoneLast4 !== "string" || !/^\d{4}$/.test(phoneLast4)) {
      return json({ error: "Invalid phone number verification. Please provide the last 4 digits." }, { status: 400 });
    }

    const rows = await query(
      "SELECT status, department_name, requested_date, requested_time, created_at, phone FROM appointments WHERE request_id = ?",
      [requestId]
    );

    if (!rows.results || rows.results.length === 0) {
      return json({ error: "Appointment request not found or verification failed." }, { status: 404 });
    }

    const appointment = rows.results[0];
    const cleanedPhone = appointment.phone.replace(/\D/g, "");
    if (cleanedPhone.slice(-4) !== phoneLast4) {
      return json({ error: "Appointment request not found or verification failed." }, { status: 404 });
    }

    const { phone, ...publicData } = appointment;
    return json({ data: publicData });
  } catch (err) {
    console.error("Status check error:", err);
    return json({ error: "Failed to fetch appointment status." }, { status: 500 });
  }
}
