import { json, query } from "@/app/lib/server";

export async function GET() {
  try {
    const result = await query<Record<string, unknown>>(
      "SELECT id, r2_key, file_name, purpose, consent_note, status, is_visible, created_at FROM media_assets WHERE status = 'APPROVED' AND is_visible = 1 ORDER BY created_at DESC LIMIT 100"
    );
    return json({ success: true, assets: result.results || [] });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to load gallery assets." },
      { status: 500 }
    );
  }
}
