import { json, query } from "@/app/lib/server";
import {
  GALLERY_SECTIONS_SELECT,
  ITEM_WITH_MEDIA_SELECT,
  toSectionPublicDto,
  toItemPublicDto,
  type GallerySectionRow,
  type ItemRowWithMedia,
} from "@/app/lib/gallery-v2";
import type { PublicGalleryItemDto } from "@/app/lib/gallery-v2";

/* ───────────────────────────────────────────────────────────────────────────
   GET /api/gallery/v2
   Public dormant Gallery v2 read endpoint.
   Returns only PUBLISHED sections and their PUBLISHED items with resolved URLs.
   Dormant (DRAFT) data is never exposed.
   ─────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  try {
    // Check for gallery_v2_initialized marker
    const markerRows = await query<{ value: string }>(
      "SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'",
    );
    const marker = markerRows.results?.[0];
    if (!marker || marker.value !== "1") {
      return json(
        { success: true, sections: [], note: "Gallery v2 is not yet initialized." },
        { status: 200 },
      );
    }

    // Fetch PUBLISHED sections (never expose DRAFT or other dormant states)
    const sectionRows = await query<GallerySectionRow>(
      `SELECT ${GALLERY_SECTIONS_SELECT} FROM gallery_sections WHERE lifecycle_status = 'PUBLISHED' AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC`,
    );
    const sections = sectionRows.results ?? [];

    if (sections.length === 0) {
      return json({ success: true, sections: [] });
    }

    // For each section, fetch PUBLISHED items with resolved URLs
    const result = [];
    for (const section of sections) {
      const itemRows = await query<ItemRowWithMedia>(
        `SELECT ${ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.section_id = ? AND gi.lifecycle_status = 'PUBLISHED' AND gi.deleted_at IS NULL ORDER BY gi.sort_order ASC, gi.id ASC`,
        section.id,
      );
      const items = (itemRows.results ?? []).map((row) => toItemPublicDto(row));
      result.push(toSectionPublicDto(section, items));
    }

    return json({ success: true, sections: result });
  } catch (error) {
    console.error("Public Gallery v2 GET error:", error);
    return json({ error: "Failed to load gallery." }, { status: 500 });
  }
}
