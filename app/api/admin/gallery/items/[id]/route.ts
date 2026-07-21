import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { clean } from "@/app/lib/utils";
import {
  ITEM_WITH_MEDIA_SELECT,
  parseVersion,
  isSlotKeyAvailable,
  toItemAdminDto,
  publishedAtSql,
  GALLERY_FIELD_LENGTHS,
  type ItemRowWithMedia,
} from "@/app/lib/gallery-v2";
import { isValidLifecycleStatus } from "@/app/lib/content/lifecycle";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   PATCH /api/admin/gallery/items/[id]
   sectionId and mediaId are immutable — return 400 if either is attempted.
   ─────────────────────────────────────────────────────────────────────────── */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin({ role: "SUPER_ADMIN" });
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return json({ error: "Item ID is required." }, { status: 400 });

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-items", `${auth.session.email}:${ip}`, 40, 15 * 60);
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

    if (body.sectionId !== undefined) {
      return json({ error: "sectionId is immutable and cannot be changed." }, { status: 400 });
    }
    if (body.mediaId !== undefined) {
      return json({ error: "mediaId is immutable and cannot be changed." }, { status: 400 });
    }

    const expectedVersion = parseVersion(body.expectedVersion);
    if (!expectedVersion) {
      return json({ error: "expectedVersion is required and must be a positive integer." }, { status: 400 });
    }

    const rows = await query<ItemRowWithMedia>(
      `SELECT ${ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`,
      id,
    );
    const current = rows.results?.[0];
    if (!current || current.deleted_at) {
      return json({ error: "Gallery item not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    if (current.version !== expectedVersion) {
      return json(
        { error: "Version conflict. The item has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const updates: string[] = [];
    const binds: unknown[] = [];

    if (body.slotKey !== undefined) {
      const slotKey = body.slotKey === null || body.slotKey === ""
        ? null
        : clean(body.slotKey, GALLERY_FIELD_LENGTHS.slotKey) || null;

      if (slotKey) {
        const slotAvailable = await isSlotKeyAvailable(slotKey, id);
        if (!slotAvailable) {
          return json({ error: "This slot_key is already in use by another active item.", outcome: "CONFLICT" }, { status: 409 });
        }
      }
      updates.push("slot_key = ?");
      binds.push(slotKey);
    }

    if (body.titleOverride !== undefined) {
      updates.push("title_override = ?");
      binds.push(clean(body.titleOverride, GALLERY_FIELD_LENGTHS.titleOverride));
    }

    if (body.altTextOverride !== undefined) {
      updates.push("alt_text_override = ?");
      binds.push(clean(body.altTextOverride, GALLERY_FIELD_LENGTHS.altTextOverride));
    }

    if (body.captionOverride !== undefined) {
      updates.push("caption_override = ?");
      binds.push(clean(body.captionOverride, GALLERY_FIELD_LENGTHS.captionOverride));
    }

    if (body.sortOrder !== undefined) {
      const sortOrder = typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder) && body.sortOrder >= 0
        ? body.sortOrder
        : 0;
      updates.push("sort_order = ?");
      binds.push(sortOrder);
    }

    if (body.lifecycleStatus !== undefined) {
      const ls = clean(body.lifecycleStatus, 40);
      if (!isValidLifecycleStatus(ls)) {
        return json({ error: "Invalid lifecycleStatus." }, { status: 400 });
      }
      updates.push("lifecycle_status = ?");
      binds.push(ls);
    }

    if (updates.length === 0) {
      return json({ error: "No editable fields provided." }, { status: 400 });
    }

    const effectiveStatus = (body.lifecycleStatus as string) || current.lifecycle_status;
    const pubSql = publishedAtSql(current.lifecycle_status, effectiveStatus, current.published_at);
    if (pubSql) {
      updates.push(pubSql);
    }

    updates.push("version = version + 1");
    updates.push("updated_by = ?");
    binds.push(auth.session.email);
    updates.push("updated_at = CURRENT_TIMESTAMP");

    const updateSql = `UPDATE gallery_items SET ${updates.join(", ")} WHERE id = ? AND version = ? AND deleted_at IS NULL`;
    const result = await run(updateSql, ...binds, id, expectedVersion);

    if (result.meta?.changes === 0) {
      const recheck = await query<Row>(
        "SELECT id, version, deleted_at FROM gallery_items WHERE id = ? LIMIT 1",
        id,
      );
      const recheckRow = recheck.results?.[0];
      if (!recheckRow || recheckRow.deleted_at) {
        return json({ error: "Gallery item not found.", outcome: "NOT_FOUND" }, { status: 404 });
      }
      return json(
        { error: "Version conflict. The item has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const updatedRows = await query<ItemRowWithMedia>(
      `SELECT ${ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`,
      id,
    );
    const updated = updatedRows.results?.[0];
    if (!updated) {
      return json({ error: "Gallery item not found after update.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    const dto = toItemAdminDto(updated);

    try {
      await audit(
        auth.session.email,
        "GALLERY_ITEM_UPDATED",
        "GalleryItem",
        id,
        JSON.stringify({ fields: Object.keys(body).filter((k) => k !== "expectedVersion") }),
      );
    } catch (auditErr) {
      console.error("Audit failure after GALLERY_ITEM_UPDATED:", auditErr);
    }

    return json({ success: true, outcome: "APPLIED", item: dto });
  } catch (error) {
    console.error("Gallery item PATCH error:", error);
    return json({ error: "Failed to update gallery item." }, { status: 500 });
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   DELETE /api/admin/gallery/items/[id]
   Logical deletion only (set deleted_at).
   ─────────────────────────────────────────────────────────────────────────── */

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin({ role: "SUPER_ADMIN" });
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const { id } = await params;
    if (!id) return json({ error: "Item ID is required." }, { status: 400 });

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-items-delete", `${auth.session.email}:${ip}`, 20, 15 * 60);
    if (!rateCheck.ok) {
      return json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const expectedVersion = parseVersion(body?.expectedVersion);
    if (!expectedVersion) {
      return json({ error: "expectedVersion is required and must be a positive integer." }, { status: 400 });
    }

    const rows = await query<Row>(
      `SELECT gi.id, gi.version, gi.deleted_at, gi.slot_key FROM gallery_items gi WHERE gi.id = ? AND gi.deleted_at IS NULL LIMIT 1`,
      id,
    );
    const row = rows.results?.[0];
    if (!row) {
      return json({ error: "Gallery item not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    if ((row.version as number) !== expectedVersion) {
      return json(
        { error: "Version conflict. The item has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const result = await run(
      `UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      auth.session.email,
      id,
      expectedVersion,
    );

    if (result.meta?.changes === 0) {
      return json(
        { error: "Version conflict. The item has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    try {
      await audit(
        auth.session.email,
        "GALLERY_ITEM_DELETED",
        "GalleryItem",
        id,
        `Deleted gallery item with slot_key=${row.slot_key}`,
      );
    } catch (auditErr) {
      console.error("Audit failure after GALLERY_ITEM_DELETED:", auditErr);
    }

    return json({ success: true, outcome: "APPLIED" });
  } catch (error) {
    console.error("Gallery item DELETE error:", error);
    return json({ error: "Failed to delete gallery item." }, { status: 500 });
  }
}
