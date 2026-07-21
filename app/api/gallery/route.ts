import { json, query } from "@/app/lib/server";
import { resolveMediaUrls } from "@/app/lib/media-library";

type GalleryRow = {
  id: string;
  r2_key: string;
  purpose: string;
  created_at: string;
  storage_type: string;
  public_path: string | null;
  display_r2_key: string | null;
  display_public_path: string | null;
  thumbnail_r2_key: string | null;
  thumbnail_public_path: string | null;
  title: string;
  alt_text: string;
  caption: string;
};

export async function GET() {
  try {
    const result = await query<GalleryRow>(
      `SELECT id, r2_key, purpose, created_at,
              storage_type, public_path,
              display_r2_key, display_public_path,
              thumbnail_r2_key, thumbnail_public_path,
              title, alt_text, caption
       FROM media_assets
       WHERE purpose = 'gallery'
         AND lifecycle_status = 'PUBLISHED'
         AND status = 'APPROVED'
         AND is_visible = 1
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`
    );

    const rows = result.results || [];
    const assets = [];

    for (const row of rows) {
      const urlResult = resolveMediaUrls({
        storage_type: row.storage_type,
        r2_key: row.r2_key,
        public_path: row.public_path,
        display_r2_key: row.display_r2_key,
        display_public_path: row.display_public_path,
        thumbnail_r2_key: row.thumbnail_r2_key,
        thumbnail_public_path: row.thumbnail_public_path,
      });

      if (!urlResult.ok) continue;

      assets.push({
        id: row.id,
        displayUrl: urlResult.urls.displayUrl || urlResult.urls.originalUrl,
        title: row.title || undefined,
        altText: row.alt_text || undefined,
        caption: row.caption || undefined,
        createdAt: row.created_at,
      });
    }

    return json({ success: true, assets });
  } catch (error) {
    console.error("Gallery GET error:", error);
    return json(
      { error: "Failed to load gallery assets." },
      { status: 500 }
    );
  }
}
