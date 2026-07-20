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
  prepare: (sql: string) => { all: () => unknown[]; get: (...args: unknown[]) => unknown };
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

function normalizeSql(sql: string): string {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const EXPECTED_INDEX_COLUMNS: Record<string, string[]> = {
  idx_media_lifecycle_category_created: ["lifecycle_status", "category", "created_at"],
  idx_media_active_public_path: ["public_path"],
  idx_media_active_checksum: ["storage_type", "checksum_sha256"],
  idx_gallery_sections_lifecycle_order: ["lifecycle_status", "sort_order", "id"],
  idx_gallery_items_section_lifecycle_order: ["section_id", "lifecycle_status", "sort_order", "id"],
  idx_gallery_items_media_deleted: ["media_id", "deleted_at"],
  idx_gallery_items_active_slot: ["slot_key"],
};

const EXPECTED_INDEX_PREDICATES: Record<string, string[]> = {
  idx_media_active_public_path: ["storage_type = 'public'", "public_path is not null", "deleted_at is null"],
  idx_media_active_checksum: ["checksum_sha256 is not null", "deleted_at is null", "purge_status != 'purged'"],
  idx_gallery_items_active_slot: ["slot_key is not null", "deleted_at is null"],
};

const GALLERY_LIFECYCLE_ENUM_PATTERN = "lifecycle_status in ('draft','in_review','published','hidden','archived')";

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
    if (sectionFk.onDelete.toUpperCase() !== "RESTRICT") {
      errors.push(`gallery_items.section_id FK onDelete is ${sectionFk.onDelete.toUpperCase()}, expected RESTRICT`);
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
    if (mediaFk.onDelete.toUpperCase() !== "RESTRICT") {
      errors.push(`gallery_items.media_id FK onDelete is ${mediaFk.onDelete.toUpperCase()}, expected RESTRICT`);
    }
  }

  const indexNames = report.indexes.map((i) => i.indexName);
  for (const idx of M0003_INDEXES) {
    if (!indexNames.includes(idx)) {
      errors.push(`Missing index: ${idx}`);
    }
  }

  for (const idxName of M0003_INDEXES) {
    const expectedCols = EXPECTED_INDEX_COLUMNS[idxName];
    if (!expectedCols) continue;
    const idx = report.indexes.find((i) => i.indexName === idxName);
    if (!idx) continue;
    const actualCols = [...idx.columns].sort((a, b) => a.seq - b.seq).map((c) => c.name);
    if (actualCols.length !== expectedCols.length || !actualCols.every((c, i) => c === expectedCols[i])) {
      errors.push(`${idxName} columns [${actualCols.join(", ")}] do not match expected [${expectedCols.join(", ")}]`);
    }
  }

  for (const [idxName, predicates] of Object.entries(EXPECTED_INDEX_PREDICATES)) {
    const idx = report.indexes.find((i) => i.indexName === idxName);
    if (!idx || !idx.createSql) continue;
    const normalized = normalizeSql(idx.createSql).replace(/<>/g, "!=");
    for (const pred of predicates) {
      if (!normalized.includes(pred)) {
        errors.push(`${idxName} predicate missing: ${pred}`);
      }
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

  for (const tableName of ["gallery_sections", "gallery_items"] as const) {
    const createSql = tableName === "gallery_sections" ? report.gallerySectionCreateSql : report.galleryItemCreateSql;
    if (!createSql) {
      errors.push(`${tableName} CREATE TABLE SQL missing from sqlite_master`);
      continue;
    }
    const normalized = normalizeSql(createSql);
    if (!normalized.includes(GALLERY_LIFECYCLE_ENUM_PATTERN)) {
      errors.push(`${tableName} CREATE TABLE missing lifecycle_status CHECK enum`);
    }
    if (!normalized.includes("check (version >= 1)")) {
      errors.push(`${tableName} CREATE TABLE missing version >= 1 CHECK`);
    }
    if (!normalized.includes("check (sort_order >= 0)")) {
      errors.push(`${tableName} CREATE TABLE missing sort_order >= 0 CHECK`);
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
  expected_seed_count: number;
  expected_seed_ids_found: string[];
  expected_seed_ids_missing: string[];
  dormant_expected_seed_count: number;
  expected_section_present: boolean;
  expected_section_dormant: boolean;
  expected_item_count: number;
  expected_item_ids_found: string[];
  expected_item_ids_missing: string[];
  total_public_asset_count: number;
  total_section_count: number;
  total_item_count: number;
}

export function inspectM1FoundationState(db: PragmaDb): M1FoundationState {
  const markerRow = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get() as { value: string } | undefined;

  const allPublicIds: string[] = [];
  let dormantExpectedCount = 0;
  try {
    const allPublic = db.prepare("SELECT id FROM media_assets WHERE storage_type = 'PUBLIC'").all() as { id: string }[];
    for (const r of allPublic) allPublicIds.push(r.id);
    for (const expectedId of M0003_PUBLIC_SEED_IDS) {
      const row = db.prepare("SELECT status, is_visible, lifecycle_status FROM media_assets WHERE id = ?").get(expectedId) as { status: string; is_visible: number; lifecycle_status: string } | undefined;
      if (row && isDormantAsset(row)) {
        dormantExpectedCount++;
      }
    }
  } catch {
    // storage_type column may not exist pre-0003
  }
  const expectedSeedIdsFound = M0003_PUBLIC_SEED_IDS.filter((id) => allPublicIds.includes(id));
  const expectedSeedIdsMissing = M0003_PUBLIC_SEED_IDS.filter((id) => !allPublicIds.includes(id));

  let expectedSectionPresent = false;
  let expectedSectionDormant = false;
  let totalSectionCount = 0;
  let totalItemCount = 0;
  try {
    const sectionRow = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(M0003_GALLERY_SECTION_ID) as { lifecycle_status: string } | undefined;
    expectedSectionPresent = !!sectionRow;
    if (sectionRow) {
      expectedSectionDormant = isDormantGalleryRow(sectionRow);
    }
    const sectionCountRow = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_sections").get() as { cnt: number };
    totalSectionCount = sectionCountRow.cnt;
    const itemCountRow = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_items").get() as { cnt: number };
    totalItemCount = itemCountRow.cnt;
  } catch {
    // gallery tables may not exist pre-0003
  }

  const allItemIds: string[] = [];
  try {
    const items = db.prepare("SELECT id FROM gallery_items").all() as { id: string }[];
    for (const r of items) allItemIds.push(r.id);
  } catch {
    // gallery tables may not exist
  }
  const expectedItemIdsFound = M0003_GALLERY_ITEM_IDS.filter((id) => allItemIds.includes(id));
  const expectedItemIdsMissing = M0003_GALLERY_ITEM_IDS.filter((id) => !allItemIds.includes(id));

  return {
    gallery_v2_initialized_exists: !!markerRow,
    gallery_v2_initialized_value: markerRow?.value ?? null,
    expected_seed_count: expectedSeedIdsFound.length,
    expected_seed_ids_found: expectedSeedIdsFound,
    expected_seed_ids_missing: expectedSeedIdsMissing,
    dormant_expected_seed_count: dormantExpectedCount,
    expected_section_present: expectedSectionPresent,
    expected_section_dormant: expectedSectionDormant,
    expected_item_count: expectedItemIdsFound.length,
    expected_item_ids_found: expectedItemIdsFound,
    expected_item_ids_missing: expectedItemIdsMissing,
    total_public_asset_count: allPublicIds.length,
    total_section_count: totalSectionCount,
    total_item_count: totalItemCount,
  };
}
