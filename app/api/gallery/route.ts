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
      `SELECT ma.id, ma.r2_key, ma.purpose, ma.created_at,
              ma.storage_type, ma.public_path,
              ma.display_r2_key, ma.display_public_path,
              ma.thumbnail_r2_key, ma.thumbnail_public_path,
              ma.title, ma.alt_text, ma.caption
       FROM media_assets ma
       WHERE ma.purpose = 'gallery'
         AND ma.lifecycle_status = 'PUBLISHED'
         AND ma.status = 'APPROVED'
         AND ma.is_visible = 1
         AND ma.deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM gallery_items gi
           INNER JOIN gallery_sections gs ON gi.section_id = gs.id
           WHERE gi.media_id = ma.id
             AND gi.deleted_at IS NULL
             AND gs.deleted_at IS NULL
             AND gs.lifecycle_status != 'ARCHIVED'
         )
       ORDER BY ma.created_at DESC
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
