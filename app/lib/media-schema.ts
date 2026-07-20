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

export const REQUIRED_GALLERY_SECTION_COLUMNS = [
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

export const REQUIRED_GALLERY_ITEM_COLUMNS = [
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

export interface SchemaForeignKeyReport {
  table: string;
  from: string;
  referencedTable: string;
  to: string;
  onDelete: string;
}

export interface SchemaIndexColumnReport {
  seq: number;
  name: string;
  unique: number;
}

export interface SchemaIndexReport {
  tableName: string;
  indexName: string;
  unique: number;
  origin: string;
  partial: number;
  createSql: string;
  columns: SchemaIndexColumnReport[];
}

export interface SchemaTableSqlReport {
  tableName: string;
  createSql: string;
}

export interface SchemaReport {
  tables: string[];
  columns: SchemaColumnReport[];
  indexes: SchemaIndexReport[];
  foreignKeys: SchemaForeignKeyReport[];
  mediaAssetColumnNames: string[];
  gallerySectionColumnNames: string[];
  galleryItemColumnNames: string[];
  gallerySectionCreateSql: string;
  galleryItemCreateSql: string;
}

type PragmaDb = {
  prepare: (sql: string) => { all: () => unknown[]; get: () => unknown };
};

export function collectSchemaReport(db: PragmaDb): SchemaReport {
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
      const idxDetail = db.prepare(`PRAGMA index_info('${idx.name}')`).all() as { seqno: number; cid: number; name: string }[];
      const columns = idxDetail.map((c) => ({ seq: c.seqno, name: c.name, unique: idx.unique }));

      const row = db.prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name='${idx.name}'`).get() as { sql: string } | undefined;

      indexes.push({
        tableName: table,
        indexName: idx.name,
        unique: idx.unique,
        origin: idx.origin,
        partial: idx.partial,
        createSql: row?.sql ?? "",
        columns,
      });
    }
  }

  const foreignKeys: SchemaForeignKeyReport[] = [];
  for (const table of tables) {
    const fks = db.prepare(`PRAGMA foreign_key_list('${table}')`).all() as { table: string; from: string; to: string; on_delete: string }[];
    for (const fk of fks) {
      foreignKeys.push({
        table,
        from: fk.from,
        referencedTable: fk.table,
        to: fk.to,
        onDelete: fk.on_delete,
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

  const sectionRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='gallery_sections'").get() as { sql: string } | undefined;
  const itemRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='gallery_items'").get() as { sql: string } | undefined;

  return {
    tables,
    columns,
    indexes,
    foreignKeys,
    mediaAssetColumnNames,
    gallerySectionColumnNames,
    galleryItemColumnNames,
    gallerySectionCreateSql: sectionRow?.sql ?? "",
    galleryItemCreateSql: itemRow?.sql ?? "",
  };
}

export function assertMediaGallerySchemaCapabilities(db: PragmaDb): { ok: true; report: SchemaReport } | { ok: false; errors: string[] } {
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

  for (const col of REQUIRED_GALLERY_SECTION_COLUMNS) {
    if (!report.gallerySectionColumnNames.includes(col)) {
      errors.push(`Missing gallery_sections column: ${col}`);
    }
  }

  for (const col of REQUIRED_GALLERY_ITEM_COLUMNS) {
    if (!report.galleryItemColumnNames.includes(col)) {
      errors.push(`Missing gallery_items column: ${col}`);
    }
  }

  const sectionFk = report.foreignKeys.find((fk) => fk.table === "gallery_items" && fk.from === "section_id");
  if (!sectionFk) {
    errors.push("gallery_items missing FOREIGN KEY on section_id -> gallery_sections.id");
  } else {
    if (sectionFk.referencedTable !== "gallery_sections") {
      errors.push(`gallery_items.section_id FK references ${sectionFk.referencedTable} instead of gallery_sections`);
    }
    if (sectionFk.to !== "id") {
      errors.push(`gallery_items.section_id FK references ${sectionFk.to} instead of id`);
    }
  }

  const mediaFk = report.foreignKeys.find((fk) => fk.table === "gallery_items" && fk.from === "media_id");
  if (!mediaFk) {
    errors.push("gallery_items missing FOREIGN KEY on media_id -> media_assets.id");
  } else {
    if (mediaFk.referencedTable !== "media_assets") {
      errors.push(`gallery_items.media_id FK references ${mediaFk.referencedTable} instead of media_assets`);
    }
    if (mediaFk.to !== "id") {
      errors.push(`gallery_items.media_id FK references ${mediaFk.to} instead of id`);
    }
  }

  const indexNames = report.indexes.map((i) => i.indexName);
  for (const idx of M0003_INDEXES) {
    if (!indexNames.includes(idx)) {
      errors.push(`Missing index: ${idx}`);
    }
  }

  const publicPathIdx = report.indexes.find((i) => i.indexName === "idx_media_active_public_path");
  if (publicPathIdx) {
    if (!publicPathIdx.unique) {
      errors.push("idx_media_active_public_path must be UNIQUE");
    }
    if (!publicPathIdx.partial) {
      errors.push("idx_media_active_public_path must be a partial index");
    }
  }

  const checksumIdx = report.indexes.find((i) => i.indexName === "idx_media_active_checksum");
  if (checksumIdx) {
    if (!checksumIdx.unique) {
      errors.push("idx_media_active_checksum must be UNIQUE");
    }
    if (!checksumIdx.partial) {
      errors.push("idx_media_active_checksum must be a partial index");
    }
  }

  const slotIdx = report.indexes.find((i) => i.indexName === "idx_gallery_items_active_slot");
  if (slotIdx) {
    if (!slotIdx.unique) {
      errors.push("idx_gallery_items_active_slot must be UNIQUE");
    }
    if (!slotIdx.partial) {
      errors.push("idx_gallery_items_active_slot must be a partial index");
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, report };
}

export interface M1FoundationState {
  gallery_v2_initialized_exists: boolean;
  gallery_v2_initialized_value: string | null;
  public_seed_count: number;
  public_seed_ids_found: string[];
  public_seed_ids_missing: string[];
  dormant_seed_count: number;
  section_count: number;
  item_count: number;
}

export function inspectM1FoundationState(db: PragmaDb): M1FoundationState {
  const markerRow = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get() as { value: string } | undefined;

  let publicSeedIds: string[] = [];
  let dormantSeedCount = 0;
  try {
    const publicSeeds = db.prepare("SELECT id FROM media_assets WHERE storage_type = 'PUBLIC'").all() as { id: string }[];
    publicSeedIds = publicSeeds.map((r) => r.id);
    const dormantSeeds = db.prepare(
      "SELECT COUNT(*) AS cnt FROM media_assets WHERE storage_type = 'PUBLIC' AND status = 'HIDDEN' AND is_visible = 0 AND lifecycle_status = 'DRAFT'"
    ).get() as { cnt: number };
    dormantSeedCount = dormantSeeds.cnt;
  } catch {
    // storage_type column may not exist pre-0003
  }
  const missingSeeds = M0003_PUBLIC_SEED_IDS.filter((id) => !publicSeedIds.includes(id));

  let sectionCount = 0;
  let itemCount = 0;
  try {
    const sectionRow = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_sections").get() as { cnt: number };
    sectionCount = sectionRow.cnt;
    const itemRow = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_items").get() as { cnt: number };
    itemCount = itemRow.cnt;
  } catch {
    // gallery tables may not exist pre-0003
  }

  return {
    gallery_v2_initialized_exists: !!markerRow,
    gallery_v2_initialized_value: markerRow?.value ?? null,
    public_seed_count: publicSeedIds.length,
    public_seed_ids_found: publicSeedIds,
    public_seed_ids_missing: missingSeeds,
    dormant_seed_count: dormantSeedCount,
    section_count: sectionCount,
    item_count: itemCount,
  };
}
