/**
 * Gallery v2 domain module.
 *
 * Pure runtime-safe TypeScript — no Node-only, React, or test imports.
 * Handles slug normalization, lifecycle validation, pagination parsing,
 * DTO mapping, query helpers, atomic reorder, and publication guards
 * for gallery sections and items.
 */

import { query, run } from "./server";
import { slugify, clean } from "./utils";
import {
  resolveMediaUrls,
} from "./media-library";

/* ───────────────────────────────────────────────────────────────────────────
   Constants
   ─────────────────────────────────────────────────────────────────────────── */

export const GALLERY_SECTIONS_COLUMNS = [
  "id",
  "slug",
  "name",
  "description",
  "sort_order",
  "lifecycle_status",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "published_at",
  "deleted_at",
] as const;

export const GALLERY_ITEMS_COLUMNS = [
  "id",
  "section_id",
  "media_id",
  "slot_key",
  "title_override",
  "alt_text_override",
  "caption_override",
  "sort_order",
  "lifecycle_status",
  "version",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "published_at",
  "deleted_at",
] as const;

export const GALLERY_SECTIONS_SELECT = GALLERY_SECTIONS_COLUMNS.join(", ");
export const GALLERY_ITEMS_SELECT = GALLERY_ITEMS_COLUMNS.join(", ");

export const GALLERY_FIELD_LENGTHS: Record<string, number> = {
  slug: 100,
  name: 200,
  description: 1000,
  slotKey: 150,
  titleOverride: 200,
  altTextOverride: 300,
  captionOverride: 1000,
};

/* ───────────────────────────────────────────────────────────────────────────
   Types
   ─────────────────────────────────────────────────────────────────────────── */

export type GallerySectionRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  lifecycle_status: string;
  version: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
};

export type GalleryItemRow = {
  id: string;
  section_id: string;
  media_id: string;
  slot_key: string | null;
  title_override: string;
  alt_text_override: string;
  caption_override: string;
  sort_order: number;
  lifecycle_status: string;
  version: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
};

export type AdminGallerySectionDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  lifecycleStatus: string;
  version: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  itemCount: number;
  publishedItemCount: number;
};

export type AdminGalleryItemDto = {
  id: string;
  sectionId: string;
  mediaId: string;
  slotKey: string | null;
  titleOverride: string;
  altTextOverride: string;
  captionOverride: string;
  sortOrder: number;
  lifecycleStatus: string;
  version: number;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  deletedAt: string | null;
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
};

export type PublicGallerySectionDto = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  items: PublicGalleryItemDto[];
};

export type PublicGalleryItemDto = {
  slug: string;
  slotKey: string | null;
  title: string;
  altText: string;
  caption: string;
  width: number | null;
  height: number | null;
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
};

/* ───────────────────────────────────────────────────────────────────────────
   Slug normalization
   ─────────────────────────────────────────────────────────────────────────── */

export function normalizeSlug(input: unknown): string | null {
  const slug = slugify(clean(input, GALLERY_FIELD_LENGTHS.slug));
  return slug.length > 0 ? slug : null;
}

/* ───────────────────────────────────────────────────────────────────────────
   Pagination parsing
   ─────────────────────────────────────────────────────────────────────────── */

export function parseGalleryLimit(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: 25 };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return { ok: false, error: "limit must be a positive integer." };
  if (n > 100) return { ok: false, error: "limit must be at most 100." };
  return { ok: true, value: n };
}

export function parseGalleryOffset(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: 0 };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { ok: false, error: "offset must be a non-negative integer." };
  return { ok: true, value: n };
}

export function parseSortOrder(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: 0 };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    return { ok: false, error: "sortOrder must be a non-negative integer." };
  }
  return { ok: true, value: raw };
}

export function parseVersion(raw: unknown): number | null {
  if (typeof raw !== "number") return null;
  if (!Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

/* ───────────────────────────────────────────────────────────────────────────
   DTO mapping
   ─────────────────────────────────────────────────────────────────────────── */

export function toSectionAdminDto(
  row: GallerySectionRow,
  itemCount: number,
  publishedItemCount: number,
): AdminGallerySectionDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    lifecycleStatus: row.lifecycle_status,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    itemCount,
    publishedItemCount,
  };
}

export type ItemRowWithMedia = GalleryItemRow & {
  storage_type: string;
  r2_key: string;
  public_path: string | null;
  display_r2_key: string | null;
  display_public_path: string | null;
  thumbnail_r2_key: string | null;
  thumbnail_public_path: string | null;
  title: string;
  alt_text: string;
  caption: string;
  width: number | null;
  height: number | null;
};

function mediaRowFromItem(row: ItemRowWithMedia) {
  return {
    storage_type: row.storage_type,
    r2_key: row.r2_key,
    public_path: row.public_path,
    display_r2_key: row.display_r2_key,
    display_public_path: row.display_public_path,
    thumbnail_r2_key: row.thumbnail_r2_key,
    thumbnail_public_path: row.thumbnail_public_path,
  };
}

export function toItemAdminDto(row: ItemRowWithMedia): AdminGalleryItemDto {
  const urlResult = resolveMediaUrls(mediaRowFromItem(row));
  if (!urlResult.ok) {
    throw new Error(`Failed to resolve media URLs for item ${row.id} (media ${row.media_id}): ${urlResult.error}`);
  }

  return {
    id: row.id,
    sectionId: row.section_id,
    mediaId: row.media_id,
    slotKey: row.slot_key,
    titleOverride: row.title_override,
    altTextOverride: row.alt_text_override,
    captionOverride: row.caption_override,
    sortOrder: row.sort_order,
    lifecycleStatus: row.lifecycle_status,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    originalUrl: urlResult.urls.originalUrl!,
    displayUrl: urlResult.urls.displayUrl!,
    thumbnailUrl: urlResult.urls.thumbnailUrl!,
  };
}

export function toItemPublicDto(row: ItemRowWithMedia): PublicGalleryItemDto {
  const urlResult = resolveMediaUrls(mediaRowFromItem(row));
  if (!urlResult.ok) {
    throw new Error(`Failed to resolve media URLs for item ${row.id} (media ${row.media_id}): ${urlResult.error}`);
  }

  return {
    slug: row.slot_key || row.id,
    slotKey: row.slot_key,
    title: row.title_override || row.title || "",
    altText: row.alt_text_override || row.alt_text || "",
    caption: row.caption_override || row.caption || "",
    width: row.width ?? null,
    height: row.height ?? null,
    originalUrl: urlResult.urls.originalUrl!,
    displayUrl: urlResult.urls.displayUrl!,
    thumbnailUrl: urlResult.urls.thumbnailUrl!,
  };
}

export function toSectionPublicDto(
  section: GallerySectionRow,
  items: PublicGalleryItemDto[],
): PublicGallerySectionDto {
  return {
    slug: section.slug,
    name: section.name,
    description: section.description,
    sortOrder: section.sort_order,
    items,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   Item query helper (sections + media join)
   ─────────────────────────────────────────────────────────────────────────── */

const ITEM_WITH_MEDIA_COLUMNS = [
  ...GALLERY_ITEMS_COLUMNS.map((c) => `gi.${c}`),
  "m.storage_type",
  "m.r2_key",
  "m.public_path",
  "m.display_r2_key",
  "m.display_public_path",
  "m.thumbnail_r2_key",
  "m.thumbnail_public_path",
  "m.title",
  "m.alt_text",
  "m.caption",
  "m.width",
  "m.height",
].join(", ");

export const ITEM_WITH_MEDIA_SELECT = ITEM_WITH_MEDIA_COLUMNS;

export async function fetchItemsWithMedia(
  conditions: string[],
  binds: unknown[],
  orderClause: string,
): Promise<ItemRowWithMedia[]> {
  const sql = `SELECT ${ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""} ${orderClause}`;
  const result = await query<ItemRowWithMedia>(sql, ...binds);
  return result.results ?? [];
}

export async function countItems(conditions: string[], binds: unknown[]): Promise<number> {
  const sql = `SELECT COUNT(*) AS total FROM gallery_items ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}`;
  const result = await query<{ total: number }>(sql, ...binds);
  return result.results?.[0]?.total ?? 0;
}

export async function countSections(conditions: string[], binds: unknown[]): Promise<number> {
  const sql = `SELECT COUNT(*) AS total FROM gallery_sections ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}`;
  const result = await query<{ total: number }>(sql, ...binds);
  return result.results?.[0]?.total ?? 0;
}

export async function countItemsInSection(sectionId: string): Promise<number> {
  return countItems(["section_id = ?"], [sectionId]);
}

export async function countPublishedItemsInSection(sectionId: string): Promise<number> {
  return countItems(
    ["section_id = ?", "lifecycle_status = 'PUBLISHED'", "deleted_at IS NULL"],
    [sectionId],
  );
}

/* ───────────────────────────────────────────────────────────────────────────
   Slug & slot uniqueness checks
   ─────────────────────────────────────────────────────────────────────────── */

export async function isSectionSlugAvailable(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  let sql = "SELECT id FROM gallery_sections WHERE slug = ?";
  const binds: unknown[] = [slug];
  if (excludeId) {
    sql += " AND id != ?";
    binds.push(excludeId);
  }
  sql += " AND deleted_at IS NULL LIMIT 1";
  const result = await query(sql, ...binds);
  return !result.results || result.results.length === 0;
}

export async function isSlotKeyAvailable(
  slotKey: string,
  excludeId?: string,
): Promise<boolean> {
  let sql = "SELECT id FROM gallery_items WHERE slot_key = ?";
  const binds: unknown[] = [slotKey];
  if (excludeId) {
    sql += " AND id != ?";
    binds.push(excludeId);
  }
  sql += " AND deleted_at IS NULL LIMIT 1";
  const result = await query(sql, ...binds);
  return !result.results || result.results.length === 0;
}

/* ───────────────────────────────────────────────────────────────────────────
   published_at management
   ─────────────────────────────────────────────────────────────────────────── */

export function publishedAtSql(
  currentStatus: string,
  newStatus: string,
  currentPublishedAt: string | null,
): string | null {
  const publishingNow = newStatus === "PUBLISHED" && currentStatus !== "PUBLISHED";
  const unpublishingNow = newStatus !== "PUBLISHED" && currentStatus === "PUBLISHED";

  if (publishingNow && !currentPublishedAt) {
    return "published_at = CURRENT_TIMESTAMP";
  }
  if (unpublishingNow) {
    return "published_at = NULL";
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────────────────
   Publication guard SQL fragments
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Section publication guard: requires at least one active PUBLISHED gallery item
 * with a PUBLISHED/APPROVED/visible GALLERY-category media asset.
 * Appended to WHERE when transitioning lifecycle_status → PUBLISHED.
 */
export const SECTION_PUBLISHED_GUARD = `EXISTS (
  SELECT 1 FROM gallery_items gi
  INNER JOIN media_assets m ON gi.media_id = m.id
  WHERE gi.section_id = gallery_sections.id
    AND gi.lifecycle_status = 'PUBLISHED'
    AND gi.deleted_at IS NULL
    AND m.category = 'GALLERY'
    AND m.lifecycle_status = 'PUBLISHED'
    AND m.status = 'APPROVED'
    AND m.is_visible = 1
    AND m.deleted_at IS NULL
)`;

/**
 * Item publication guard (section): parent section must exist and not be deleted.
 * Item publication guard (media): media must be GALLERY, PUBLISHED, APPROVED, visible, not deleted.
 * Appended to WHERE when transitioning lifecycle_status → PUBLISHED.
 */
export const ITEM_SECTION_GUARD = `EXISTS (
  SELECT 1 FROM gallery_sections gs
  WHERE gs.id = gallery_items.section_id
    AND gs.deleted_at IS NULL
)`;

export const ITEM_MEDIA_GUARD = `EXISTS (
  SELECT 1 FROM media_assets m
  WHERE m.id = gallery_items.media_id
    AND m.category = 'GALLERY'
    AND m.lifecycle_status = 'PUBLISHED'
    AND m.status = 'APPROVED'
    AND m.is_visible = 1
    AND m.deleted_at IS NULL
)`;

/* ───────────────────────────────────────────────────────────────────────────
   Atomic reorder helper
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Single-statement atomic reorder using CASE id WHEN ... THEN ... END.
 * Every item's version is checked in the same WHERE clause.
 * Pre-conditions (caller must verify BEFORE calling):
 *   - Section exists and is not deleted
 *   - Every payload ID belongs to this section and is active
 *   - Every expectedVersion matches the live version
 *   - payload count === active item count (no item omitted)
 *
 * Returns the number of rows actually changed. Caller must verify
 * changes === itemOrder.length to detect concurrent modification.
 */
export async function applyAtomicReorder(
  sectionId: string,
  itemOrder: Array<{ id: string; version: number }>,
  actorEmail: string,
): Promise<number> {
  if (itemOrder.length === 0) return 0;

  const ids = itemOrder.map((e) => e.id);

  const sortCaseParts = itemOrder.map(() => "WHEN ? THEN ?");
  const sortCaseBinds = itemOrder.flatMap((e, i) => [e.id, i]);

  const inPlaceholders = ids.map(() => "?").join(", ");

  const verifiedOrParts = itemOrder.map(() => "(verified.id = ? AND verified.version = ?)");
  const verifiedOrBinds = itemOrder.flatMap((e) => [e.id, e.version]);

  const sql = `
    UPDATE gallery_items
    SET sort_order = CASE id ${sortCaseParts.join(" ")} END,
        version = version + 1,
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE section_id = ?
      AND deleted_at IS NULL
      AND id IN (${inPlaceholders})
      AND (
        SELECT COUNT(*)
        FROM gallery_items AS all_active
        WHERE all_active.section_id = ?
          AND all_active.deleted_at IS NULL
      ) = ?
      AND (
        SELECT COUNT(*)
        FROM gallery_items AS verified
        WHERE verified.section_id = ?
          AND verified.deleted_at IS NULL
          AND (
            ${verifiedOrParts.join(" OR ")}
          )
      ) = ?
  `;

  const binds = [
    ...sortCaseBinds,
    actorEmail,
    sectionId,
    ...ids,
    sectionId,
    itemOrder.length,
    sectionId,
    ...verifiedOrBinds,
    itemOrder.length,
  ];

  const result = await run(sql, ...binds);
  return result.meta?.changes ?? 0;
}

/* ───────────────────────────────────────────────────────────────────────────
   Publication guard validation (application-level for media URLs)
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Validates that a media asset's storage locator resolves correctly.
 * Throws with a descriptive message if resolution fails.
 */
export function validateMediaForPublication(
  mediaId: string,
  row: {
    storage_type: string;
    r2_key: string;
    public_path: string | null;
    display_r2_key: string | null;
    display_public_path: string | null;
    thumbnail_r2_key: string | null;
    thumbnail_public_path: string | null;
  },
): void {
  const result = resolveMediaUrls(row);
  if (!result.ok) {
    throw new Error(`Media ${mediaId} is not eligible for publication: ${result.error}`);
  }
}
