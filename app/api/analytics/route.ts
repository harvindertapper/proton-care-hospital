import { getClientIp, json, run, sha256 } from "@/app/lib/server";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = typeof payload.eventType === "string" ? payload.eventType.trim() : "pageview";
    const path = typeof payload.path === "string" ? payload.path.trim() : "/";

    const userAgent = request.headers.get("user-agent") || "";
    const ip = getClientIp(request);
    
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

    return json({ success: true });
  } catch (error) {
    console.error("Failed to log analytics:", error);
    return json({ success: false }, { status: 500 });
  }
}
