import { checkRateLimit, getClientIp, json, run, sha256 } from "@/app/lib/server";

const ALLOWED_EVENT_TYPES = new Set([
  "pageview",
  "triage_start",
  "triage_match",
  "appointment_view",
  "booking_start",
]);

const PATH_MAX_LENGTH = 256;
const ANALYTICS_RETENTION_DAYS = 90;

let lastAnalyticsCleanup = 0;

async function cleanupOldAnalytics() {
  // Bound D1 storage growth: delete rows older than the retention window.
  // Runs at most once every 6 hours per isolate.
  const now = Math.floor(Date.now() / 1000);
  if (now - lastAnalyticsCleanup < 6 * 60 * 60) return;
  lastAnalyticsCleanup = now;
  try {
    const cutoff = new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await run("DELETE FROM site_analytics WHERE created_at < ?", cutoff);
  } catch (err) {
    console.error("Failed to clean up old analytics rows:", err);
  }
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // Throttle unauthenticated analytics writes to prevent storage/availability abuse.
    const rate = await checkRateLimit("analytics", ip, 30, 60);
    if (!rate.ok) {
      return json({ success: false }, { status: 429 });
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const rawEventType = typeof payload.eventType === "string" ? payload.eventType.trim() : "pageview";
    const eventType = ALLOWED_EVENT_TYPES.has(rawEventType) ? rawEventType : "pageview";
    const path = typeof payload.path === "string" ? payload.path.trim().slice(0, PATH_MAX_LENGTH) : "/";

    const userAgent = request.headers.get("user-agent") || "";

    // Use a cryptographic hash (SHA-256) for anonymization instead of the
    // non-collision-resistant djb2, so IP/session pseudonyms can't be trivially
    // reversed or collided.
    const ipHash = await sha256(ip);
    const sessionHash = await sha256(`${ip}:${userAgent}`);

    const id = crypto.randomUUID();

    await run(
      `INSERT INTO site_analytics (id, event_type, path, session_hash, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      eventType,
      path,
      sessionHash,
      userAgent.slice(0, 300),
      ipHash
    );

    void cleanupOldAnalytics();

    return json({ success: true });
  } catch (error) {
    console.error("Failed to log analytics:", error);
    return json({ success: false }, { status: 500 });
  }
}
