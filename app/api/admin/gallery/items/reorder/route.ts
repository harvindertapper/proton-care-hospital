import { json, query, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp, run } from "@/app/lib/server";
import { executeRoleMutation, MutationConflictError, MutationNotFoundError } from "@/app/lib/mutation-result";
import { clean } from "@/app/lib/utils";
import { GALLERY_ITEMS_SELECT, applyAtomicReorder, type GalleryItemRow } from "@/app/lib/gallery-v2";
import { parseVersion } from "@/app/lib/gallery-v2";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   POST /api/admin/gallery/items/reorder
   Atomic full-section reorder: single CASE/WHEN UPDATE with per-item
   version guard for each row, and pre-validation subquery proving:
     - active count == payload count
     - every payload ID belongs to section
     - every expectedVersion matches
     - no active item omitted
   Supports Staff revision flow.
   ─────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
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

    if (itemOrder.length < 1 || itemOrder.length > 100) {
      return json({ error: "itemOrder length must be between 1 and 100." }, { status: 400 });
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

    /* ─── Subquery guard: prove active count, ID ownership, version match, no omission ─── */
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
          { error: "Incomplete itemOrder.", outcome: "CONFLICT" },
          { status: 409 },
        );
      }
    }

    if (activeIdSet.size !== itemOrder.length) {
      return json(
        { error: "Incomplete itemOrder.", outcome: "CONFLICT" },
        { status: 409 },
      );
    }

    for (const entry of itemOrder) {
      const e = entry as Record<string, unknown>;
      const itemId = e.id as string;
      const expectedVer = parseVersion(e.version);
      const currentVersion = activeVersionMap.get(itemId);
      if (expectedVer !== currentVersion) {
        return json(
          { error: "Version conflict. The section has been modified since you loaded it.", outcome: "CONFLICT" },
          { status: 409 },
        );
      }
    }

    const applyReorder = async () => {
      const changes = await applyAtomicReorder(sectionId, itemOrder.map((e: Record<string, unknown>) => ({ id: e.id as string, version: e.version as number })), auth.session.email);
      if (changes !== itemOrder.length) {
        throw new MutationConflictError("Version conflict. The section has been modified since you loaded it.");
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
        await audit(auth.session.email, "REVISION_CREATED", "GallerySection", sectionId, `Reorder items in section ${sectionId} requires review`);
        return { id: revId, reviewRequired: true };
      },
      applyMutation: applyReorder,
    });

    if (result.outcome === "APPLIED") {
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
    }

    return json({ success: true, ...result });
  } catch (error) {
    console.error("Gallery reorder error:", error);
    if (error instanceof MutationConflictError) {
      return json({ success: false, outcome: "CONFLICT", error: error.message }, { status: 409 });
    }
    if (error instanceof MutationNotFoundError) {
      return json({ success: false, outcome: "NOT_FOUND", error: error.message }, { status: 404 });
    }
    return json({ success: false, outcome: "FAILED", error: "Failed to reorder gallery items." }, { status: 500 });
  }
}
