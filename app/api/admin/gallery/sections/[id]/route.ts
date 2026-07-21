import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { clean } from "@/app/lib/utils";
import {
  GALLERY_SECTIONS_SELECT,
  normalizeSlug,
  parseVersion,
  isSectionSlugAvailable,
  toSectionAdminDto,
  publishedAtSql,
  GALLERY_FIELD_LENGTHS,
  countItemsInSection,
  countPublishedItemsInSection,
  type GallerySectionRow,
} from "@/app/lib/gallery-v2";
import { isValidLifecycleStatus } from "@/app/lib/content/lifecycle";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   PATCH /api/admin/gallery/sections/[id]
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
    if (!id) return json({ error: "Section ID is required." }, { status: 400 });

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-sections", `${auth.session.email}:${ip}`, 40, 15 * 60);
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

    const expectedVersion = parseVersion(body.expectedVersion);
    if (!expectedVersion) {
      return json({ error: "expectedVersion is required and must be a positive integer." }, { status: 400 });
    }

    const rows = await query<GallerySectionRow>(
      `SELECT ${GALLERY_SECTIONS_SELECT} FROM gallery_sections WHERE id = ? LIMIT 1`,
      id,
    );
    const current = rows.results?.[0];
    if (!current || current.deleted_at) {
      return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    if (current.version !== expectedVersion) {
      return json(
        { error: "Version conflict. The section has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const updates: string[] = [];
    const binds: unknown[] = [];

    if (body.name !== undefined) {
      const name = clean(body.name, GALLERY_FIELD_LENGTHS.name);
      if (!name) return json({ error: "Section name cannot be empty." }, { status: 400 });
      updates.push("name = ?");
      binds.push(name);
    }

    if (body.slug !== undefined) {
      const slug = normalizeSlug(body.slug);
      if (!slug) return json({ error: "Invalid slug." }, { status: 400 });
      const slugAvailable = await isSectionSlugAvailable(slug, id);
      if (!slugAvailable) {
        return json({ error: "A section with this slug already exists.", outcome: "CONFLICT" }, { status: 409 });
      }
      updates.push("slug = ?");
      binds.push(slug);
    }

    if (body.description !== undefined) {
      updates.push("description = ?");
      binds.push(clean(body.description, GALLERY_FIELD_LENGTHS.description));
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

    const updateSql = `UPDATE gallery_sections SET ${updates.join(", ")} WHERE id = ? AND version = ? AND deleted_at IS NULL`;
    const result = await run(updateSql, ...binds, id, expectedVersion);

    if (result.meta?.changes === 0) {
      const recheck = await query<Row>(
        "SELECT id, version, deleted_at FROM gallery_sections WHERE id = ? LIMIT 1",
        id,
      );
      const recheckRow = recheck.results?.[0];
      if (!recheckRow || recheckRow.deleted_at) {
        return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
      }
      return json(
        { error: "Version conflict. The section has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const updatedRows = await query<GallerySectionRow>(
      `SELECT ${GALLERY_SECTIONS_SELECT} FROM gallery_sections WHERE id = ? LIMIT 1`,
      id,
    );
    const updated = updatedRows.results?.[0];
    if (!updated) {
      return json({ error: "Gallery section not found after update.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    const itemCount = await countItemsInSection(id);
    const publishedItemCount = await countPublishedItemsInSection(id);

    try {
      await audit(
        auth.session.email,
        "GALLERY_SECTION_UPDATED",
        "GallerySection",
        id,
        JSON.stringify({ fields: Object.keys(body).filter((k) => k !== "expectedVersion") }),
      );
    } catch (auditErr) {
      console.error("Audit failure after GALLERY_SECTION_UPDATED:", auditErr);
    }

    return json({ success: true, outcome: "APPLIED", item: toSectionAdminDto(updated, itemCount, publishedItemCount) });
  } catch (error) {
    console.error("Gallery section PATCH error:", error);
    return json({ error: "Failed to update gallery section." }, { status: 500 });
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   DELETE /api/admin/gallery/sections/[id]
   Logical deletion: sets ARCHIVED + deleted_at in a single guarded UPDATE.
   The WHERE clause includes NOT EXISTS for active items to prevent race conditions.
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
    if (!id) return json({ error: "Section ID is required." }, { status: 400 });

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-sections-delete", `${auth.session.email}:${ip}`, 20, 15 * 60);
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

    const rows = await query<GallerySectionRow>(
      `SELECT ${GALLERY_SECTIONS_SELECT} FROM gallery_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      id,
    );
    const row = rows.results?.[0];
    if (!row) {
      return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    if (row.version !== expectedVersion) {
      return json(
        { error: "Version conflict. The section has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const result = await run(
      `UPDATE gallery_sections
       SET lifecycle_status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND version = ? AND deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE section_id = gallery_sections.id AND deleted_at IS NULL)`,
      auth.session.email,
      id,
      expectedVersion,
    );

    if (result.meta?.changes === 0) {
      const recheck = await query<Row>(
        "SELECT id, version, deleted_at FROM gallery_sections WHERE id = ? LIMIT 1",
        id,
      );
      const recheckRow = recheck.results?.[0];
      if (!recheckRow || recheckRow.deleted_at) {
        return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
      }
      const activeItemsCheck = await query<Row>(
        "SELECT id FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL LIMIT 1",
        id,
      );
      if (activeItemsCheck.results && activeItemsCheck.results.length > 0) {
        return json(
          { success: false, outcome: "CONFLICT", error: "Cannot delete a section that still has active gallery items. Remove all items first." },
          { status: 409 },
        );
      }
      return json(
        { error: "Version conflict. The section has been modified since you loaded it.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    try {
      await audit(
        auth.session.email,
        "GALLERY_SECTION_DELETED",
        "GallerySection",
        id,
        `Deleted gallery section: ${row.name}`,
      );
    } catch (auditErr) {
      console.error("Audit failure after GALLERY_SECTION_DELETED:", auditErr);
    }

    return json({ success: true, outcome: "APPLIED" });
  } catch (error) {
    console.error("Gallery section DELETE error:", error);
    return json({ error: "Failed to delete gallery section." }, { status: 500 });
  }
}
