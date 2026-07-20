import { json, query } from "@/app/lib/server";

export async function GET() {
  try {
    const result = await query<Record<string, unknown>>(
      `SELECT id, r2_key, purpose, created_at
       FROM media_assets
       WHERE purpose = 'gallery'
         AND lifecycle_status = 'PUBLISHED'
         AND status = 'APPROVED'
         AND is_visible = 1
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return json({ success: true, assets: result.results || [] });
  } catch (error) {
    console.error("Gallery GET error:", error);
    return json(
      { error: "Failed to load gallery assets." },
      { status: 500 }
    );
  }
}
