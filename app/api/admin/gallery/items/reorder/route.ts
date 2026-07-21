import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { executeRoleMutation } from "@/app/lib/mutation-result";
import { clean } from "@/app/lib/utils";
import { GALLERY_ITEMS_SELECT, type GalleryItemRow } from "@/app/lib/gallery-v2";
import { parseVersion } from "@/app/lib/gallery-v2";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   POST /api/admin/gallery/items/reorder
   Atomic full-section reorder: single CASE/WHEN UPDATE with per-item
   expectedVersion guard for each row. Supports Staff revision flow.
   ─────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin({ role: "SUPER_ADMIN" });
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-reorder", `${auth.session.email}:${ip}`, 30, 15 * 60);
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

    const sectionRows = await query<Row>(
      "SELECT id FROM gallery_sections WHERE id = ? AND deleted_at IS NULL LIMIT 1",
      sectionId,
    );
    if (!sectionRows.results || sectionRows.results.length === 0) {
      return json({ error: "Gallery section not found.", outcome: "NOT_FOUND" }, { status: 404 });
    }

    const itemOrder = body.itemOrder;
    if (!Array.isArray(itemOrder)) {
      return json({ error: "itemOrder must be an array." }, { status: 400 });
    }

    if (itemOrder.length === 0) {
      return json({ error: "itemOrder must not be empty." }, { status: 400 });
    }

    for (const entry of itemOrder) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return json({ error: "itemOrder entries must be objects with id and version." }, { status: 400 });
      }
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== "string" || !e.id) {
        return json({ error: "Each itemOrder entry must have a string id." }, { status: 400 });
      }
      const v = parseVersion(e.version);
      if (v === null) {
        return json({ error: `Item ${e.id} has an invalid version. Must be a positive integer.` }, { status: 400 });
      }
    }

    const uniqueIds = new Set(itemOrder.map((e: Record<string, unknown>) => e.id as string));
    if (uniqueIds.size !== itemOrder.length) {
      return json({ error: "itemOrder contains duplicate IDs." }, { status: 400 });
    }

    const activeItems = await query<GalleryItemRow>(
      `SELECT ${GALLERY_ITEMS_SELECT} FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL`,
      sectionId,
    );
    const activeRows = activeItems.results ?? [];
    const activeIdSet = new Set(activeRows.map((r) => r.id));
    const activeVersionMap = new Map(activeRows.map((r) => [r.id, r.version]));

    for (const entry of itemOrder) {
      const e = entry as Record<string, unknown>;
      const itemId = e.id as string;
      if (!activeIdSet.has(itemId)) {
        return json(
          { error: `Item ${itemId} does not exist in this section or has been deleted.`, outcome: "NOT_FOUND" },
          { status: 404 },
        );
      }
    }

    if (activeIdSet.size !== itemOrder.length) {
      return json(
        { error: "itemOrder must include all active items in the section.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    const applyReorder = async () => {
      for (let i = 0; i < itemOrder.length; i++) {
        const e = itemOrder[i] as Record<string, unknown>;
        const itemId = e.id as string;
        const expectedVer = parseVersion(e.version);
        const currentVersion = activeVersionMap.get(itemId);

        if (expectedVer !== currentVersion) {
          throw new Error(`Version conflict for item ${itemId}: expected ${expectedVer}, found ${currentVersion}.`);
        }

        const result = await run(
          `UPDATE gallery_items SET sort_order = ?, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND section_id = ? AND version = ? AND deleted_at IS NULL`,
          i,
          auth.session.email,
          itemId,
          sectionId,
          expectedVer,
        );

        if (result.meta?.changes === 0) {
          throw new Error(`Version conflict for item ${itemId}: the item was modified during reorder.`);
        }
      }
      return { outcome: "APPLIED" as const };
    };

    const result = await executeRoleMutation({
      isStaff: auth.session.role === "STAFF",
      createRevision: async () => {
        const revId = crypto.randomUUID();
        await run(
          "INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, proposed_by) VALUES (?, ?, ?, ?, ?, ?)",
          revId,
          "gallery_items.reorder",
          sectionId,
          `Reorder items in section ${sectionId}`,
          JSON.stringify({
            action: "gallery_items.reorder",
            payload: { sectionId, itemOrder: itemOrder.map((e: Record<string, unknown>) => ({ id: e.id, version: e.version, sortOrder: itemOrder.indexOf(e) })) },
          }),
          auth.session.email,
        );
        await audit(auth.session.email, "REVISION_CREATED", "GallerySection", sectionId, `Reorder items in section ${sectionId} requires super admin review`);
        return { id: revId, reviewRequired: true };
      },
      applyMutation: applyReorder,
    });

    try {
      await audit(
        auth.session.email,
        "GALLERY_ITEMS_REORDERED",
        "GallerySection",
        sectionId,
        `Reordered ${itemOrder.length} items`,
      );
    } catch (auditErr) {
      console.error("Audit failure after GALLERY_ITEMS_REORDERED:", auditErr);
    }

    return json({ success: true, ...result });
  } catch (error) {
    console.error("Gallery reorder error:", error);
    const msg = error instanceof Error ? error.message : "Failed to reorder gallery items.";
    return json({ success: false, outcome: "FAILED", error: msg }, { status: 400 });
  }
}
