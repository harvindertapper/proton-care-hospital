import { json, query, run, requireAdmin, verifyCsrf } from "@/app/lib/server";

export async function GET() {
  try {
    const res = await query<{ key: string; value: string }>(
      "SELECT value FROM site_configs WHERE key = 'er_status'"
    );
    const row = res.results?.[0];
    if (row) {
      return json(JSON.parse(row.value));
    }
  } catch (err) {
    console.error("Failed to fetch ER status:", err);
  }
  
  // Default fallback status
  return json({ status: "Open", waitTime: "Under 10 mins" });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return json({ error: admin.error }, { status: admin.status });
  }

  if (!verifyCsrf(request, admin.session)) {
    return json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.trim() : "Open";
    const waitTime = typeof payload.waitTime === "string" ? payload.waitTime.trim() : "Under 10 mins";

    const valueStr = JSON.stringify({ status, waitTime });

    await run(
      "INSERT INTO site_configs (key, value) VALUES ('er_status', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
      valueStr,
      valueStr
    );

    return json({ success: true, status, waitTime });
  } catch (error) {
    console.error("Failed to update ER status:", error);
    return json(
      { error: error instanceof Error ? error.message : "Failed to update ER status." },
      { status: 500 }
    );
  }
}
