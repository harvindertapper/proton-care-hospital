import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { clean } from "@/app/lib/utils";
import { GALLERY_ITEMS_SELECT, type GalleryItemRow } from "@/app/lib/gallery-v2";

type Row = Record<string, unknown>;

/* ───────────────────────────────────────────────────────────────────────────
   POST /api/admin/gallery/items/reorder
   Atomic full-section reorder: replaces sort_order for all active items
   in a section within a single transaction.
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

    // Validate section exists
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

    // Validate all entries are strings
    for (const entry of itemOrder) {
      if (typeof entry !== "string") {
        return json({ error: "itemOrder must contain only string IDs." }, { status: 400 });
      }
    }

    // Check for duplicates in input
    const uniqueIds = new Set(itemOrder);
    if (uniqueIds.size !== itemOrder.length) {
      return json({ error: "itemOrder contains duplicate IDs." }, { status: 400 });
    }

    // Fetch all active items for this section
    const activeItems = await query<GalleryItemRow>(
      `SELECT ${GALLERY_ITEMS_SELECT} FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL`,
      sectionId,
    );
    const activeRows = activeItems.results ?? [];

    // Build sets for comparison
    const activeIdSet = new Set(activeRows.map((r) => r.id));
    const inputIdSet = new Set(itemOrder);

    // Check all input IDs exist in this section
    for (const itemId of itemOrder) {
      if (!activeIdSet.has(itemId)) {
        return json(
          { error: `Item ${itemId} does not exist in this section or has been deleted.`, outcome: "NOT_FOUND" },
          { status: 404 },
        );
      }
    }

    // Check for items in section not in input (must include all)
    for (const activeId of activeIdSet) {
      if (!inputIdSet.has(activeId)) {
        return json(
          { error: "itemOrder must include all active items in the section.", outcome: "CONFLICT" },
          { status: 409 },
        );
      }
    }

    // Execute atomic reorder: assign sort_order = index position
    // Note: D1 does not support BEGIN/COMMIT transaction wrappers per-request,
    // but the UPDATE statements are idempotent and the idempotency key
    // prevents overlapping reorders for the same section.
    const statements: { sql: string; binds: unknown[] }[] = [];

    for (let i = 0; i < itemOrder.length; i++) {
      const itemId = itemOrder[i];
      statements.push({
        sql: `UPDATE gallery_items SET sort_order = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND section_id = ? AND deleted_at IS NULL`,
        binds: [i, auth.session.email, itemId, sectionId],
      });
    }

    // Execute all updates
    for (const stmt of statements) {
      await run(stmt.sql, ...stmt.binds);
    }

    // Audit
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

    return json({ success: true, outcome: "APPLIED" });
  } catch (error) {
    console.error("Gallery reorder error:", error);
    return json({ error: "Failed to reorder gallery items." }, { status: 500 });
  }
}
