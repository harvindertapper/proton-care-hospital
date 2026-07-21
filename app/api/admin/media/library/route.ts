import { json, query, requireAdmin } from "@/app/lib/server";
import {
  MEDIA_LIBRARY_SELECT,
  toAdminDto,
  escapeLikeWildcard,
} from "@/app/lib/media-library";
import {
  MEDIA_STORAGE_TYPES,
  MEDIA_CATEGORIES,
  MEDIA_RIGHTS_STATUSES,
  MEDIA_PURGE_STATUSES,
  GALLERY_LIFECYCLE_STATUSES,
} from "@/app/lib/media-schema";

const VALID_QUERY_STATUSES = new Set(["NEW", "NEEDS_REVIEW", "APPROVED", "HIDDEN"]);

type Row = Record<string, unknown>;

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 25;
  return Math.min(Math.floor(n), 100);
}

function parseOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function isIn(val: unknown, set: ReadonlySet<string>): val is string {
  return typeof val === "string" && set.has(val);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);

    const search = url.searchParams.get("search") ?? "";
    const storageType = url.searchParams.get("storageType");
    const category = url.searchParams.get("category");
    const purpose = url.searchParams.get("purpose");
    const status = url.searchParams.get("status");
    const lifecycleStatus = url.searchParams.get("lifecycleStatus");
    const rightsStatus = url.searchParams.get("rightsStatus");
    const purgeStatus = url.searchParams.get("purgeStatus");
    const includeDeleted = url.searchParams.get("includeDeleted") === "true";
    const limit = parseLimit(url.searchParams.get("limit"));
    const offset = parseOffset(url.searchParams.get("offset"));

    // Validate enum filters
    if (storageType !== null && !isIn(storageType, MEDIA_STORAGE_TYPES)) {
      return json({ error: "Invalid storageType filter." }, { status: 400 });
    }
    if (category !== null && !isIn(category, MEDIA_CATEGORIES)) {
      return json({ error: "Invalid category filter." }, { status: 400 });
    }
    if (status !== null && !isIn(status, VALID_QUERY_STATUSES)) {
      return json({ error: "Invalid status filter." }, { status: 400 });
    }
    if (lifecycleStatus !== null && !isIn(lifecycleStatus, GALLERY_LIFECYCLE_STATUSES)) {
      return json({ error: "Invalid lifecycleStatus filter." }, { status: 400 });
    }
    if (rightsStatus !== null && !isIn(rightsStatus, MEDIA_RIGHTS_STATUSES)) {
      return json({ error: "Invalid rightsStatus filter." }, { status: 400 });
    }
    if (purgeStatus !== null && !isIn(purgeStatus, MEDIA_PURGE_STATUSES)) {
      return json({ error: "Invalid purgeStatus filter." }, { status: 400 });
    }

    // Build WHERE clauses
    const conditions: string[] = [];
    const binds: unknown[] = [];

    // Deleted rows excluded by default; only SUPER_ADMIN may include them
    const isSuperAdmin = auth.session.role === "SUPER_ADMIN";
    if (!includeDeleted || !isSuperAdmin) {
      conditions.push("deleted_at IS NULL");
    }

    if (storageType !== null) {
      conditions.push("storage_type = ?");
      binds.push(storageType);
    }
    if (category !== null) {
      conditions.push("category = ?");
      binds.push(category);
    }
    if (purpose !== null) {
      conditions.push("purpose = ?");
      binds.push(purpose);
    }
    if (status !== null) {
      conditions.push("status = ?");
      binds.push(status);
    }
    if (lifecycleStatus !== null) {
      conditions.push("lifecycle_status = ?");
      binds.push(lifecycleStatus);
    }
    if (rightsStatus !== null) {
      conditions.push("rights_status = ?");
      binds.push(rightsStatus);
    }
    if (purgeStatus !== null) {
      conditions.push("purge_status = ?");
      binds.push(purgeStatus);
    }

    // Search: escape LIKE wildcards, bind as parameter
    if (search.trim().length > 0) {
      conditions.push(
        `(file_name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR alt_text LIKE ? ESCAPE '\\' OR caption LIKE ? ESCAPE '\\' OR public_path LIKE ? ESCAPE '\\' OR r2_key LIKE ? ESCAPE '\\')`
      );
      const pattern = `%${escapeLikeWildcard(search.trim())}%`;
      binds.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM media_assets ${whereClause}`;
    const countResult = await query<{ total: number }>(countSql, ...binds);
    const total = countResult.results?.[0]?.total ?? 0;

    // List query with deterministic ordering
    const listSql = `SELECT ${MEDIA_LIBRARY_SELECT} FROM media_assets ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    const listResult = await query<Row>(listSql, ...binds, limit, offset);

    // Map rows to Admin DTOs
    const items = [];
    for (const row of listResult.results ?? []) {
      const dtoResult = toAdminDto(row as Parameters<typeof toAdminDto>[0]);
      if (dtoResult.ok) {
        items.push(dtoResult.dto);
      }
    }

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
    console.error("Media Library GET error:", error);
    return json({ error: "Failed to load media library." }, { status: 500 });
  }
}
