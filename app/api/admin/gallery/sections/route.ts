import { json, query, run, requireAdmin, verifyCsrf, audit, checkRateLimit, getClientIp } from "@/app/lib/server";
import { executeRoleMutation } from "@/app/lib/mutation-result";
import { clean, slugify } from "@/app/lib/utils";
import {
  GALLERY_SECTIONS_SELECT,
  normalizeSlug,
  parseGalleryLimit,
  parseGalleryOffset,
  parseSortOrder,
  isSectionSlugAvailable,
  toSectionAdminDto,
  countItemsInSection,
  countPublishedItemsInSection,
  countSections,
  GALLERY_FIELD_LENGTHS,
  type GallerySectionRow,
} from "@/app/lib/gallery-v2";
import { isValidLifecycleStatus } from "@/app/lib/content/lifecycle";

/* ───────────────────────────────────────────────────────────────────────────
   GET /api/admin/gallery/sections
   Paginated section list with item counts and optional lifecycle filter.
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
      conditions.push("deleted_at IS NULL");
    }
    if (lifecycleStatus !== null) {
      conditions.push("lifecycle_status = ?");
      binds.push(lifecycleStatus);
    }

    const total = await countSections(conditions, binds);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const listSql = `SELECT ${GALLERY_SECTIONS_SELECT} FROM gallery_sections ${whereClause} ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`;
    const listResult = await query<GallerySectionRow>(listSql, ...binds, limit, offset);

    const sections = [];
    for (const row of listResult.results ?? []) {
      const itemCount = await countItemsInSection(row.id);
      const publishedItemCount = await countPublishedItemsInSection(row.id);
      sections.push(toSectionAdminDto(row, itemCount, publishedItemCount));
    }

    return json({
      success: true,
      sections,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + limit < total,
      },
    });
  } catch (error) {
    console.error("Gallery sections GET error:", error);
    return json({ error: "Failed to load gallery sections." }, { status: 500 });
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   POST /api/admin/gallery/sections
   Create a new gallery section. Always starts as DRAFT.
   ─────────────────────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    if (!verifyCsrf(request, auth.session)) {
      return json({ error: "CSRF token is required." }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rateCheck = await checkRateLimit("admin-gallery-sections", `${auth.session.email}:${ip}`, 30, 15 * 60);
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

    const name = clean(body.name, GALLERY_FIELD_LENGTHS.name);
    if (!name) return json({ error: "Section name is required." }, { status: 400 });

    const slug = normalizeSlug(body.slug) || slugify(name);
    if (!slug) return json({ error: "Section slug is required." }, { status: 400 });

    const description = clean(body.description, GALLERY_FIELD_LENGTHS.description);

    const sortOrderResult = parseSortOrder(body.sortOrder);
    if (!sortOrderResult.ok) {
      return json({ error: sortOrderResult.error }, { status: 400 });
    }
    const sortOrder = sortOrderResult.value;

    const slugAvailable = await isSectionSlugAvailable(slug);
    if (!slugAvailable) {
      return json({ error: "A section with this slug already exists.", outcome: "CONFLICT" }, { status: 409 });
    }

    const sectionId = `gallery-section-${slug}`;

    const result = await executeRoleMutation({
      isStaff: auth.session.role === "STAFF",
      createRevision: async () => {
        const id = crypto.randomUUID();
        await run(
          "INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, proposed_by) VALUES (?, ?, ?, ?, ?, ?)",
          id,
          "gallery_section.create",
          sectionId,
          `Create gallery section: ${name}`,
          JSON.stringify({ action: "gallery_section.create", payload: { slug, name, description, sortOrder } }),
          auth.session.email,
        );
        await audit(auth.session.email, "REVISION_CREATED", "GallerySection", sectionId, `Create gallery section: ${name} requires super admin review`);
        return { id, reviewRequired: true };
      },
      applyMutation: async () => {
        await run(
          `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by, updated_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'DRAFT', 1, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          sectionId,
          slug,
          name,
          description,
          sortOrder,
          auth.session.email,
          auth.session.email,
        );
        await audit(auth.session.email, "GALLERY_SECTION_CREATED", "GallerySection", sectionId, `Created gallery section: ${name}`);
        return { outcome: "APPLIED" as const };
      },
    });

    return json({ success: true, ...result });
  } catch (error) {
    console.error("Gallery sections POST error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create gallery section.";
    const isInternal = msg.includes("D1") || msg.includes("SQLITE") || msg.includes("prepare") || msg.includes("bind");
    return json(
      { success: false, outcome: "FAILED", error: isInternal ? "An internal database error occurred." : msg },
      { status: isInternal ? 500 : 400 },
    );
  }
}
