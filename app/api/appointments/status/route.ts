import { NextResponse } from "next/server";
import { query } from "@/app/lib/server";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.expiresAt) {
    rateLimitMap.set(ip, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  record.count++;
  return false;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many status requests. Please try again later." }, { status: 429 });
    }

    const { requestId } = await request.json();
    if (!requestId || typeof requestId !== "string" || !requestId.startsWith("PCH-")) {
      return NextResponse.json({ error: "Invalid Request ID format. Use format: PCH-YYYY-XXXX" }, { status: 400 });
    }

    const rows = await query<{ status: string; department_name: string; requested_date: string; requested_time: string; created_at: string }>(
      "SELECT status, department_name, requested_date, requested_time, created_at FROM appointments WHERE request_id = ?",
      [requestId]
    );

    if (!rows.results || rows.results.length === 0) {
      return NextResponse.json({ error: "Appointment request not found. Please verify the ID." }, { status: 404 });
    }

    const appointment = rows.results[0];
    return NextResponse.json({ data: appointment });
  } catch (err) {
    console.error("Status check error:", err);
    return NextResponse.json({ error: "Failed to fetch appointment status." }, { status: 500 });
  }
}
