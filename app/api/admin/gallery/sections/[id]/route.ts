import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { executeRoleMutation } from "@/app/lib/mutation-result";
import { clean } from "@/app/lib/utils";
import {
  GALLERY_SECTIONS_SELECT,
  normalizeSlug,
  parseVersion,
  parseSortOrder,
  isSectionSlugAvailable,
  toSectionAdminDto,
  publishedAtSql,
  SECTION_PUBLISHED_GUARD,
  GALLERY_FIELD_LENGTHS,
  countItemsInSection,
  countPublishedItemsInSection,
  type GallerySectionRow,
} from "@/app/lib/gallery-v2";
import { isValidLifecycleStatus } from "@/app/lib/content/lifecycle";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   PATCH /api/admin/gallery/sections/[id]
   Staff → create revision (PENDING_APPROVAL); SUPER_ADMIN → direct mutation.
   Section publication guard: when transitioning to PUBLISHED, the same-statement
   UPDATE WHERE includes EXISTS requiring at least one PUBLISHED gallery item
   joined to PUBLISHED/APPROVED/visible GALLERY-category media.
   Strict sortOrder: reject invalid with 400 (never silently convert to 0).
   ─────────────────────────────────────────────────────────────────────────── */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
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
      const sortOrderResult = parseSortOrder(body.sortOrder);
      if (!sortOrderResult.ok) {
        return json({ error: sortOrderResult.error }, { status: 400 });
      }
      updates.push("sort_order = ?");
      binds.push(sortOrderResult.value);
    }

    const targetLifecycleStatus = body.lifecycleStatus !== undefined ? clean(body.lifecycleStatus, 40) : null;
    if (targetLifecycleStatus !== null) {
      if (!isValidLifecycleStatus(targetLifecycleStatus)) {
        return json({ error: "Invalid lifecycleStatus." }, { status: 400 });
      }
      updates.push("lifecycle_status = ?");
      binds.push(targetLifecycleStatus);
    }

    if (updates.length === 0) {
      return json({ error: "No editable fields provided." }, { status: 400 });
    }

    const effectiveStatus = targetLifecycleStatus || current.lifecycle_status;
    const pubSql = publishedAtSql(current.lifecycle_status, effectiveStatus, current.published_at);
    if (pubSql) {
      updates.push(pubSql);
    }

    updates.push("version = version + 1");
    updates.push("updated_by = ?");
    binds.push(auth.session.email);
    updates.push("updated_at = CURRENT_TIMESTAMP");

    const whereClauses = ["id = ?", "version = ?", "deleted_at IS NULL"];
    const whereBinds: unknown[] = [id, expectedVersion];

    if (targetLifecycleStatus === "PUBLISHED") {
      whereClauses.push(SECTION_PUBLISHED_GUARD);
    }

    const updateSql = `UPDATE gallery_sections SET ${updates.join(", ")} WHERE ${whereClauses.join(" AND ")}`;
    const result = await run(updateSql, ...binds, ...whereBinds);

    if (result.meta?.changes === 0) {
      const recheck = await query<Row>(
        "SELECT id, version, deleted_at FROM gallery_sections WHERE id = ? LIMIT 1",
        id,
      );
      const recheckRow = recheck.results?.[0];
      if (!recheckRow || recheckRow.deleted_at) {
        return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
      }
      if (recheckRow.version !== expectedVersion) {
        return json(
          { error: "Version conflict. The section has been modified since you loaded it.", outcome: "CONFLICT" },
          { status: 409 },
        );
      }
      return json(
        { error: "Section is not eligible for publication.", outcome: "CONFLICT" },
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
   Staff → create revision; SUPER_ADMIN → direct mutation.
   ─────────────────────────────────────────────────────────────────────────── */

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdmin();
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

    const applyDelete = async () => {
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
          throw new Error("Gallery section not found.");
        }
        const activeItemsCheck = await query<Row>(
          "SELECT id FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL LIMIT 1",
          id,
        );
        if (activeItemsCheck.results && activeItemsCheck.results.length > 0) {
          throw new Error("Version conflict. The section has been modified since you loaded it.");
        }
        throw new Error("Version conflict. The section has been modified since you loaded it.");
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

      return { outcome: "APPLIED" as const };
    };

    const result = await executeRoleMutation({
      isStaff: auth.session.role === "STAFF",
      createRevision: async () => {
        const revId = crypto.randomUUID();
        await query(
          "INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, proposed_by) VALUES (?, ?, ?, ?, ?, ?)",
          revId,
          "gallery_section.delete",
          id,
          `Delete gallery section: ${row.name}`,
          JSON.stringify({ action: "gallery_section.delete", payload: { id, expectedVersion } }),
          auth.session.email,
        );
        await audit(auth.session.email, "REVISION_CREATED", "GallerySection", id, `Delete gallery section: ${row.name} requires review`);
        return { id: revId, reviewRequired: true };
      },
      applyMutation: applyDelete,
    });

    return json({ success: true, ...result });
  } catch (error) {
    console.error("Gallery section DELETE error:", error);
    return json({ error: "Failed to delete gallery section." }, { status: 500 });
  }
}
