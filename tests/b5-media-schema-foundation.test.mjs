import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  MEDIA_STORAGE_TYPES,
  MEDIA_CATEGORIES,
  MEDIA_RIGHTS_STATUSES,
  MEDIA_PURGE_STATUSES,
  M0003_MEDIA_ASSET_COLUMNS,
  M0003_TABLES,
  M0003_INDEXES,
  M0003_PUBLIC_SEED_IDS,
  M0003_GALLERY_SECTION_ID,
  M0003_GALLERY_ITEM_IDS,
  REQUIRED_GALLERY_SECTION_COLUMNS,
  REQUIRED_GALLERY_ITEM_COLUMNS,
  isPublicStorage,
  isValidMediaCategory,
  isValidRightsStatus,
  isValidPurgeStatus,
  isDormantAsset,
  isDormantGalleryRow,
  collectSchemaReport,
  assertMediaGallerySchemaCapabilities,
  inspectM1FoundationState,
} from "../app/lib/media-schema.ts";

const BASELINE_SQL = await readFile(new URL("../migrations/0000_baseline.sql", import.meta.url), "utf8");
const MIGRATION_0001_SQL = await readFile(new URL("../migrations/0001_enforce_department_slot_exclusivity.sql", import.meta.url), "utf8");
const MIGRATION_0002_SQL = await readFile(new URL("../migrations/0002_add_content_lifecycle_foundation.sql", import.meta.url), "utf8");
const MIGRATION_0003_SQL = await readFile(new URL("../migrations/0003_add_media_library_and_gallery.sql", import.meta.url), "utf8");
const MIGRATION_0003_RAW = await readFile(new URL("../migrations/0003_add_media_library_and_gallery.sql", import.meta.url), "utf8");

const PROTECTED_HASHES = {
  "0000_baseline.sql": "F72C5CBA5D08DB5F46A178EF7792192D847B6EB8AD67AB2A008473A57ED01530",
  "0001_enforce_department_slot_exclusivity.sql": "95CC50AAC38ED9A4EC2F298EE67E652FF4DFA40DD23920DFB4D0D54A59F87BFB",
  "0002_add_content_lifecycle_foundation.sql": "69456A06436FAFCC8EF3C003FCC1E01E453B2B9D3410240940FED2ABEA7E5971",
};

function computeSha256(content) {
  return createHash("sha256").update(content).digest("hex").toUpperCase();
}

function createFullyMigratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(BASELINE_SQL);
  db.exec(MIGRATION_0001_SQL);
  db.exec(MIGRATION_0002_SQL);
  db.exec(MIGRATION_0003_SQL);
  return db;
}

function createPreM0003Db() {
  const db = new DatabaseSync(":memory:");
  db.exec(BASELINE_SQL);
  db.exec(MIGRATION_0001_SQL);
  db.exec(MIGRATION_0002_SQL);
  return db;
}

function insertLegacyMediaRow(db, opts) {
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status, deleted_at)
     VALUES (?, ?, ?, 'image/webp', 1024, ?, 'test@example.com', ?, ?, ?, ?, ?)`
  ).run(
    opts.id,
    opts.r2Key || `r2/${opts.id}`,
    opts.fileName || "test.webp",
    opts.purpose || "gallery",
    opts.consentNote || "",
    opts.status ?? "APPROVED",
    opts.isVisible ?? 1,
    opts.lifecycleStatus ?? "PUBLISHED",
    opts.deletedAt ?? null,
  );
}

function insertR2MediaRow(db, opts) {
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status, deleted_at)
     VALUES (?, ?, ?, 'image/webp', ?, ?, 'test@example.com', ?, ?, ?, ?, ?)`
  ).run(
    opts.id,
    opts.r2Key,
    opts.fileName || "test.webp",
    opts.sizeBytes || 1024,
    opts.purpose || "gallery",
    opts.consentNote || "",
    opts.status ?? "HIDDEN",
    opts.isVisible ?? 0,
    opts.lifecycleStatus ?? "DRAFT",
    opts.deletedAt ?? null,
  );
}

function getMediaCount(db) {
  return db.prepare(`SELECT COUNT(*) AS cnt FROM media_assets`).get().cnt;
}

function countTableRows(db, table) {
  const result = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`).get();
  return result.cnt;
}

function getRowById(db, table, id) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function getColumnNames(db, table) {
  return db.prepare(`SELECT name FROM pragma_table_info('${table}') ORDER BY cid`).all().map((r) => r.name);
}

function getIndexes(db, table) {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}' ORDER BY name`).all().map((r) => r.name);
}

function hasColumn(db, table, column) {
  const cols = getColumnNames(db, table);
  return cols.includes(column);
}

function getMediaRow(db, id) {
  return db.prepare(`SELECT * FROM media_assets WHERE id = ?`).get(id);
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function parseStatements(sql) {
  return stripSqlComments(sql).split(";").map((s) => s.trim()).filter((s) => s.length > 0);
}

function countAlterAdds(sql, table) {
  const stripped = stripSqlComments(sql);
  const regex = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+\\w+`, "gi");
  const matches = stripped.match(regex);
  return matches ? matches.length : 0;
}

function createDbWithMissingColumn(table, column) {
  const db = createFullyMigratedDb();
  if (table === "gallery_sections") {
    db.exec("DELETE FROM gallery_items");
  }
  const info = db.prepare(`PRAGMA table_info('${table}')`).all();
  const colNames = info.map((c) => c.name);
  const filteredNames = colNames.filter((n) => n !== column);
  const allRows = db.prepare(`SELECT * FROM ${table}`).all();
  db.exec(`DROP TABLE ${table}`);
  const colDefs = filteredNames.map((n) => `"${n}"`).join(", ");
  db.exec(`CREATE TABLE ${table} (${colDefs})`);
  for (const row of allRows) {
    const vals = filteredNames.map((n) => row[n]);
    const placeholders = vals.map(() => "?").join(", ");
    db.prepare(`INSERT INTO ${table} (${filteredNames.map((n) => `"${n}"`).join(", ")}) VALUES (${placeholders})`).run(...vals);
  }
  return db;
}

function createDbWithBrokenFk(breakType) {
  const db = createFullyMigratedDb();
  const allItems = db.prepare("SELECT * FROM gallery_items").all();
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE gallery_items");
  const fkClauses = [];
  if (breakType === "no-section-fk") {
    fkClauses.push("FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT");
  } else if (breakType === "no-media-fk") {
    fkClauses.push("FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT");
  } else if (breakType === "wrong-section-target") {
    fkClauses.push("FOREIGN KEY (section_id) REFERENCES media_assets(id) ON DELETE RESTRICT");
    fkClauses.push("FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT");
  } else if (breakType === "wrong-media-target") {
    fkClauses.push("FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT");
    fkClauses.push("FOREIGN KEY (media_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT");
  }
  const createSql = `CREATE TABLE gallery_items (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    slot_key TEXT,
    title_override TEXT NOT NULL DEFAULT '',
    alt_text_override TEXT NOT NULL DEFAULT '',
    caption_override TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    deleted_at TEXT,
    ${fkClauses.join(", ")}
  )`;
  db.exec(createSql);
  if (breakType !== "wrong-section-target" && breakType !== "wrong-media-target") {
    for (const row of allItems) {
      const cols = ["id", "section_id", "media_id", "slot_key", "title_override", "alt_text_override", "caption_override", "sort_order", "lifecycle_status", "version", "created_by", "updated_by", "created_at", "updated_at", "published_at", "deleted_at"];
      const vals = cols.map((n) => row[n]);
      const placeholders = cols.map(() => "?").join(", ");
      db.prepare(`INSERT INTO gallery_items (${cols.map((n) => `"${n}"`).join(", ")}) VALUES (${placeholders})`).run(...vals);
    }
  }
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function createDbWithNonUniqueIndex(idxName) {
  const db = createFullyMigratedDb();
  db.exec(`DROP INDEX IF EXISTS ${idxName}`);
  if (idxName === "idx_media_active_public_path") {
    db.exec(`CREATE INDEX ${idxName} ON media_assets(public_path) WHERE storage_type = 'PUBLIC' AND public_path IS NOT NULL AND deleted_at IS NULL`);
  } else if (idxName === "idx_media_active_checksum") {
    db.exec(`CREATE INDEX ${idxName} ON media_assets(storage_type, checksum_sha256) WHERE checksum_sha256 IS NOT NULL AND deleted_at IS NULL AND purge_status != 'PURGED'`);
  } else if (idxName === "idx_gallery_items_active_slot") {
    db.exec(`CREATE INDEX ${idxName} ON gallery_items(slot_key) WHERE slot_key IS NOT NULL AND deleted_at IS NULL`);
  }
  return db;
}

function createDbWithoutIndex(idxName) {
  const db = createFullyMigratedDb();
  db.exec(`DROP INDEX IF EXISTS ${idxName}`);
  return db;
}

const INDEX_TABLE_MAP = {
  idx_media_lifecycle_category_created: "media_assets",
  idx_media_active_public_path: "media_assets",
  idx_media_active_checksum: "media_assets",
  idx_gallery_sections_lifecycle_order: "gallery_sections",
  idx_gallery_items_section_lifecycle_order: "gallery_items",
  idx_gallery_items_media_deleted: "gallery_items",
  idx_gallery_items_active_slot: "gallery_items",
};

function createDbWithFkOnDelete(fkField, action) {
  const db = createFullyMigratedDb();
  const allItems = db.prepare("SELECT * FROM gallery_items").all();
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("DROP TABLE gallery_items");
  const sectionFk = fkField === "section_id"
    ? `FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE ${action}`
    : "FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT";
  const mediaFk = fkField === "media_id"
    ? `FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE ${action}`
    : "FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT";
  const createSql = `CREATE TABLE gallery_items (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    slot_key TEXT,
    title_override TEXT NOT NULL DEFAULT '',
    alt_text_override TEXT NOT NULL DEFAULT '',
    caption_override TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by TEXT NOT NULL,
    updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    deleted_at TEXT,
    ${sectionFk},
    ${mediaFk}
  )`;
  db.exec(createSql);
  for (const row of allItems) {
    const cols = ["id", "section_id", "media_id", "slot_key", "title_override", "alt_text_override", "caption_override", "sort_order", "lifecycle_status", "version", "created_by", "updated_by", "created_at", "updated_at", "published_at", "deleted_at"];
    const vals = cols.map((n) => row[n]);
    const placeholders = cols.map(() => "?").join(", ");
    db.prepare(`INSERT INTO gallery_items (${cols.map((n) => `"${n}"`).join(", ")}) VALUES (${placeholders})`).run(...vals);
  }
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function createDbWithWrongIndexColumns(idxName, wrongColumns) {
  const db = createFullyMigratedDb();
  db.exec(`DROP INDEX IF EXISTS ${idxName}`);
  const tableName = INDEX_TABLE_MAP[idxName];
  db.exec(`CREATE INDEX ${idxName} ON ${tableName}(${wrongColumns.join(", ")})`);
  return db;
}

const UNIQUE_INDEX_COLUMNS = {
  idx_media_active_public_path: ["public_path"],
  idx_media_active_checksum: ["storage_type", "checksum_sha256"],
  idx_gallery_items_active_slot: ["slot_key"],
};

function createDbWithWrongPredicate(idxName, wrongPredicate) {
  const db = createFullyMigratedDb();
  db.exec(`DROP INDEX IF EXISTS ${idxName}`);
  const tableName = INDEX_TABLE_MAP[idxName];
  const columns = UNIQUE_INDEX_COLUMNS[idxName];
  db.exec(`CREATE UNIQUE INDEX ${idxName} ON ${tableName}(${columns.join(", ")}) ${wrongPredicate}`);
  return db;
}

function createDbWithModifiedGalleryTable(tableName, newCreateSql) {
  const db = createFullyMigratedDb();
  db.exec("PRAGMA foreign_keys = OFF");
  if (tableName === "gallery_sections") {
    db.exec("DELETE FROM gallery_items");
  }
  db.exec(`DROP TABLE ${tableName}`);
  db.exec(newCreateSql);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

// ============================================================
// PART 1: Protected Hash Verification (3 tests)
// ============================================================

test("0000_baseline.sql SHA-256 matches protected constant", async () => {
  const content = await readFile(new URL("../migrations/0000_baseline.sql", import.meta.url), "utf8");
  const hash = computeSha256(content);
  assert.equal(hash, PROTECTED_HASHES["0000_baseline.sql"]);
});

test("0001 migration SHA-256 matches protected constant", async () => {
  const content = await readFile(new URL("../migrations/0001_enforce_department_slot_exclusivity.sql", import.meta.url), "utf8");
  const hash = computeSha256(content);
  assert.equal(hash, PROTECTED_HASHES["0001_enforce_department_slot_exclusivity.sql"]);
});

test("0002 migration SHA-256 matches protected constant", async () => {
  const content = await readFile(new URL("../migrations/0002_add_content_lifecycle_foundation.sql", import.meta.url), "utf8");
  const hash = computeSha256(content);
  assert.equal(hash, PROTECTED_HASHES["0002_add_content_lifecycle_foundation.sql"]);
});

// ============================================================
// PART 2: 0003 Additive Only / No Destructive SQL (4 tests)
// ============================================================

test("0003 migration contains no DROP TABLE statements", () => {
  const stripped = stripSqlComments(MIGRATION_0003_RAW);
  assert.ok(!/\bDROP\s+TABLE\b/i.test(stripped), "Migration 0003 must not contain DROP TABLE");
});

test("0003 migration contains no DROP INDEX statements", () => {
  const stripped = stripSqlComments(MIGRATION_0003_RAW);
  assert.ok(!/\bDROP\s+INDEX\b/i.test(stripped), "Migration 0003 must not contain DROP INDEX");
});

test("0003 migration contains no TRUNCATE statements", () => {
  const stripped = stripSqlComments(MIGRATION_0003_RAW);
  assert.ok(!/\bTRUNCATE\b/i.test(stripped), "Migration 0003 must not contain TRUNCATE");
});

test("0003 migration contains no DELETE FROM statements", () => {
  const stripped = stripSqlComments(MIGRATION_0003_RAW);
  assert.ok(!/\bDELETE\s+FROM\b/i.test(stripped), "Migration 0003 must not contain DELETE FROM");
});

// ============================================================
// PART 3: Migration 0003 statement inspection (1 test)
// ============================================================

test("parseStatements finds exactly 26 ALTER TABLE media_assets ADD COLUMN in migration 0003", () => {
  const stmts = parseStatements(MIGRATION_0003_RAW);
  const alterStmts = stmts.filter((s) => /^ALTER\s+TABLE\s+media_assets\s+ADD\s+COLUMN/i.test(s));
  assert.equal(alterStmts.length, 26, `Expected exactly 26 ALTER TABLE media_assets ADD COLUMN, found ${alterStmts.length}`);
});

// ============================================================
// PART 4: Enum set exactness (4 tests)
// ============================================================

test("MEDIA_STORAGE_TYPES contains exactly R2 and PUBLIC, no more", () => {
  assert.equal(MEDIA_STORAGE_TYPES.size, 2);
  assert.ok(MEDIA_STORAGE_TYPES.has("R2"));
  assert.ok(MEDIA_STORAGE_TYPES.has("PUBLIC"));
});

test("MEDIA_CATEGORIES contains exactly five categories", () => {
  assert.equal(MEDIA_CATEGORIES.size, 5);
  const expected = ["GENERAL", "GALLERY", "DOCTOR", "BLOG", "VIDEO_POSTER"];
  for (const cat of expected) {
    assert.ok(MEDIA_CATEGORIES.has(cat), `MEDIA_CATEGORIES missing: ${cat}`);
  }
});

test("MEDIA_RIGHTS_STATUSES contains exactly four statuses", () => {
  assert.equal(MEDIA_RIGHTS_STATUSES.size, 4);
  const expected = ["UNVERIFIED", "VERIFIED_INTERNAL", "LICENSED", "PUBLIC_DOMAIN"];
  for (const s of expected) {
    assert.ok(MEDIA_RIGHTS_STATUSES.has(s), `MEDIA_RIGHTS_STATUSES missing: ${s}`);
  }
});

test("MEDIA_PURGE_STATUSES contains exactly six statuses", () => {
  assert.equal(MEDIA_PURGE_STATUSES.size, 6);
  const expected = ["NONE", "CANDIDATE", "BLOCKED", "READY", "FAILED", "PURGED"];
  for (const s of expected) {
    assert.ok(MEDIA_PURGE_STATUSES.has(s), `MEDIA_PURGE_STATUSES missing: ${s}`);
  }
});

// ============================================================
// PART 5: M0003_MEDIA_ASSET_COLUMNS count = 26 (1 test)
// ============================================================

test("M0003_MEDIA_ASSET_COLUMNS has length 26 and countAlterAdds proves 26 ALTERs", () => {
  assert.equal(M0003_MEDIA_ASSET_COLUMNS.length, 26);
  assert.equal(countAlterAdds(MIGRATION_0003_RAW, "media_assets"), 26);
});

// ============================================================
// PART 6: M0003_TABLES used to assert table existence (1 test)
// ============================================================

test("M0003_TABLES iterates to verify both gallery tables exist", () => {
  const db = createFullyMigratedDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  for (const table of M0003_TABLES) {
    assert.ok(tables.includes(table), `M0003 table missing: ${table}`);
  }
});

// ============================================================
// PART 7: Fresh install compatibility (8 tests)
// ============================================================

test("fresh install creates media_assets table with all M0003 columns", () => {
  const db = createFullyMigratedDb();
  const cols = getColumnNames(db, "media_assets");
  for (const col of M0003_MEDIA_ASSET_COLUMNS) {
    assert.ok(cols.includes(col), `media_assets missing column: ${col}`);
  }
});

test("fresh install creates gallery_sections table", () => {
  const db = createFullyMigratedDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes("gallery_sections"), "gallery_sections table must exist");
});

test("fresh install creates gallery_items table", () => {
  const db = createFullyMigratedDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
  assert.ok(tables.includes("gallery_items"), "gallery_items table must exist");
});

test("fresh install has all M0003 indexes", () => {
  const db = createFullyMigratedDb();
  const allIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r) => r.name);
  for (const idx of M0003_INDEXES) {
    assert.ok(allIndexes.includes(idx), `Missing index: ${idx}`);
  }
});

test("fresh install gallery_sections has lifecycle_status column", () => {
  const db = createFullyMigratedDb();
  assert.ok(hasColumn(db, "gallery_sections", "lifecycle_status"));
});

test("fresh install gallery_sections has version column", () => {
  const db = createFullyMigratedDb();
  assert.ok(hasColumn(db, "gallery_sections", "version"));
});

test("fresh install gallery_sections has deleted_at column", () => {
  const db = createFullyMigratedDb();
  assert.ok(hasColumn(db, "gallery_sections", "deleted_at"));
});

test("fresh install gallery_items has all required columns", () => {
  const db = createFullyMigratedDb();
  const requiredCols = [
    "id", "section_id", "media_id", "slot_key", "title_override",
    "alt_text_override", "caption_override", "sort_order",
    "lifecycle_status", "version", "created_by", "updated_by",
    "created_at", "updated_at", "published_at", "deleted_at",
  ];
  const cols = getColumnNames(db, "gallery_items");
  for (const col of requiredCols) {
    assert.ok(cols.includes(col), `gallery_items missing column: ${col}`);
  }
});

// ============================================================
// PART 8: Upgrade compatibility (5 tests)
// ============================================================

test("upgrade from 0000+0002 applies 0003 without error", () => {
  const db = createPreM0003Db();
  db.exec(MIGRATION_0003_SQL);
  assert.ok(true, "Upgrade applied without error");
});

test("upgrade preserves existing media_assets rows", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "legacy-1", r2Key: "legacy/test.webp", purpose: "gallery" });
  insertLegacyMediaRow(db, { id: "legacy-2", r2Key: "legacy/test2.jpg", purpose: "doctor-photo" });
  const preCount = getMediaCount(db);
  db.exec(MIGRATION_0003_SQL);
  const row1 = getMediaRow(db, "legacy-1");
  assert.ok(row1, "legacy-1 must exist");
  assert.equal(row1.r2_key, "legacy/test.webp");
  const row2 = getMediaRow(db, "legacy-2");
  assert.ok(row2, "legacy-2 must exist");
  assert.equal(row2.r2_key, "legacy/test2.jpg");
  assert.ok(getMediaCount(db) >= preCount, "Row count should not decrease after upgrade");
});

test("upgrade with insertR2MediaRow preserves R2 row and backfills storage_type", () => {
  const db = createPreM0003Db();
  insertR2MediaRow(db, { id: "r2-legacy-1", r2Key: "r2/legacy-1.webp", purpose: "gallery", sizeBytes: 2048 });
  insertR2MediaRow(db, { id: "r2-legacy-2", r2Key: "r2/legacy-2.jpg", purpose: "doctor-photo", sizeBytes: 4096 });
  db.exec(MIGRATION_0003_SQL);
  const row1 = getMediaRow(db, "r2-legacy-1");
  assert.ok(row1, "r2-legacy-1 must survive upgrade");
  assert.equal(row1.r2_key, "r2/legacy-1.webp");
  assert.equal(row1.storage_type, "R2", "r2-legacy-1 storage_type backfilled to R2");
  const row2 = getMediaRow(db, "r2-legacy-2");
  assert.ok(row2, "r2-legacy-2 must survive upgrade");
  assert.equal(row2.r2_key, "r2/legacy-2.jpg");
  assert.equal(row2.storage_type, "R2", "r2-legacy-2 storage_type backfilled to R2");
});

test("upgrade backfills category from purpose", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "cat-gallery", r2Key: "cat/g.webp", purpose: "gallery" });
  insertLegacyMediaRow(db, { id: "cat-doctor", r2Key: "cat/d.webp", purpose: "doctor-photo" });
  insertLegacyMediaRow(db, { id: "cat-admin", r2Key: "cat/a.webp", purpose: "admin-upload" });
  db.exec(MIGRATION_0003_SQL);
  assert.equal(getMediaRow(db, "cat-gallery").category, "GALLERY");
  assert.equal(getMediaRow(db, "cat-doctor").category, "DOCTOR");
  assert.equal(getMediaRow(db, "cat-admin").category, "GENERAL");
});

test("upgrade preserves existing lifecycle_status on media_assets rows", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "lifecycle-preserved", r2Key: "lc/test.webp", lifecycleStatus: "PUBLISHED" });
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "lifecycle-preserved");
  assert.equal(row.lifecycle_status, "PUBLISHED");
});

// ============================================================
// PART 9: Backfill Correctness (7 tests)
// ============================================================

test("backfill sets updated_at from created_at for existing rows", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "ba-updated", r2Key: "ba/u.webp" });
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-updated");
  assert.ok(row.updated_at, "updated_at should be backfilled");
});

test("backfill sets display_r2_key from r2_key", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "ba-display", r2Key: "display/test.webp" });
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-display");
  assert.equal(row.display_r2_key, "display/test.webp");
});

test("backfill sets published_at for APPROVED+visible+PUBLISHED rows", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "ba-published", r2Key: "ba/p.webp", status: "APPROVED", isVisible: 1, lifecycleStatus: "PUBLISHED" });
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-published");
  assert.ok(row.published_at, "published_at should be set for published rows");
});

test("backfill does NOT set published_at for HIDDEN rows", () => {
  const db = createPreM0003Db();
  insertLegacyMediaRow(db, { id: "ba-hidden", r2Key: "ba/h.webp", status: "HIDDEN", isVisible: 0, lifecycleStatus: "HIDDEN" });
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-hidden");
  assert.equal(row.published_at, null, "published_at should remain null for HIDDEN rows");
});

test("backfill only sets updated_at when NULL (WHERE updated_at IS NULL)", () => {
  const db = createPreM0003Db();
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status)
     VALUES (?, ?, ?, 'image/webp', 1024, 'gallery', 'test@example.com', '', 'APPROVED', 1, 'PUBLISHED')`
  ).run("ba-verify-updated", "ba/vu.webp", "vu.webp");
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-verify-updated");
  assert.ok(row.updated_at, "updated_at should be backfilled for pre-existing rows");
  assert.equal(row.updated_at, row.created_at, "updated_at should equal created_at after backfill");
});

test("backfill sets display_size_bytes from size_bytes for zero-value rows", () => {
  const db = createPreM0003Db();
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status)
     VALUES (?, ?, ?, 'image/webp', 4096, 'gallery', 'test@example.com', '', 'APPROVED', 1, 'PUBLISHED')`
  ).run("ba-size", "ba/s.webp", "s.webp");
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-size");
  assert.equal(row.display_size_bytes, 4096);
});

test("backfill sets display_content_type from content_type", () => {
  const db = createPreM0003Db();
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note, status, is_visible, lifecycle_status)
     VALUES (?, ?, ?, 'image/jpeg', 2048, 'gallery', 'test@example.com', '', 'APPROVED', 1, 'PUBLISHED')`
  ).run("ba-content", "ba/c.jpg", "c.jpg");
  db.exec(MIGRATION_0003_SQL);
  const row = getMediaRow(db, "ba-content");
  assert.equal(row.display_content_type, "image/jpeg");
});

// ============================================================
// PART 10: Dormant PUBLIC Seeds (10 tests)
// ============================================================

test("0003 inserts exactly 7 PUBLIC asset seeds", () => {
  const db = createFullyMigratedDb();
  const seedCount = db.prepare(`SELECT COUNT(*) AS cnt FROM media_assets WHERE id LIKE 'media-public-gallery-%'`).get().cnt;
  assert.equal(seedCount, 7);
});

test("all 7 PUBLIC seed IDs exist in media_assets", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.ok(row, `PUBLIC seed missing: ${id}`);
  }
});

test("all 7 PUBLIC seeds have storage_type = PUBLIC", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.equal(row.storage_type, "PUBLIC", `${id} storage_type must be PUBLIC`);
  }
});

test("all 7 PUBLIC seeds are dormant (status=HIDDEN)", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.equal(row.status, "HIDDEN", `${id} must be HIDDEN`);
  }
});

test("all 7 PUBLIC seeds are dormant (is_visible=0)", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.equal(row.is_visible, 0, `${id} must have is_visible=0`);
  }
});

test("all 7 PUBLIC seeds are dormant (lifecycle_status=DRAFT)", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.equal(row.lifecycle_status, "DRAFT", `${id} must have lifecycle_status=DRAFT`);
  }
});

test("all 7 PUBLIC seeds have category = GALLERY", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.equal(row.category, "GALLERY", `${id} must have category=GALLERY`);
  }
});

test("all 7 PUBLIC seeds have public_path matching expected paths", () => {
  const db = createFullyMigratedDb();
  const expectedPaths = [
    "/assets/hospital/front-exterior-hero.webp",
    "/assets/hospital/front-exterior-wide.webp",
    "/assets/hospital/reception.jpg",
    "/assets/hospital/corridor.jpg",
    "/assets/hospital/ward-bed-01.jpg",
    "/assets/hospital/patient-room-twin.jpg",
    "/assets/hospital/patient-room-single.jpg",
  ];
  for (let i = 0; i < M0003_PUBLIC_SEED_IDS.length; i++) {
    const row = getMediaRow(db, M0003_PUBLIC_SEED_IDS[i]);
    assert.equal(row.public_path, expectedPaths[i], `${M0003_PUBLIC_SEED_IDS[i]} public_path mismatch`);
  }
});

test("all 7 PUBLIC seeds have display_public_path equal to public_path", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.equal(row.display_public_path, row.public_path, `${id} display_public_path must equal public_path`);
  }
});

test("isDormantAsset returns true for PUBLIC seeds", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_PUBLIC_SEED_IDS) {
    const row = getMediaRow(db, id);
    assert.ok(isDormantAsset(row), `${id} should be dormant`);
  }
});

// ============================================================
// PART 11: Dormant Gallery Seed (5 tests)
// ============================================================

test("0003 inserts 1 gallery section (facilities)", () => {
  const db = createFullyMigratedDb();
  assert.equal(countTableRows(db, "gallery_sections"), 1);
});

test("gallery section has correct slug and lifecycle_status", () => {
  const db = createFullyMigratedDb();
  const section = getRowById(db, "gallery_sections", M0003_GALLERY_SECTION_ID);
  assert.ok(section, "gallery-section-facilities must exist");
  assert.equal(section.slug, "facilities");
  assert.equal(section.lifecycle_status, "DRAFT");
  assert.ok(isDormantGalleryRow(section));
});

test("0003 inserts 7 gallery items", () => {
  const db = createFullyMigratedDb();
  assert.equal(countTableRows(db, "gallery_items"), 7);
});

test("all 7 gallery item IDs exist", () => {
  const db = createFullyMigratedDb();
  for (const id of M0003_GALLERY_ITEM_IDS) {
    const item = getRowById(db, "gallery_items", id);
    assert.ok(item, `gallery item missing: ${id}`);
    assert.equal(item.section_id, M0003_GALLERY_SECTION_ID);
    assert.equal(item.lifecycle_status, "DRAFT");
    assert.ok(isDormantGalleryRow(item));
  }
});

test("gallery items have sequential sort_order 0-6", () => {
  const db = createFullyMigratedDb();
  const items = db.prepare("SELECT id, sort_order FROM gallery_items ORDER BY sort_order").all();
  assert.equal(items.length, 7);
  for (let i = 0; i < 7; i++) {
    assert.equal(items[i].sort_order, i, `Item at position ${i} must have sort_order=${i}`);
  }
});

// ============================================================
// PART 12: gallery_v2_initialized marker (2 tests)
// ============================================================

test("0003 inserts gallery_v2_initialized=0 marker", () => {
  const db = createFullyMigratedDb();
  const marker = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
  assert.ok(marker, "gallery_v2_initialized marker must exist");
  assert.equal(marker.value, "0");
});

test("gallery_v2_initialized marker is not overwritten if already present", () => {
  const db = createPreM0003Db();
  db.prepare("INSERT OR REPLACE INTO site_configs (key, value) VALUES ('gallery_v2_initialized', '1')").run();
  db.exec(MIGRATION_0003_SQL);
  const marker = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
  assert.equal(marker.value, "1", "Existing marker should not be overwritten");
});

// ============================================================
// PART 13: Constraints and CHECK enums (6 tests)
// ============================================================

test("gallery_sections lifecycle_status CHECK enum matches lifecycle foundation", () => {
  const db = createFullyMigratedDb();
  db.prepare(
    `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by)
     VALUES (?, ?, ?, ?, 0, ?, 1, 'test')`
  ).run("test-valid", "test-valid", "Test", "Test desc", "DRAFT");
  assert.throws(() => {
    db.prepare(
      `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by)
       VALUES (?, ?, ?, ?, 0, ?, 1, 'test')`
    ).run("test-invalid", "test-invalid", "Test", "Test desc", "INVALID_STATUS");
  }, /CHECK constraint/i);
});

test("gallery_items lifecycle_status CHECK enum matches lifecycle foundation", () => {
  const db = createFullyMigratedDb();
  const sectionId = M0003_GALLERY_SECTION_ID;
  const mediaId = M0003_PUBLIC_SEED_IDS[0];
  db.prepare(
    `INSERT INTO gallery_items (id, section_id, media_id, sort_order, lifecycle_status, version, created_by)
     VALUES (?, ?, ?, 0, ?, 1, 'test')`
  ).run("test-valid-item", sectionId, mediaId, "PUBLISHED");
  assert.throws(() => {
    db.prepare(
      `INSERT INTO gallery_items (id, section_id, media_id, sort_order, lifecycle_status, version, created_by)
       VALUES (?, ?, ?, 0, ?, 1, 'test')`
    ).run("test-invalid-item", sectionId, mediaId, "INVALID_STATUS");
  }, /CHECK constraint/i);
});

test("gallery_items FOREIGN KEY section_id rejects invalid section", () => {
  const db = createFullyMigratedDb();
  const mediaId = M0003_PUBLIC_SEED_IDS[0];
  assert.throws(() => {
    db.prepare(
      `INSERT INTO gallery_items (id, section_id, media_id, sort_order, lifecycle_status, version, created_by)
       VALUES (?, ?, ?, 0, 'DRAFT', 1, 'test')`
    ).run("test-fk-invalid", "nonexistent-section", mediaId);
  }, /FOREIGN KEY constraint/i);
});

test("gallery_items FOREIGN KEY media_id rejects invalid media", () => {
  const db = createFullyMigratedDb();
  const sectionId = M0003_GALLERY_SECTION_ID;
  assert.throws(() => {
    db.prepare(
      `INSERT INTO gallery_items (id, section_id, media_id, sort_order, lifecycle_status, version, created_by)
       VALUES (?, ?, ?, 0, 'DRAFT', 1, 'test')`
    ).run("test-fk-media-invalid", sectionId, "nonexistent-media");
  }, /FOREIGN KEY constraint/i);
});

test("gallery_sections slug UNIQUE constraint enforced", () => {
  const db = createFullyMigratedDb();
  assert.throws(() => {
    db.prepare(
      `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by)
       VALUES (?, ?, ?, ?, 0, 'DRAFT', 1, 'test')`
    ).run("test-dup-section", "facilities", "Dup", "Dup desc");
  }, /UNIQUE constraint/i);
});

test("gallery_items slot_key UNIQUE constraint enforced for active rows", () => {
  const db = createFullyMigratedDb();
  const sectionId = M0003_GALLERY_SECTION_ID;
  const mediaId2 = M0003_PUBLIC_SEED_IDS[1];
  assert.throws(() => {
    db.prepare(
      `INSERT INTO gallery_items (id, section_id, media_id, slot_key, sort_order, lifecycle_status, version, created_by)
       VALUES (?, ?, ?, ?, 0, 'DRAFT', 1, 'test')`
    ).run("test-dup-slot", sectionId, mediaId2, "front-exterior-hero");
  }, /UNIQUE constraint/i);
});

// ============================================================
// PART 14: Index existence and structure (4 tests)
// ============================================================

test("idx_media_lifecycle_category_created exists on media_assets", () => {
  const db = createFullyMigratedDb();
  const indexes = getIndexes(db, "media_assets");
  assert.ok(indexes.includes("idx_media_lifecycle_category_created"));
});

test("idx_gallery_sections_lifecycle_order exists on gallery_sections", () => {
  const db = createFullyMigratedDb();
  const indexes = getIndexes(db, "gallery_sections");
  assert.ok(indexes.includes("idx_gallery_sections_lifecycle_order"));
});

test("idx_gallery_items_section_lifecycle_order exists on gallery_items", () => {
  const db = createFullyMigratedDb();
  const indexes = getIndexes(db, "gallery_items");
  assert.ok(indexes.includes("idx_gallery_items_section_lifecycle_order"));
});

test("idx_gallery_items_media_deleted exists on gallery_items", () => {
  const db = createFullyMigratedDb();
  const indexes = getIndexes(db, "gallery_items");
  assert.ok(indexes.includes("idx_gallery_items_media_deleted"));
});

// ============================================================
// PART 15: Schema capability — full validation (14 tests)
// ============================================================

test("assertMediaGallerySchemaCapabilities returns ok:true on fully migrated DB", () => {
  const db = createFullyMigratedDb();
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.report.tables.includes("gallery_sections"));
    assert.ok(result.report.tables.includes("gallery_items"));
    assert.ok(result.report.mediaAssetColumnNames.includes("storage_type"));
    assert.ok(result.report.mediaAssetColumnNames.includes("category"));
  }
});

test("assertMediaGallerySchemaCapabilities returns ok:false on pre-0003 DB", () => {
  const db = createPreM0003Db();
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some((e) => e.includes("Missing table: gallery_sections")));
  }
});

test("collectSchemaReport reports all tables on fully migrated DB", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  assert.ok(report.tables.includes("gallery_sections"));
  assert.ok(report.tables.includes("gallery_items"));
  assert.ok(report.tables.includes("media_assets"));
});

test("collectSchemaReport reports all gallery section columns", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  for (const col of REQUIRED_GALLERY_SECTION_COLUMNS) {
    assert.ok(report.gallerySectionColumnNames.includes(col), `gallery_sections missing column in report: ${col}`);
  }
});

test("collectSchemaReport reports all gallery item columns", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  for (const col of REQUIRED_GALLERY_ITEM_COLUMNS) {
    assert.ok(report.galleryItemColumnNames.includes(col), `gallery_items missing column in report: ${col}`);
  }
});

test("collectSchemaReport provides gallery_section CREATE TABLE SQL", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  assert.ok(report.gallerySectionCreateSql, "gallery_section CREATE SQL must not be empty");
  assert.ok(report.gallerySectionCreateSql.includes("gallery_sections"), "CREATE SQL must reference gallery_sections");
  assert.ok(report.gallerySectionCreateSql.includes("lifecycle_status"), "CREATE SQL must include lifecycle_status");
});

test("collectSchemaReport provides gallery_item CREATE TABLE SQL with FOREIGN KEYs", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  assert.ok(report.galleryItemCreateSql, "gallery_item CREATE SQL must not be empty");
  assert.ok(report.galleryItemCreateSql.includes("FOREIGN KEY"), "CREATE SQL must include FOREIGN KEY");
  assert.ok(report.galleryItemCreateSql.includes("section_id"), "CREATE SQL must include section_id FK");
  assert.ok(report.galleryItemCreateSql.includes("media_id"), "CREATE SQL must include media_id FK");
});

test("collectSchemaReport reports foreign keys for gallery_items", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  const sectionFk = report.foreignKeys.find((fk) => fk.table === "gallery_items" && fk.from === "section_id");
  assert.ok(sectionFk, "gallery_items must have FK on section_id");
  assert.equal(sectionFk.referencedTable, "gallery_sections");
  assert.equal(sectionFk.to, "id");

  const mediaFk = report.foreignKeys.find((fk) => fk.table === "gallery_items" && fk.from === "media_id");
  assert.ok(mediaFk, "gallery_items must have FK on media_id");
  assert.equal(mediaFk.referencedTable, "media_assets");
  assert.equal(mediaFk.to, "id");
});

test("collectSchemaReport reports unique/partial index metadata", () => {
  const db = createFullyMigratedDb();
  const report = collectSchemaReport(db);
  const publicPathIdx = report.indexes.find((i) => i.indexName === "idx_media_active_public_path");
  assert.ok(publicPathIdx, "idx_media_active_public_path must exist in report");
  assert.equal(publicPathIdx.unique, 1, "idx_media_active_public_path must be unique");
  assert.equal(publicPathIdx.partial, 1, "idx_media_active_public_path must be partial");
  const slotIdx = report.indexes.find((i) => i.indexName === "idx_gallery_items_active_slot");
  assert.ok(slotIdx, "idx_gallery_items_active_slot must exist in report");
  assert.equal(slotIdx.unique, 1, "idx_gallery_items_active_slot must be unique");
  assert.equal(slotIdx.partial, 1, "idx_gallery_items_active_slot must be partial");
});

test("missing one gallery_sections column causes capability failure", () => {
  const db = createDbWithMissingColumn("gallery_sections", "slug");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_sections") && e.includes("slug")));
  }
});

test("missing one gallery_items column causes capability failure", () => {
  const db = createDbWithMissingColumn("gallery_items", "slot_key");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_items") && e.includes("slot_key")));
  }
});

test("missing section FK causes capability failure", () => {
  const db = createDbWithBrokenFk("no-section-fk");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("section_id") && e.includes("FOREIGN KEY")));
  }
});

test("missing media FK causes capability failure", () => {
  const db = createDbWithBrokenFk("no-media-fk");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("media_id") && e.includes("FOREIGN KEY")));
  }
});

test("wrong FK target causes capability failure", () => {
  const db = createDbWithBrokenFk("wrong-section-target");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_items.section_id FK references") && e.includes("instead of gallery_sections")));
  }
});

// ============================================================
// PART 16: Index uniqueness/partial failures (3 tests)
// ============================================================

test("non-unique required index causes capability failure", () => {
  const db = createDbWithNonUniqueIndex("idx_media_active_public_path");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_public_path") && e.includes("UNIQUE")));
  }
});

test("non-partial required index causes capability failure", () => {
  const db = createFullyMigratedDb();
  db.exec("DROP INDEX IF EXISTS idx_media_active_checksum");
  db.exec("CREATE UNIQUE INDEX idx_media_active_checksum ON media_assets(storage_type, checksum_sha256)");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_checksum") && e.includes("partial")));
  }
});

test("missing required index causes capability failure", () => {
  const db = createDbWithoutIndex("idx_gallery_items_section_lifecycle_order");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("Missing index: idx_gallery_items_section_lifecycle_order")));
  }
});

// ============================================================
// PART 17: Dormancy proof (3 tests)
// ============================================================

test("dormant PUBLIC seeds excluded from published+visible media query", () => {
  const db = createFullyMigratedDb();
  const active = db.prepare(
    `SELECT COUNT(*) AS cnt FROM media_assets WHERE status = 'APPROVED' AND is_visible = 1 AND lifecycle_status = 'PUBLISHED' AND deleted_at IS NULL`
  ).get().cnt;
  assert.equal(active, 0, "No dormant PUBLIC seeds should appear in active query");
});

test("dormant gallery section excluded from published gallery query", () => {
  const db = createFullyMigratedDb();
  const activeSections = db.prepare(`SELECT COUNT(*) AS cnt FROM gallery_sections WHERE lifecycle_status = 'PUBLISHED'`).get().cnt;
  assert.equal(activeSections, 0, "No dormant sections should appear in published query");
});

test("dormant gallery items excluded from published gallery items query", () => {
  const db = createFullyMigratedDb();
  const activeItems = db.prepare(`SELECT COUNT(*) AS cnt FROM gallery_items WHERE lifecycle_status = 'PUBLISHED'`).get().cnt;
  assert.equal(activeItems, 0, "No dormant items should appear in published query");
});

// ============================================================
// PART 18: media-schema.ts enum validators (6 tests)
// ============================================================

test("isPublicStorage returns true for PUBLIC", () => {
  assert.ok(isPublicStorage("PUBLIC"));
});

test("isPublicStorage returns false for R2", () => {
  assert.ok(!isPublicStorage("R2"));
});

test("isValidMediaCategory accepts all valid categories", () => {
  assert.ok(isValidMediaCategory("GENERAL"));
  assert.ok(isValidMediaCategory("GALLERY"));
  assert.ok(isValidMediaCategory("DOCTOR"));
  assert.ok(isValidMediaCategory("BLOG"));
  assert.ok(isValidMediaCategory("VIDEO_POSTER"));
});

test("isValidMediaCategory rejects unknown category", () => {
  assert.ok(!isValidMediaCategory("UNKNOWN"));
});

test("isValidRightsStatus accepts all valid statuses", () => {
  assert.ok(isValidRightsStatus("UNVERIFIED"));
  assert.ok(isValidRightsStatus("VERIFIED_INTERNAL"));
  assert.ok(isValidRightsStatus("LICENSED"));
  assert.ok(isValidRightsStatus("PUBLIC_DOMAIN"));
});

test("isValidPurgeStatus accepts all valid statuses", () => {
  assert.ok(isValidPurgeStatus("NONE"));
  assert.ok(isValidPurgeStatus("CANDIDATE"));
  assert.ok(isValidPurgeStatus("BLOCKED"));
  assert.ok(isValidPurgeStatus("READY"));
  assert.ok(isValidPurgeStatus("FAILED"));
  assert.ok(isValidPurgeStatus("PURGED"));
});

// ============================================================
// PART 19: inspectM1FoundationState (6 tests)
// ============================================================

test("inspectM1FoundationState reports gallery_v2_initialized=0 after fresh install", () => {
  const db = createFullyMigratedDb();
  const state = inspectM1FoundationState(db);
  assert.equal(state.gallery_v2_initialized_exists, true);
  assert.equal(state.gallery_v2_initialized_value, "0");
});

test("inspectM1FoundationState reports 7 expected seeds all found, zero missing", () => {
  const db = createFullyMigratedDb();
  const state = inspectM1FoundationState(db);
  assert.equal(state.expected_seed_count, 7);
  assert.equal(state.expected_seed_ids_missing.length, 0);
  assert.equal(state.dormant_expected_seed_count, 7);
});

test("inspectM1FoundationState reports expected section and items", () => {
  const db = createFullyMigratedDb();
  const state = inspectM1FoundationState(db);
  assert.equal(state.expected_section_present, true);
  assert.equal(state.expected_section_dormant, true);
  assert.equal(state.expected_item_count, 7);
  assert.equal(state.expected_item_ids_missing.length, 0);
});

test("inspectM1FoundationState reports missing seed when DB has fewer seeds", () => {
  const db = createFullyMigratedDb();
  db.prepare("DELETE FROM gallery_items WHERE media_id = ?").run("media-public-gallery-front-exterior-hero");
  db.prepare("DELETE FROM media_assets WHERE id = ?").run("media-public-gallery-front-exterior-hero");
  const state = inspectM1FoundationState(db);
  assert.equal(state.expected_seed_count, 6);
  assert.ok(state.expected_seed_ids_missing.includes("media-public-gallery-front-exterior-hero"));
  assert.equal(state.dormant_expected_seed_count, 6);
});

test("inspectM1FoundationState reports marker absent when not in DB", () => {
  const db = createPreM0003Db();
  const state = inspectM1FoundationState(db);
  assert.equal(state.gallery_v2_initialized_exists, false);
  assert.equal(state.gallery_v2_initialized_value, null);
});

test("inspectM1FoundationState reports gallery_v2_initialized=1 after manual set", () => {
  const db = createFullyMigratedDb();
  db.prepare("INSERT OR REPLACE INTO site_configs (key, value) VALUES ('gallery_v2_initialized', '1')").run();
  const state = inspectM1FoundationState(db);
  assert.equal(state.gallery_v2_initialized_value, "1");
});

// ============================================================
// PART 20: No live route imports media-schema (1 test)
// ============================================================

test("no runtime route file imports media-schema", async () => {
  const routeFiles = [
    "app/api/admin/media/route.ts",
    "app/api/media/[...key]/route.ts",
    "app/api/gallery/route.ts",
  ];
  for (const route of routeFiles) {
    const content = await readFile(new URL(`../${route}`, import.meta.url), "utf8");
    assert.ok(!content.includes("media-schema"), `${route} must not import media-schema`);
  }
});

// ============================================================
// PART 21: FK DELETE POLICY (4 new tests)
// ============================================================

test("section_id ON DELETE CASCADE causes capability failure", () => {
  const db = createDbWithFkOnDelete("section_id", "CASCADE");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("section_id") && e.includes("RESTRICT")));
  }
});

test("media_id ON DELETE CASCADE causes capability failure", () => {
  const db = createDbWithFkOnDelete("media_id", "CASCADE");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("media_id") && e.includes("RESTRICT")));
  }
});

test("section_id ON DELETE SET NULL causes capability failure", () => {
  const db = createDbWithFkOnDelete("section_id", "SET NULL");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("section_id") && e.includes("RESTRICT")));
  }
});

test("media_id ON DELETE NO ACTION causes capability failure", () => {
  const db = createDbWithFkOnDelete("media_id", "NO ACTION");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("media_id") && e.includes("RESTRICT")));
  }
});

// ============================================================
// PART 22: INDEX COLUMN SEMANTICS (7 tests)
// ============================================================

test("idx_media_lifecycle_category_created wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_media_lifecycle_category_created", ["category", "lifecycle_status", "created_at"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_lifecycle_category_created") && e.includes("columns")));
  }
});

test("idx_media_active_public_path wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_media_active_public_path", ["storage_type", "public_path"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_public_path") && e.includes("columns")));
  }
});

test("idx_media_active_checksum wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_media_active_checksum", ["checksum_sha256", "storage_type"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_checksum") && e.includes("columns")));
  }
});

test("idx_gallery_sections_lifecycle_order wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_gallery_sections_lifecycle_order", ["sort_order", "lifecycle_status", "id"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_gallery_sections_lifecycle_order") && e.includes("columns")));
  }
});

test("idx_gallery_items_section_lifecycle_order wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_gallery_items_section_lifecycle_order", ["section_id", "sort_order", "lifecycle_status", "id"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_gallery_items_section_lifecycle_order") && e.includes("columns")));
  }
});

test("idx_gallery_items_media_deleted wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_gallery_items_media_deleted", ["deleted_at", "media_id"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_gallery_items_media_deleted") && e.includes("columns")));
  }
});

test("idx_gallery_items_active_slot wrong columns causes failure", () => {
  const db = createDbWithWrongIndexColumns("idx_gallery_items_active_slot", ["slot_key", "section_id"]);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_gallery_items_active_slot") && e.includes("columns")));
  }
});

// ============================================================
// PART 23: PARTIAL PREDICATE SEMANTICS (4 tests)
// ============================================================

test("idx_media_active_public_path missing storage_type=PUBLIC predicate causes failure", () => {
  const db = createDbWithWrongPredicate("idx_media_active_public_path", "WHERE public_path IS NOT NULL AND deleted_at IS NULL");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_public_path") && e.includes("predicate")));
  }
});

test("idx_media_active_public_path missing deleted_at IS NULL predicate causes failure", () => {
  const db = createDbWithWrongPredicate("idx_media_active_public_path", "WHERE storage_type = 'PUBLIC' AND public_path IS NOT NULL");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_public_path") && e.includes("predicate")));
  }
});

test("idx_media_active_checksum missing purge_status predicate causes failure", () => {
  const db = createDbWithWrongPredicate("idx_media_active_checksum", "WHERE checksum_sha256 IS NOT NULL AND deleted_at IS NULL");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_media_active_checksum") && e.includes("predicate")));
  }
});

test("idx_gallery_items_active_slot wrong predicate causes failure", () => {
  const db = createDbWithWrongPredicate("idx_gallery_items_active_slot", "WHERE deleted_at IS NULL");
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("idx_gallery_items_active_slot") && e.includes("predicate")));
  }
});

// ============================================================
// PART 24: GALLERY TABLE CHECK SEMANTICS (4 tests)
// ============================================================

test("gallery_sections without lifecycle_status CHECK causes capability failure", () => {
  const brokenSql = `CREATE TABLE gallery_sections (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by TEXT NOT NULL, updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT, deleted_at TEXT
  )`;
  const db = createDbWithModifiedGalleryTable("gallery_sections", brokenSql);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_sections") && e.includes("lifecycle_status CHECK")));
  }
});

test("gallery_items without version CHECK causes capability failure", () => {
  const brokenSql = `CREATE TABLE gallery_items (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, media_id TEXT NOT NULL, slot_key TEXT,
    title_override TEXT NOT NULL DEFAULT '', alt_text_override TEXT NOT NULL DEFAULT '', caption_override TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED')),
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL, updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT, deleted_at TEXT,
    FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT,
    FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT
  )`;
  const db = createDbWithModifiedGalleryTable("gallery_items", brokenSql);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_items") && e.includes("version >= 1")));
  }
});

test("gallery_sections without sort_order CHECK causes capability failure", () => {
  const brokenSql = `CREATE TABLE gallery_sections (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by TEXT NOT NULL, updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT, deleted_at TEXT
  )`;
  const db = createDbWithModifiedGalleryTable("gallery_sections", brokenSql);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_sections") && e.includes("sort_order >= 0")));
  }
});

test("gallery_items without lifecycle_status CHECK causes capability failure", () => {
  const brokenSql = `CREATE TABLE gallery_items (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, media_id TEXT NOT NULL, slot_key TEXT,
    title_override TEXT NOT NULL DEFAULT '', alt_text_override TEXT NOT NULL DEFAULT '', caption_override TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_by TEXT NOT NULL, updated_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT, deleted_at TEXT,
    FOREIGN KEY (section_id) REFERENCES gallery_sections(id) ON DELETE RESTRICT,
    FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT
  )`;
  const db = createDbWithModifiedGalleryTable("gallery_items", brokenSql);
  const result = assertMediaGallerySchemaCapabilities(db);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((e) => e.includes("gallery_items") && e.includes("lifecycle_status CHECK")));
  }
});
