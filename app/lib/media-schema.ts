export const MEDIA_STORAGE_TYPES: ReadonlySet<string> = new Set(["R2", "PUBLIC"]);

export const MEDIA_CATEGORIES: ReadonlySet<string> = new Set([
  "GENERAL",
  "GALLERY",
  "DOCTOR",
  "BLOG",
  "VIDEO_POSTER",
]);

export const MEDIA_RIGHTS_STATUSES: ReadonlySet<string> = new Set([
  "UNVERIFIED",
  "VERIFIED_INTERNAL",
  "LICENSED",
  "PUBLIC_DOMAIN",
]);

export const MEDIA_PURGE_STATUSES: ReadonlySet<string> = new Set([
  "NONE",
  "CANDIDATE",
  "BLOCKED",
  "READY",
  "FAILED",
  "PURGED",
]);

export const GALLERY_LIFECYCLE_STATUSES: ReadonlySet<string> = new Set([
  "DRAFT",
  "IN_REVIEW",
  "PUBLISHED",
  "HIDDEN",
  "ARCHIVED",
]);

export const M0003_MEDIA_ASSET_COLUMNS = [
  "storage_type",
  "public_path",
  "display_r2_key",
  "display_public_path",
  "display_content_type",
  "display_size_bytes",
  "thumbnail_r2_key",
  "thumbnail_public_path",
  "thumbnail_content_type",
  "thumbnail_size_bytes",
  "title",
  "alt_text",
  "caption",
  "width",
  "height",
  "checksum_sha256",
  "category",
  "rights_status",
  "rights_source",
  "source_url",
  "updated_at",
  "published_at",
  "cleanup_candidate_at",
  "purge_after",
  "purge_status",
  "purge_error",
] as const;

export const M0003_TABLES = [
  "gallery_sections",
  "gallery_items",
] as const;

export const M0003_INDEXES = [
  "idx_media_lifecycle_category_created",
  "idx_media_active_public_path",
  "idx_media_active_checksum",
  "idx_gallery_sections_lifecycle_order",
  "idx_gallery_items_section_lifecycle_order",
  "idx_gallery_items_media_deleted",
  "idx_gallery_items_active_slot",
] as const;

export const M0003_PUBLIC_SEED_IDS = [
  "media-public-gallery-front-exterior-hero",
  "media-public-gallery-front-exterior-wide",
  "media-public-gallery-reception",
  "media-public-gallery-corridor",
  "media-public-gallery-ward-bed-01",
  "media-public-gallery-patient-room-twin",
  "media-public-gallery-patient-room-single",
] as const;

export const M0003_GALLERY_SECTION_ID = "gallery-section-facilities";

export const M0003_GALLERY_ITEM_IDS = [
  "gallery-item-hero",
  "gallery-item-wide",
  "gallery-item-reception",
  "gallery-item-corridor",
  "gallery-item-ward",
  "gallery-item-twin",
  "gallery-item-single",
] as const;

export function isPublicStorage(storageType: string): boolean {
  return storageType === "PUBLIC";
}

export function isValidMediaCategory(category: string): boolean {
  return MEDIA_CATEGORIES.has(category);
}

export function isValidRightsStatus(status: string): boolean {
  return MEDIA_RIGHTS_STATUSES.has(status);
}

export function isValidPurgeStatus(status: string): boolean {
  return MEDIA_PURGE_STATUSES.has(status);
}

export function isDormantAsset(row: {
  status: string;
  is_visible: number;
  lifecycle_status: string;
}): boolean {
  return row.status === "HIDDEN" && row.is_visible === 0 && row.lifecycle_status === "DRAFT";
}

export function isDormantGalleryRow(row: {
  lifecycle_status: string;
}): boolean {
  return row.lifecycle_status === "DRAFT";
}

export interface SchemaColumnReport {
  table: string;
  column: string;
  type: string;
  notNull: number;
  defaultValue: unknown;
}

export interface SchemaIndexReport {
  tableName: string;
  indexName: string;
  unique: number;
  origin: string;
  partial: number;
}

export function collectSchemaReport(db: {
  prepare: (sql: string) => { all: () => unknown[] };
}): {
  tables: string[];
  columns: SchemaColumnReport[];
  indexes: SchemaIndexReport[];
  mediaAssetColumnNames: string[];
  gallerySectionColumnNames: string[];
  galleryItemColumnNames: string[];
} {
  const rawTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations'").all() as { name: string }[];
  const tables = rawTables.map((r) => r.name).sort();

  const columns: SchemaColumnReport[] = [];
  for (const table of tables) {
    const info = db.prepare(`PRAGMA table_info('${table}')`).all() as { cid: number; name: string; type: string; notnull: number; dflt_value: unknown }[];
    for (const col of info) {
      columns.push({
        table,
        column: col.name,
        type: col.type,
        notNull: col.notnull,
        defaultValue: col.dflt_value,
      });
    }
  }

  const indexes: SchemaIndexReport[] = [];
  for (const table of tables) {
    const idxInfo = db.prepare(`PRAGMA index_list('${table}')`).all() as { seq: number; name: string; unique: number; origin: string; partial: number }[];
    for (const idx of idxInfo) {
      indexes.push({
        tableName: table,
        indexName: idx.name,
        unique: idx.unique,
        origin: idx.origin,
        partial: idx.partial,
      });
    }
  }

  const mediaAssetColumnNames = columns
    .filter((c) => c.table === "media_assets")
    .map((c) => c.column);

  const gallerySectionColumnNames = columns
    .filter((c) => c.table === "gallery_sections")
    .map((c) => c.column);

  const galleryItemColumnNames = columns
    .filter((c) => c.table === "gallery_items")
    .map((c) => c.column);

  return { tables, columns, indexes, mediaAssetColumnNames, gallerySectionColumnNames, galleryItemColumnNames };
}

export function assertMediaGallerySchemaCapabilities(db: {
  prepare: (sql: string) => { all: () => unknown[] };
}): { ok: true; report: ReturnType<typeof collectSchemaReport> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const report = collectSchemaReport(db);

  for (const table of M0003_TABLES) {
    if (!report.tables.includes(table)) {
      errors.push(`Missing table: ${table}`);
    }
  }

  for (const col of M0003_MEDIA_ASSET_COLUMNS) {
    if (!report.mediaAssetColumnNames.includes(col)) {
      errors.push(`Missing media_assets column: ${col}`);
    }
  }

  if (report.gallerySectionColumnNames.length === 0 && report.tables.includes("gallery_sections")) {
    errors.push("gallery_sections table exists but has no columns reported");
  }

  if (report.galleryItemColumnNames.length === 0 && report.tables.includes("gallery_items")) {
    errors.push("gallery_items table exists but has no columns reported");
  }

  const indexNames = report.indexes.map((i) => i.indexName);
  for (const idx of M0003_INDEXES) {
    if (!indexNames.includes(idx)) {
      errors.push(`Missing index: ${idx}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, report };
}
