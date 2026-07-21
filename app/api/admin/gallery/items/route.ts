import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { executeRoleMutation } from "@/app/lib/mutation-result";
import { clean } from "@/app/lib/utils";
import {
  ITEM_WITH_MEDIA_SELECT,
  parseGalleryLimit,
  parseGalleryOffset,
  parseSortOrder,
  isSlotKeyAvailable,
  toItemAdminDto,
  GALLERY_FIELD_LENGTHS,
  type ItemRowWithMedia,
} from "@/app/lib/gallery-v2";
import { isValidLifecycleStatus } from "@/app/lib/content/lifecycle";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   GET /api/admin/gallery/items
   Paginated item list with media join and optional filters.
   ─────────────────────────────────────────────────────────────────────────── */

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);

    const limitResult = parseGalleryLimit(url.searchParams.get("limit"));
    if (!limitResult.ok) return json({ error: limitResult.error }, { status: 400 });
    const limit = limitResult.value;

    const offsetResult = parseGalleryOffset(url.searchParams.get("offset"));
    if (!offsetResult.ok) return json({ error: offsetResult.error }, { status: 400 });
    const offset = offsetResult.value;

    const sectionId = url.searchParams.get("sectionId");
    if (sectionId !== null && sectionId.length === 0) {
      return json({ error: "sectionId cannot be empty." }, { status: 400 });
    }

    const lifecycleStatus = url.searchParams.get("lifecycleStatus");
    if (lifecycleStatus !== null && !isValidLifecycleStatus(lifecycleStatus)) {
      return json({ error: "Invalid lifecycleStatus filter." }, { status: 400 });
    }

    const includeDeletedRaw = url.searchParams.get("includeDeleted");
    if (includeDeletedRaw !== null && includeDeletedRaw !== "true" && includeDeletedRaw !== "false") {
      return json({ error: "includeDeleted must be true or false." }, { status: 400 });
    }
    const includeDeleted = includeDeletedRaw === "true";
    const isSuperAdmin = auth.session.role === "SUPER_ADMIN";
    if (includeDeleted && !isSuperAdmin) {
      return json({ error: "Only super admin may include deleted items." }, { status: 403 });
    }

    const conditions: string[] = [];
    const binds: unknown[] = [];

    if (!includeDeleted) {
      conditions.push("gi.deleted_at IS NULL");
    }
    if (sectionId !== null) {
      conditions.push("gi.section_id = ?");
      binds.push(sectionId);
    }
    if (lifecycleStatus !== null) {
      conditions.push("gi.lifecycle_status = ?");
      binds.push(lifecycleStatus);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) AS total FROM gallery_items gi ${whereClause}`;
    const countResult = await query<{ total: number }>(countSql, ...binds);
    const total = countResult.results?.[0]?.total ?? 0;

    const listSql = `SELECT ${ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id ${whereClause} ORDER BY gi.sort_order ASC, gi.id ASC LIMIT ? OFFSET ?`;
    const listResult = await query<ItemRowWithMedia>(listSql, ...binds, limit, offset);

    const items = (listResult.results ?? []).map((row) => toItemAdminDto(row));

    return json({
      success: true,
      items,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Gallery items GET error:", error);
    return json({ error: "Failed to load gallery items." }, { status: 500 });
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   POST /api/admin/gallery/items
   Create a new gallery item. Always starts as DRAFT.
   Media category must be GALLERY.
   ─────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-items", `${auth.session.email}:${ip}`, 30, 15 * 60);
    if (!rateCheck.ok) {
      return json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (parsed === null || parsed === undefined || Array.isArray(parsed) || typeof parsed !== "object") {
        return json({ error: "Request body must be a JSON object." }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Malformed or empty request body." }, { status: 400 });
    }

    const sectionId = clean(body.sectionId, 140);
    if (!sectionId) return json({ error: "sectionId is required." }, { status: 400 });

    const mediaId = clean(body.mediaId, 140);
    if (!mediaId) return json({ error: "mediaId is required." }, { status: 400 });

    const sectionRows = await query<Row>(
      "SELECT id FROM gallery_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      sectionId,
    );
    if (!sectionRows.results || sectionRows.results.length === 0) {
      return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    const mediaRows = await query<Row>(
      "SELECT id, category FROM media_assets WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      mediaId,
    );
    if (!mediaRows.results || mediaRows.results.length === 0) {
      return json({ error: "Media asset not found or has been deleted.", outcome: "NOT_FOUND" }, { status: 404 });
    }
    const mediaCategory = (mediaRows.results[0] as { category?: string }).category;
    if (mediaCategory && mediaCategory !== "GALLERY") {
      return json({ error: "Media asset category must be GALLERY for gallery items." }, { status: 400 });
    }

    const slotKey = body.slotKey !== undefined && body.slotKey !== null
      ? clean(body.slotKey, GALLERY_FIELD_LENGTHS.slotKey) || null
      : null;

    if (slotKey) {
      const slotAvailable = await isSlotKeyAvailable(slotKey);
      if (!slotAvailable) {
        return json({ error: "This slot_key is already in use by another active item.", outcome: "CONFLICT" }, { status: 409 });
      }
    }

    const titleOverride = clean(body.titleOverride, GALLERY_FIELD_LENGTHS.titleOverride);
    const altTextOverride = clean(body.altTextOverride, GALLERY_FIELD_LENGTHS.altTextOverride);
    const captionOverride = clean(body.captionOverride, GALLERY_FIELD_LENGTHS.captionOverride);
    const sortOrder = parseSortOrder(body.sortOrder);

    const itemId = `gallery-item-${crypto.randomUUID().slice(0, 8)}`;

    const result = await executeRoleMutation({
      isStaff: auth.session.role === "STAFF",
      createRevision: async () => {
        const id = crypto.randomUUID();
        await run(
          "INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, proposed_by) VALUES (?, ?, ?, ?, ?, ?)",
          id,
          "gallery_item.create",
          itemId,
          `Create gallery item in section ${sectionId}`,
          JSON.stringify({
            action: "gallery_item.create",
            payload: {
              sectionId,
              mediaId,
              slotKey,
              titleOverride,
              altTextOverride,
              captionOverride,
              sortOrder,
            },
          }),
          auth.session.email,
        );
        await audit(auth.session.email, "REVISION_CREATED", "GalleryItem", itemId, `Create gallery item in section ${sectionId} requires super admin review`);
        return { id, reviewRequired: true };
      },
      applyMutation: async () => {
        await run(
          `INSERT INTO gallery_items (id, section_id, media_id, slot_key, title_override, alt_text_override, caption_override, sort_order, lifecycle_status, version, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          itemId,
          sectionId,
          mediaId,
          slotKey,
          titleOverride,
          altTextOverride,
          captionOverride,
          sortOrder,
          auth.session.email,
          auth.session.email,
        );
        await audit(auth.session.email, "GALLERY_ITEM_CREATED", "GalleryItem", itemId, `Created gallery item in section ${sectionId}`);
        return { outcome: "APPLIED" as const };
      },
    });

    return json({ success: true, ...result });
  } catch (error) {
    console.error("Gallery items POST error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create gallery item.";
    const isInternal = msg.includes("D1") || msg.includes("SQLITE") || msg.includes("prepare") || msg.includes("bind");
    return json(
      { success: false, outcome: "FAILED", error: isInternal ? "An internal database error occurred." : msg },
      { status: isInternal ? 500 : 400 },
    );
  }
}
