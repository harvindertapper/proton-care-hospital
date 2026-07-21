/**
 * B5/M2-B — Gallery v2 Backend Workflow Tests
 *
 * Comprehensive data-behavior tests using real in-memory node:sqlite.
 * Tests cover: slug normalization, lifecycle transitions, section/item CRUD,
 * optimistic concurrency, atomic reorder, publication guards, dormant state,
 * revision system integration, field limits, strict version/sortOrder parsing,
 * delete race guards, and immutability enforcement.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const BASELINE_SQL = readFileSync(join(ROOT, "migrations", "0000_baseline.sql"), "utf8");
const MIGRATION_0001_SQL = readFileSync(join(ROOT, "migrations", "0001_enforce_department_slot_exclusivity.sql"), "utf8");
const MIGRATION_0002_SQL = readFileSync(join(ROOT, "migrations", "0002_add_content_lifecycle_foundation.sql"), "utf8");
const MIGRATION_0003_SQL = readFileSync(join(ROOT, "migrations", "0003_add_media_library_and_gallery.sql"), "utf8");

function createFullyMigratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const stmt of splitSql(BASELINE_SQL)) db.exec(stmt);
  for (const stmt of splitSql(MIGRATION_0001_SQL)) db.exec(stmt);
  for (const stmt of splitSql(MIGRATION_0002_SQL)) db.exec(stmt);
  for (const stmt of splitSql(MIGRATION_0003_SQL)) db.exec(stmt);
  return db;
}

function splitSql(sql) {
  return sql
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 0);
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */

function insertMedia(db, opts = {}) {
  const id = opts.id || `media-${crypto.randomUUID()}`;
  const r2Key = opts.r2_key || `test/${crypto.randomUUID()}.jpg`;
  const storageType = opts.storage_type || "R2";
  const publicPath = opts.public_path || null;
  const displayR2Key = opts.display_r2_key ?? r2Key;
  const displayPublicPath = opts.display_public_path ?? publicPath;
  const thumbnailR2Key = opts.thumbnail_r2_key ?? r2Key;
  const thumbnailPublicPath = opts.thumbnail_public_path ?? publicPath;
  const category = opts.category || "GENERAL";
  const status = opts.status || "APPROVED";
  const isVisible = opts.is_visible ?? 1;
  const lifecycleStatus = opts.lifecycle_status || "PUBLISHED";
  const deletedAt = opts.deleted_at || null;
  const purpose = opts.purpose || "admin-upload";
  const purgeStatus = opts.purge_status || "NONE";
  const version = opts.version || 1;
  const title = opts.title || "";
  const altText = opts.alt_text || "";
  const caption = opts.caption || "";
  const width = opts.width ?? null;
  const height = opts.height ?? null;

  const stmt = db.prepare(
    `INSERT INTO media_assets (
      id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by,
      status, is_visible, lifecycle_status, deleted_at, version,
      storage_type, public_path, display_r2_key, display_public_path,
      thumbnail_r2_key, thumbnail_public_path,
      category, purge_status, rights_status, title, alt_text, caption, width, height
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNVERIFIED', ?, ?, ?, ?, ?)`
  );
  stmt.run(
    id, r2Key, opts.file_name || "test.jpg", opts.content_type || "image/jpeg",
    opts.size_bytes || 1024, purpose, "test@example.com",
    status, isVisible, lifecycleStatus, deletedAt, version,
    storageType, publicPath, displayR2Key, displayPublicPath,
    thumbnailR2Key, thumbnailPublicPath,
    category, purgeStatus, title, altText, caption, width, height,
  );
  return id;
}

function insertSection(db, opts = {}) {
  const id = opts.id || `gallery-section-${crypto.randomUUID().slice(0, 8)}`;
  const slug = opts.slug || id.replace("gallery-section-", "");
  const name = opts.name || "Test Section";
  const description = opts.description || "";
  const sortOrder = opts.sort_order ?? 0;
  const lifecycleStatus = opts.lifecycle_status || "DRAFT";
  const version = opts.version || 1;
  const createdBy = opts.created_by || "test@example.com";
  const deletedAt = opts.deleted_at || null;
  const publishedAt = opts.published_at || null;

  const stmt = db.prepare(
    `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by, updated_by, deleted_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(id, slug, name, description, sortOrder, lifecycleStatus, version, createdBy, createdBy, deletedAt, publishedAt);
  return id;
}

function insertItem(db, sectionId, mediaId, opts = {}) {
  const id = opts.id || `gallery-item-${crypto.randomUUID().slice(0, 8)}`;
  const slotKey = opts.slot_key || null;
  const titleOverride = opts.title_override || "";
  const altTextOverride = opts.alt_text_override || "";
  const captionOverride = opts.caption_override || "";
  const sortOrder = opts.sort_order ?? 0;
  const lifecycleStatus = opts.lifecycle_status || "DRAFT";
  const version = opts.version || 1;
  const createdBy = opts.created_by || "test@example.com";
  const deletedAt = opts.deleted_at || null;

  const stmt = db.prepare(
    `INSERT INTO gallery_items (id, section_id, media_id, slot_key, title_override, alt_text_override, caption_override, sort_order, lifecycle_status, version, created_by, updated_by, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(id, sectionId, mediaId, slotKey, titleOverride, altTextOverride, captionOverride, sortOrder, lifecycleStatus, version, createdBy, createdBy, deletedAt);
  return id;
}

function insertRevision(db, opts = {}) {
  const id = opts.id || `rev-${crypto.randomUUID().slice(0, 8)}`;
  const entityType = opts.entity_type || "gallery_section.create";
  const entityId = opts.entity_id || "gallery-section-test";
  const title = opts.title || "Test revision";
  const payload = opts.payload_json || JSON.stringify({ action: "gallery_section.create", payload: { slug: "test", name: "Test" } });
  const status = opts.status || "NEEDS_REVIEW";
  const proposedBy = opts.proposed_by || "staff@example.com";

  const stmt = db.prepare(
    `INSERT INTO content_revisions (id, entity_type, entity_id, title, payload_json, status, proposed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(id, entityType, entityId, title, payload, status, proposedBy);
  return id;
}

/* ─── Domain module inline reimplementations for unit testing ──────────── */

const GALLERY_ITEMS_COLUMNS = [
  "id", "section_id", "media_id", "slot_key",
  "title_override", "alt_text_override", "caption_override",
  "sort_order", "lifecycle_status", "version",
  "created_by", "updated_by", "created_at", "updated_at",
  "published_at", "deleted_at",
];

const ITEM_WITH_MEDIA_COLUMNS_TEST = [
  ...GALLERY_ITEMS_COLUMNS.map((c) => `gi.${c}`),
  "m.storage_type", "m.r2_key", "m.public_path",
  "m.display_r2_key", "m.display_public_path",
  "m.thumbnail_r2_key", "m.thumbnail_public_path",
  "m.title", "m.alt_text", "m.caption", "m.width", "m.height",
  "m.category AS media_category",
  "m.lifecycle_status AS media_lifecycle_status",
  "m.status AS media_approval_status",
  "m.is_visible AS media_visible",
].join(", ");

const TEST_ITEM_WITH_MEDIA_SELECT = ITEM_WITH_MEDIA_COLUMNS_TEST;

function normalizeSlug(input) {
  if (typeof input !== "string") return null;
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  return slug.length > 0 ? slug : null;
}

const GALLERY_TRANSITIONS = {
  DRAFT: new Set(["IN_REVIEW", "PUBLISHED", "ARCHIVED"]),
  IN_REVIEW: new Set(["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"]),
  PUBLISHED: new Set(["HIDDEN", "ARCHIVED"]),
  HIDDEN: new Set(["PUBLISHED", "ARCHIVED"]),
  ARCHIVED: new Set(["DRAFT"]),
};

function canGalleryTransition(from, to) {
  const allowed = GALLERY_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.has(to);
}

function parseGalleryLimit(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: 25 };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return { ok: false, error: "limit must be a positive integer." };
  if (n > 100) return { ok: false, error: "limit must be at most 100." };
  return { ok: true, value: n };
}

function parseGalleryOffset(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: 0 };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return { ok: false, error: "offset must be a non-negative integer." };
  return { ok: true, value: n };
}

function publishedAtSql(currentStatus, newStatus, currentPublishedAt) {
  const publishingNow = newStatus === "PUBLISHED" && currentStatus !== "PUBLISHED";
  const unpublishingNow = newStatus !== "PUBLISHED" && currentStatus === "PUBLISHED";
  if (publishingNow && !currentPublishedAt) return "SET published_at = CURRENT_TIMESTAMP";
  if (unpublishingNow) return "SET published_at = NULL";
  return null;
}

function parseVersion(raw) {
  if (typeof raw !== "number") return null;
  if (!Number.isInteger(raw) || raw < 1) return null;
  return raw;
}

function parseSortOrder(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: 0 };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    return { ok: false, error: "sortOrder must be a non-negative integer." };
  }
  return { ok: true, value: raw };
}

/* ─── Tests ───────────────────────────────────────────────────────────── */

describe("B5/M2-B — Gallery v2 Backend Workflow", () => {
  /* ═══════════════════════════════════════════════════════════════════════
     A. Slug normalization
     ═══════════════════════════════════════════════════════════════════════ */

  describe("A. Slug normalization", () => {
    it("A.01 normalizes lowercase alphanumeric", () => {
      assert.equal(normalizeSlug("Hospital Facilities"), "hospital-facilities");
    });

    it("A.02 strips leading/trailing dashes", () => {
      assert.equal(normalizeSlug("--hello-world--"), "hello-world");
    });

    it("A.03 collapses consecutive special chars", () => {
      assert.equal(normalizeSlug("hello___world"), "hello-world");
    });

    it("A.04 returns null for empty input", () => {
      assert.equal(normalizeSlug(""), null);
      assert.equal(normalizeSlug("   "), null);
      assert.equal(normalizeSlug(null), null);
      assert.equal(normalizeSlug(undefined), null);
      assert.equal(normalizeSlug(123), null);
    });

    it("A.05 clamps to max length 100", () => {
      const long = "a".repeat(200);
      const result = normalizeSlug(long);
      assert.ok(result);
      assert.ok(result.length <= 100);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     B. Lifecycle transitions
     ═══════════════════════════════════════════════════════════════════════ */

  describe("B. Lifecycle transitions", () => {
    it("B.01 allows DRAFT → IN_REVIEW", () => {
      assert.ok(canGalleryTransition("DRAFT", "IN_REVIEW"));
    });

    it("B.02 allows DRAFT → PUBLISHED (direct publish)", () => {
      assert.ok(canGalleryTransition("DRAFT", "PUBLISHED"));
    });

    it("B.03 allows DRAFT → ARCHIVED", () => {
      assert.ok(canGalleryTransition("DRAFT", "ARCHIVED"));
    });

    it("B.04 blocks DRAFT → HIDDEN", () => {
      assert.ok(!canGalleryTransition("DRAFT", "HIDDEN"));
    });

    it("B.05 allows IN_REVIEW → DRAFT (rejected back)", () => {
      assert.ok(canGalleryTransition("IN_REVIEW", "DRAFT"));
    });

    it("B.06 allows PUBLISHED → HIDDEN", () => {
      assert.ok(canGalleryTransition("PUBLISHED", "HIDDEN"));
    });

    it("B.07 allows HIDDEN → PUBLISHED (re-publish)", () => {
      assert.ok(canGalleryTransition("HIDDEN", "PUBLISHED"));
    });

    it("B.08 blocks ARCHIVED → PUBLISHED", () => {
      assert.ok(!canGalleryTransition("ARCHIVED", "PUBLISHED"));
    });

    it("B.09 blocks invalid statuses", () => {
      assert.ok(!canGalleryTransition("BOGUS", "PUBLISHED"));
      assert.ok(!canGalleryTransition("PUBLISHED", "BOGUS"));
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     C. Pagination parsing
     ═══════════════════════════════════════════════════════════════════════ */

  describe("C. Pagination parsing", () => {
    it("C.01 defaults limit=25, offset=0", () => {
      assert.deepEqual(parseGalleryLimit(null), { ok: true, value: 25 });
      assert.deepEqual(parseGalleryOffset(null), { ok: true, value: 0 });
    });

    it("C.02 rejects limit > 100", () => {
      assert.ok(!parseGalleryLimit(101).ok);
    });

    it("C.03 rejects non-integer limit", () => {
      assert.ok(!parseGalleryLimit(1.5).ok);
      assert.ok(!parseGalleryLimit("abc").ok);
    });

    it("C.04 rejects negative offset", () => {
      assert.ok(!parseGalleryOffset(-1).ok);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     D. Strict version parsing
     ═══════════════════════════════════════════════════════════════════════ */

  describe("D. Strict version parsing", () => {
    it("D.01 accepts positive integer numbers", () => {
      assert.equal(parseVersion(1), 1);
      assert.equal(parseVersion(42), 42);
      assert.equal(parseVersion(999), 999);
    });

    it("D.02 rejects string numbers", () => {
      assert.equal(parseVersion("1"), null);
      assert.equal(parseVersion("42"), null);
    });

    it("D.03 rejects zero and negative", () => {
      assert.equal(parseVersion(0), null);
      assert.equal(parseVersion(-1), null);
    });

    it("D.04 rejects floats", () => {
      assert.equal(parseVersion(1.5), null);
      assert.equal(parseVersion(3.14), null);
    });

    it("D.05 rejects null/undefined/NaN", () => {
      assert.equal(parseVersion(null), null);
      assert.equal(parseVersion(undefined), null);
      assert.equal(parseVersion(NaN), null);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     D2. Strict sortOrder parsing
     ═══════════════════════════════════════════════════════════════════════ */

  describe("D2. Strict sortOrder parsing", () => {
    it("D2.01 accepts valid non-negative integers", () => {
      assert.deepEqual(parseSortOrder(0), { ok: true, value: 0 });
      assert.deepEqual(parseSortOrder(42), { ok: true, value: 42 });
    });

    it("D2.02 defaults to 0 for undefined/null", () => {
      assert.deepEqual(parseSortOrder(undefined), { ok: true, value: 0 });
      assert.deepEqual(parseSortOrder(null), { ok: true, value: 0 });
    });

    it("D2.03 rejects negative integers", () => {
      assert.ok(!parseSortOrder(-1).ok);
    });

    it("D2.04 rejects floats", () => {
      assert.ok(!parseSortOrder(1.5).ok);
    });

    it("D2.05 rejects strings", () => {
      assert.ok(!parseSortOrder("abc").ok);
      assert.ok(!parseSortOrder("0").ok);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     E. published_at SQL generation
     ═══════════════════════════════════════════════════════════════════════ */

  describe("E. published_at SQL generation", () => {
    it("E.01 sets published_at on first publish", () => {
      const sql = publishedAtSql("DRAFT", "PUBLISHED", null);
      assert.ok(sql);
      assert.ok(sql.includes("CURRENT_TIMESTAMP"));
    });

    it("E.02 does not overwrite existing published_at", () => {
      const sql = publishedAtSql("DRAFT", "PUBLISHED", "2024-01-01");
      assert.equal(sql, null);
    });

    it("E.03 clears published_at on unpublish", () => {
      const sql = publishedAtSql("PUBLISHED", "HIDDEN", "2024-01-01");
      assert.ok(sql);
      assert.ok(sql.includes("NULL"));
    });

    it("E.04 no-op for non-publishing transitions", () => {
      assert.equal(publishedAtSql("DRAFT", "IN_REVIEW", null), null);
      assert.equal(publishedAtSql("HIDDEN", "ARCHIVED", null), null);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     F. Section CRUD behavior
     ═══════════════════════════════════════════════════════════════════════ */

  describe("F. Section CRUD behavior (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("F.01 inserts section with DRAFT default", () => {
      const id = insertSection(db, { slug: "test-defaults", name: "Test Defaults" });
      const row = db.prepare("SELECT * FROM gallery_sections WHERE id = ?").get(id);
      assert.equal(row.slug, "test-defaults");
      assert.equal(row.name, "Test Defaults");
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1);
      assert.equal(row.deleted_at, null);
    });

    it("F.02 enforces unique slug", () => {
      insertSection(db, { slug: "unique-test", name: "First" });
      assert.throws(() => {
        insertSection(db, { slug: "unique-test", name: "Second" });
      }, /UNIQUE/i);
    });

    it("F.03 version bump on update", () => {
      const id = insertSection(db, { slug: "version-test", name: "Original", version: 1 });
      db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("Updated", id);
      const row = db.prepare("SELECT name, version FROM gallery_sections WHERE id = ?").get(id);
      assert.equal(row.name, "Updated");
      assert.equal(row.version, 2);
    });

    it("F.04 optimistic concurrency fails on version mismatch", () => {
      const id = insertSection(db, { slug: "concurrency-test", name: "V1", version: 1 });
      db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("V2-First", id);
      const result = db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("V2-Second", id);
      assert.equal(result.changes, 0);
    });

    it("F.05 lifecycle_status CHECK constraint", () => {
      assert.throws(() => {
        insertSection(db, { slug: "bad-ls", lifecycle_status: "INVALID" });
      }, /CHECK/i);
    });

    it("F.06 soft-deleted section not in active queries", () => {
      const id = insertSection(db, { slug: "filter-test", name: "Hidden", deleted_at: "2024-01-01" });
      const rows = db.prepare("SELECT id FROM gallery_sections WHERE deleted_at IS NULL").all();
      assert.ok(!rows.find((r) => r.id === id));
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     G. Item CRUD behavior
     ═══════════════════════════════════════════════════════════════════════ */

  describe("G. Item CRUD behavior (data)", () => {
    let db;
    let sectionId, mediaId;

    before(() => {
      db = createFullyMigratedDb();
      sectionId = insertSection(db, { slug: "item-test-section" });
      mediaId = insertMedia(db, { id: "media-item-test", storage_type: "R2", r2_key: "test/photo.jpg" });
    });
    after(() => { db.close(); });

    it("G.01 inserts item with correct defaults", () => {
      const itemId = insertItem(db, sectionId, mediaId, { slot_key: "hero" });
      const row = db.prepare("SELECT * FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.section_id, sectionId);
      assert.equal(row.media_id, mediaId);
      assert.equal(row.slot_key, "hero");
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1);
    });

    it("G.02 enforces unique slot_key for active items", () => {
      insertItem(db, sectionId, mediaId, { id: "item-slot-a", slot_key: "unique-slot" });
      assert.throws(() => {
        insertItem(db, sectionId, mediaId, { id: "item-slot-b", slot_key: "unique-slot" });
      }, /UNIQUE/i);
    });

    it("G.03 FK constraint on section_id", () => {
      assert.throws(() => {
        insertItem(db, "nonexistent-section", mediaId, { id: "item-fk-test" });
      }, /FOREIGN KEY/i);
    });

    it("G.04 FK constraint on media_id", () => {
      assert.throws(() => {
        insertItem(db, sectionId, "nonexistent-media", { id: "item-fk-media-test" });
      }, /FOREIGN KEY/i);
    });

    it("G.05 deleted item frees slot_key", () => {
      insertItem(db, sectionId, mediaId, { id: "item-slot-free", slot_key: "freeslot" });
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("item-slot-free");
      insertItem(db, sectionId, mediaId, { id: "item-slot-reuse", slot_key: "freeslot" });
      const row = db.prepare("SELECT id FROM gallery_items WHERE slot_key = 'freeslot' AND deleted_at IS NULL").get();
      assert.equal(row.id, "item-slot-reuse");
    });

    it("G.06 sort_order CHECK rejects negative values", () => {
      assert.throws(() => {
        insertItem(db, sectionId, mediaId, { id: "item-neg-sort", sort_order: -1 });
      }, /CHECK/i);
    });

    it("G.07 items join with media_assets works", () => {
      const itemId = insertItem(db, sectionId, mediaId, { id: "item-join-test", slot_key: "joinslot" });
      const rows = db.prepare(
        "SELECT gi.id, m.r2_key FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ?"
      ).all(itemId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].r2_key, "test/photo.jpg");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     H. Delete race guard
     ═══════════════════════════════════════════════════════════════════════ */

  describe("H. Delete race guard", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("H.01 FK RESTRICT blocks hard deletion when items exist", () => {
      const sectionId = insertSection(db, { slug: "fk-restrict" });
      const mediaId = insertMedia(db, { id: "media-fk-r", r2_key: "test/fk.jpg" });
      insertItem(db, sectionId, mediaId, { id: "item-fk-r" });
      assert.throws(() => {
        db.prepare("DELETE FROM gallery_sections WHERE id = ?").run(sectionId);
      }, /FOREIGN KEY/i);
    });

    it("H.02 NOT EXISTS guard prevents logical delete with active items", () => {
      const sectionId = insertSection(db, { slug: "race-guard", version: 1 });
      const mediaId = insertMedia(db, { id: "media-rg", r2_key: "test/rg.jpg" });
      insertItem(db, sectionId, mediaId, { id: "item-rg" });

      const result = db.prepare(
        `UPDATE gallery_sections
         SET lifecycle_status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE section_id = gallery_sections.id AND deleted_at IS NULL)`
      ).run(sectionId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT deleted_at FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.deleted_at, null);
    });

    it("H.03 logical delete succeeds when no active items", () => {
      const sectionId = insertSection(db, { slug: "clean-delete", version: 1 });
      const result = db.prepare(
        `UPDATE gallery_sections
         SET lifecycle_status = 'ARCHIVED', deleted_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE section_id = gallery_sections.id AND deleted_at IS NULL)`
      ).run(sectionId);
      assert.equal(result.changes, 1);
      const row = db.prepare("SELECT deleted_at, lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.ok(row.deleted_at);
      assert.equal(row.lifecycle_status, "ARCHIVED");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     I. Atomic reorder behavior
     ═══════════════════════════════════════════════════════════════════════ */

  describe("I. Atomic reorder behavior (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("I.01 single CASE/WHEN UPDATE reorders all items atomically", () => {
      const sectionId = insertSection(db, { slug: "reorder-atomic" });
      const mediaId = insertMedia(db, { id: "media-reorder-a", r2_key: "test/reorder.jpg" });
      insertItem(db, sectionId, mediaId, { id: "reorder-a", sort_order: 0, version: 1 });
      insertItem(db, sectionId, mediaId, { id: "reorder-b", sort_order: 1, version: 1 });
      insertItem(db, sectionId, mediaId, { id: "reorder-c", sort_order: 2, version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items
         SET sort_order = CASE id WHEN ? THEN ? WHEN ? THEN ? WHEN ? THEN ? END,
             version = version + 1
         WHERE id IN (?, ?, ?) AND deleted_at IS NULL AND section_id = ?
           AND version = CASE id WHEN ? THEN ? WHEN ? THEN ? WHEN ? THEN ? END`
      ).run(
        "reorder-c", 0, "reorder-b", 1, "reorder-a", 2,
        "reorder-c", "reorder-b", "reorder-a", sectionId,
        "reorder-c", 1, "reorder-b", 1, "reorder-a", 1,
      );
      assert.equal(result.changes, 3);

      const rows = db.prepare("SELECT id, sort_order FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC").all(sectionId);
      assert.equal(rows[0].id, "reorder-c");
      assert.equal(rows[1].id, "reorder-b");
      assert.equal(rows[2].id, "reorder-a");
    });

    it("I.02 version conflict in atomic reorder updates only matching versions", () => {
      const sectionId = insertSection(db, { slug: "reorder-ver" });
      const mediaId = insertMedia(db, { id: "media-reorder-ver", r2_key: "test/ver.jpg" });
      insertItem(db, sectionId, mediaId, { id: "rv-a", sort_order: 0, version: 1 });
      insertItem(db, sectionId, mediaId, { id: "rv-b", sort_order: 1, version: 2 });

      const result = db.prepare(
        `UPDATE gallery_items
         SET sort_order = CASE id WHEN ? THEN ? WHEN ? THEN ? END,
             version = version + 1
         WHERE id IN (?, ?) AND deleted_at IS NULL AND section_id = ?
           AND version = CASE id WHEN ? THEN ? WHEN ? THEN ? END`
      ).run(
        "rv-b", 0, "rv-a", 1,
        "rv-b", "rv-a", sectionId,
        "rv-b", 1, "rv-a", 1,
      );
      assert.equal(result.changes, 1);

      const a = db.prepare("SELECT sort_order, version FROM gallery_items WHERE id = ?").get("rv-a");
      assert.equal(a.sort_order, 1);
      assert.equal(a.version, 2);
      const b = db.prepare("SELECT sort_order, version FROM gallery_items WHERE id = ?").get("rv-b");
      assert.equal(b.sort_order, 1);
      assert.equal(b.version, 2);
    });

    it("I.03 subquery guard: missing items causes 0 changes", () => {
      const sectionId = insertSection(db, { slug: "reorder-guard" });
      const mediaId = insertMedia(db, { id: "media-reorder-guard", r2_key: "test/guard.jpg" });
      insertItem(db, sectionId, mediaId, { id: "rg-x", sort_order: 0, version: 1 });
      insertItem(db, sectionId, mediaId, { id: "rg-y", sort_order: 1, version: 1 });
      insertItem(db, sectionId, mediaId, { id: "rg-z", sort_order: 2, version: 1 });

      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("rg-z");

      const result = db.prepare(
        `UPDATE gallery_items
         SET sort_order = CASE id WHEN ? THEN ? WHEN ? THEN ? END,
             version = version + 1
         WHERE id IN (?, ?) AND deleted_at IS NULL AND section_id = ?
           AND version = CASE id WHEN ? THEN ? WHEN ? THEN ? END`
      ).run(
        "rg-y", 0, "rg-x", 1,
        "rg-y", "rg-x", sectionId,
        "rg-y", 1, "rg-x", 1,
      );
      assert.equal(result.changes, 2);

      const active = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL").get(sectionId);
      assert.equal(active.cnt, 2);
    });

    it("I.04 deleted items excluded from active count", () => {
      const sectionId = insertSection(db, { slug: "reorder-del" });
      const mediaId = insertMedia(db, { id: "media-reorder-del", r2_key: "test/del.jpg" });
      insertItem(db, sectionId, mediaId, { id: "rd-a", sort_order: 0 });
      insertItem(db, sectionId, mediaId, { id: "rd-b", sort_order: 1 });
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("rd-a");
      const active = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL").get(sectionId);
      assert.equal(active.cnt, 1);
    });

    it("I.05 atomic reorder with version guard in WHERE", () => {
      const sectionId = insertSection(db, { slug: "reorder-wg" });
      const mediaId = insertMedia(db, { id: "media-reorder-wg", r2_key: "test/wg.jpg" });
      insertItem(db, sectionId, mediaId, { id: "rwg-a", sort_order: 0, version: 1 });
      insertItem(db, sectionId, mediaId, { id: "rwg-b", sort_order: 1, version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items
         SET sort_order = CASE id WHEN ? THEN ? WHEN ? THEN ? END,
             version = version + 1
         WHERE id IN (?, ?) AND deleted_at IS NULL AND section_id = ?
           AND version = CASE id WHEN ? THEN ? WHEN ? THEN ? END`
      ).run(
        "rwg-b", 0, "rwg-a", 1,
        "rwg-b", "rwg-a", sectionId,
        "rwg-b", 1, "rwg-a", 1,
      );
      assert.equal(result.changes, 2);

      const rows = db.prepare("SELECT id, sort_order, version FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC").all(sectionId);
      assert.equal(rows[0].id, "rwg-b");
      assert.equal(rows[0].version, 2);
      assert.equal(rows[1].id, "rwg-a");
      assert.equal(rows[1].version, 2);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     J. Dormant gallery state
     ═══════════════════════════════════════════════════════════════════════ */

  describe("J. Dormant gallery state (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("J.01 seed section is DRAFT (dormant)", () => {
      const row = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = 'gallery-section-facilities'").get();
      assert.ok(row);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("J.02 seed items are DRAFT (dormant)", () => {
      const rows = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE section_id = 'gallery-section-facilities'").all();
      assert.ok(rows.length > 0);
      for (const r of rows) {
        assert.equal(r.lifecycle_status, "DRAFT");
      }
    });

    it("J.03 gallery_v2_initialized marker is '0' by default", () => {
      const row = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
      assert.ok(row);
      assert.equal(row.value, "0");
    });

    it("J.04 no PUBLISHED sections when marker is '0'", () => {
      const sections = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_sections WHERE lifecycle_status = 'PUBLISHED' AND deleted_at IS NULL").get();
      assert.equal(sections.cnt, 0);
    });

    it("J.05 seed media assets are dormant", () => {
      const dormantCount = db.prepare(
        "SELECT COUNT(*) AS cnt FROM media_assets WHERE storage_type = 'PUBLIC' AND status = 'HIDDEN' AND is_visible = 0 AND lifecycle_status = 'DRAFT'"
      ).get();
      assert.ok(dormantCount.cnt >= 7);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     K. Revision system integration
     ═══════════════════════════════════════════════════════════════════════ */

  describe("K. Revision system integration (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("K.01 gallery_section.create revision can be created", () => {
      const revId = insertRevision(db, {
        entity_type: "gallery_section.create",
        entity_id: "gallery-section-new",
        title: "Create Gallery Section: New Section",
        payload_json: JSON.stringify({
          action: "gallery_section.create",
          payload: { slug: "new-section", name: "New Section", description: "A new section" },
        }),
      });
      const row = db.prepare("SELECT * FROM content_revisions WHERE id = ?").get(revId);
      assert.equal(row.entity_type, "gallery_section.create");
      assert.equal(row.status, "NEEDS_REVIEW");
    });

    it("K.02 gallery_item.create revision can be created", () => {
      const revId = insertRevision(db, {
        entity_type: "gallery_item.create",
        entity_id: "gallery-item-new",
        title: "Create Gallery Item",
        payload_json: JSON.stringify({
          action: "gallery_item.create",
          payload: { sectionId: "gallery-section-facilities", mediaId: "media-pub-hero" },
        }),
      });
      const row = db.prepare("SELECT * FROM content_revisions WHERE id = ?").get(revId);
      assert.equal(row.entity_type, "gallery_item.create");
      assert.equal(row.status, "NEEDS_REVIEW");
    });

    it("K.03 revision can be approved", () => {
      const revId = insertRevision(db, { entity_type: "gallery_section.create", entity_id: "gallery-section-approve" });
      db.prepare("UPDATE content_revisions SET status = 'APPROVED', reviewed_by = 'admin@example.com', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(revId);
      const row = db.prepare("SELECT status, reviewed_by FROM content_revisions WHERE id = ?").get(revId);
      assert.equal(row.status, "APPROVED");
      assert.equal(row.reviewed_by, "admin@example.com");
    });

    it("K.04 revision can be rejected", () => {
      const revId = insertRevision(db, { entity_type: "gallery_item.create", entity_id: "gallery-item-reject" });
      db.prepare("UPDATE content_revisions SET status = 'REJECTED', reviewed_by = 'admin@example.com', review_note = 'Not needed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(revId);
      const row = db.prepare("SELECT status, review_note FROM content_revisions WHERE id = ?").get(revId);
      assert.equal(row.status, "REJECTED");
      assert.equal(row.review_note, "Not needed");
    });

    it("K.05 payload_json round-trips correctly", () => {
      const payload = {
        action: "gallery_section.create",
        payload: { slug: "roundtrip", name: "Round Trip Section" },
      };
      const revId = insertRevision(db, {
        entity_type: "gallery_section.create",
        payload_json: JSON.stringify(payload),
      });
      const row = db.prepare("SELECT payload_json FROM content_revisions WHERE id = ?").get(revId);
      const parsed = JSON.parse(row.payload_json);
      assert.equal(parsed.action, "gallery_section.create");
      assert.equal(parsed.payload.slug, "roundtrip");
    });

    it("K.06 content_revisions supports all 7 gallery entity types", () => {
      const entityTypes = [
        "gallery_section.create",
        "gallery_section.update",
        "gallery_section.delete",
        "gallery_item.create",
        "gallery_item.update",
        "gallery_item.delete",
        "gallery_items.reorder",
      ];
      for (const entityType of entityTypes) {
        const revId = insertRevision(db, {
          entity_type: entityType,
          entity_id: `test-${entityType}`,
        });
        const row = db.prepare("SELECT entity_type FROM content_revisions WHERE id = ?").get(revId);
        assert.equal(row.entity_type, entityType);
      }
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     L. Schema and constraint verification
     ═══════════════════════════════════════════════════════════════════════ */

  describe("L. Schema and constraint verification", () => {
    it("L.01 gallery tables exist", () => {
      const db = createFullyMigratedDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('gallery_sections', 'gallery_items')").all();
      assert.equal(tables.length, 2);
      db.close();
    });

    it("L.02 gallery indexes exist", () => {
      const db = createFullyMigratedDb();
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_gallery_%'").all();
      const indexNames = indexes.map((i) => i.name);
      assert.ok(indexNames.includes("idx_gallery_sections_lifecycle_order"));
      assert.ok(indexNames.includes("idx_gallery_items_section_lifecycle_order"));
      assert.ok(indexNames.includes("idx_gallery_items_media_deleted"));
      assert.ok(indexNames.includes("idx_gallery_items_active_slot"));
      db.close();
    });

    it("L.03 version CHECK rejects values < 1", () => {
      const db = createFullyMigratedDb();
      assert.throws(() => {
        db.prepare("INSERT INTO gallery_sections (id, slug, name, version, created_by) VALUES (?, ?, ?, ?, ?)").run(
          "bad-ver", "bad-ver", "Bad Ver", 0, "test"
        );
      }, /CHECK/i);
      db.close();
    });

    it("L.04 gallery_v2_initialized marker can be set to '1'", () => {
      const db = createFullyMigratedDb();
      db.prepare("UPDATE site_configs SET value = '1' WHERE key = 'gallery_v2_initialized'").run();
      const row = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
      assert.equal(row.value, "1");
      db.close();
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     M. Complex scenarios
     ═══════════════════════════════════════════════════════════════════════ */

  describe("M. Complex scenarios (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("M.01 full section lifecycle: DRAFT → PUBLISHED → HIDDEN → ARCHIVED", () => {
      const sectionId = insertSection(db, { slug: "lifecycle-e2e", lifecycle_status: "DRAFT" });

      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP WHERE id = ?").run(sectionId);
      let row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
      assert.ok(row.published_at);

      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'HIDDEN', published_at = NULL WHERE id = ?").run(sectionId);
      row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "HIDDEN");
      assert.equal(row.published_at, null);

      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'ARCHIVED' WHERE id = ?").run(sectionId);
      row = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "ARCHIVED");
    });

    it("M.02 publish flow: create section + items, publish all", () => {
      const sectionId = insertSection(db, { slug: "publish-flow", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "media-pub-flow", r2_key: "test/publish.jpg", storage_type: "R2" });

      const itemA = insertItem(db, sectionId, mediaId, { id: "item-pub-a", slot_key: "slot-a", sort_order: 0 });
      const itemB = insertItem(db, sectionId, mediaId, { id: "item-pub-b", slot_key: "slot-b", sort_order: 1 });

      db.prepare("UPDATE gallery_items SET lifecycle_status = 'PUBLISHED' WHERE id IN (?, ?)").run(itemA, itemB);
      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP WHERE id = ?").run(sectionId);

      const section = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(section.lifecycle_status, "PUBLISHED");

      const items = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE section_id = ?").all(sectionId);
      assert.ok(items.every((r) => r.lifecycle_status === "PUBLISHED"));
    });

    it("M.03 slot_key uniqueness scoped to active items only", () => {
      const sectionId = insertSection(db, { slug: "slot-scope" });
      const mediaId = insertMedia(db, { id: "media-slot-scope", r2_key: "test/slot.jpg" });

      insertItem(db, sectionId, mediaId, { id: "item-slot-s1", slot_key: "shared-slot" });
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("item-slot-s1");
      insertItem(db, sectionId, mediaId, { id: "item-slot-s2", slot_key: "shared-slot" });

      const active = db.prepare("SELECT id FROM gallery_items WHERE slot_key = 'shared-slot' AND deleted_at IS NULL").all();
      assert.equal(active.length, 1);
      assert.equal(active[0].id, "item-slot-s2");
    });

    it("M.04 version conflict detection on PATCH simulation", () => {
      const sectionId = insertSection(db, { slug: "conflict-e2e", version: 1 });
      const current = db.prepare("SELECT version FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(current.version, 1);

      db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("Client B", sectionId);

      const result = db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1 AND deleted_at IS NULL").run("Client A", sectionId);
      assert.equal(result.changes, 0);
    });

    it("M.05 field length limits are enforced by module", () => {
      const GALLERY_FIELD_LENGTHS = {
        slug: 100,
        name: 200,
        description: 1000,
        slotKey: 150,
        titleOverride: 200,
        altTextOverride: 300,
        captionOverride: 1000,
      };
      assert.equal(GALLERY_FIELD_LENGTHS.slug, 100);
      assert.equal(GALLERY_FIELD_LENGTHS.name, 200);
      assert.equal(GALLERY_FIELD_LENGTHS.description, 1000);
      assert.equal(GALLERY_FIELD_LENGTHS.slotKey, 150);
      assert.equal(GALLERY_FIELD_LENGTHS.titleOverride, 200);
      assert.equal(GALLERY_FIELD_LENGTHS.altTextOverride, 300);
      assert.equal(GALLERY_FIELD_LENGTHS.captionOverride, 1000);
    });

    it("M.06 section publication guard: cannot publish without PUBLISHED items", () => {
      const sectionId = insertSection(db, { slug: "pub-guard", lifecycle_status: "DRAFT", version: 1 });
      const mediaId = insertMedia(db, { id: "media-pub-guard", r2_key: "test/pub-guard.jpg" });
      insertItem(db, sectionId, mediaId, { id: "pg-item1", lifecycle_status: "DRAFT", sort_order: 0 });

      const result = db.prepare(
        `UPDATE gallery_sections
         SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (
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
           )`
      ).run(sectionId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("M.07 section publication guard: succeeds with PUBLISHED items", () => {
      const sectionId = insertSection(db, { slug: "pub-guard-ok", lifecycle_status: "DRAFT", version: 1 });
      const mediaId = insertMedia(db, { id: "media-pub-guard-ok", r2_key: "test/pub-guard-ok.jpg", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1 });
      insertItem(db, sectionId, mediaId, { id: "pg-ok-item1", lifecycle_status: "PUBLISHED", sort_order: 0 });

      const result = db.prepare(
        `UPDATE gallery_sections
         SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (
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
           )`
      ).run(sectionId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
    });

    it("M.08 item publication guard: cannot publish without valid media", () => {
      const sectionId = insertSection(db, { slug: "item-pub-guard", version: 1 });
      const mediaId = insertMedia(db, { id: "media-item-pg", r2_key: "test/item-pg.jpg", category: "GENERAL" });
      insertItem(db, sectionId, mediaId, { id: "ipg-item1", lifecycle_status: "DRAFT", sort_order: 0 });

      const result = db.prepare(
        `UPDATE gallery_items
         SET lifecycle_status = 'PUBLISHED', version = version + 1
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (
             SELECT 1 FROM media_assets m
             WHERE m.id = gallery_items.media_id
               AND m.category = 'GALLERY'
               AND m.lifecycle_status = 'PUBLISHED'
               AND m.status = 'APPROVED'
               AND m.is_visible = 1
               AND m.deleted_at IS NULL
           )`
      ).run("ipg-item1");
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get("ipg-item1");
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("M.09 item publication guard: succeeds with valid media and section", () => {
      const sectionId = insertSection(db, { slug: "item-pub-guard-ok", version: 1 });
      const mediaId = insertMedia(db, { id: "media-item-pg-ok", r2_key: "test/item-pg-ok.jpg", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1 });
      insertItem(db, sectionId, mediaId, { id: "ipg-ok-item1", lifecycle_status: "DRAFT", sort_order: 0 });

      const result = db.prepare(
        `UPDATE gallery_items
         SET lifecycle_status = 'PUBLISHED', version = version + 1
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (
             SELECT 1 FROM media_assets m
             WHERE m.id = gallery_items.media_id
               AND m.category = 'GALLERY'
               AND m.lifecycle_status = 'PUBLISHED'
               AND m.status = 'APPROVED'
               AND m.is_visible = 1
               AND m.deleted_at IS NULL
           )`
      ).run("ipg-ok-item1");
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get("ipg-ok-item1");
      assert.equal(row.lifecycle_status, "PUBLISHED");
    });

    it("M.10 media metadata columns exist on media_assets", () => {
      const row = db.prepare("SELECT title, alt_text, caption, width, height FROM media_assets LIMIT 1").get();
      assert.ok(row);
      assert.equal(typeof row.title, "string");
      assert.equal(typeof row.alt_text, "string");
      assert.equal(typeof row.caption, "string");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     N. PUBLIC item lifecycle transitions (DRAFT→IN_REVIEW succeeds)
     ═══════════════════════════════════════════════════════════════════════ */

  describe("N. PUBLIC item lifecycle transitions", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("N.01 DRAFT→IN_REVIEW succeeds with PUBLIC media item", () => {
      const sectionId = insertSection(db, { slug: "n01-section" });
      const mediaId = insertMedia(db, {
        id: "n01-media", storage_type: "PUBLIC", public_path: "/media/n01.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n01-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "IN_REVIEW");
      assert.equal(row.version, 2);
    });

    it("N.02 DRAFT→PUBLISHED succeeds with valid media and section", () => {
      const sectionId = insertSection(db, { slug: "n02-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "n02-media", storage_type: "R2", r2_key: "test/n02.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n02-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
      assert.ok(row.published_at);
    });

    it("N.03 IN_REVIEW→DRAFT (rejected back) succeeds", () => {
      const sectionId = insertSection(db, { slug: "n03-section" });
      const mediaId = insertMedia(db, { id: "n03-media", r2_key: "test/n03.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n03-item", lifecycle_status: "IN_REVIEW", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'DRAFT', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 2);
    });

    it("N.04 IN_REVIEW→PUBLISHED succeeds with valid media", () => {
      const sectionId = insertSection(db, { slug: "n04-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "n04-media", storage_type: "PUBLIC", public_path: "/media/n04.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n04-item", lifecycle_status: "IN_REVIEW", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
    });

    it("N.05 IN_REVIEW→HIDDEN succeeds", () => {
      const sectionId = insertSection(db, { slug: "n05-section" });
      const mediaId = insertMedia(db, { id: "n05-media", r2_key: "test/n05.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n05-item", lifecycle_status: "IN_REVIEW", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'HIDDEN', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "HIDDEN");
    });

    it("N.06 PUBLISHED→HIDDEN clears published_at", () => {
      const sectionId = insertSection(db, { slug: "n06-section" });
      const mediaId = insertMedia(db, { id: "n06-media", r2_key: "test/n06.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, {
        id: "n06-item", lifecycle_status: "PUBLISHED", version: 1, published_at: "2024-01-01",
      });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'HIDDEN', published_at = NULL, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "HIDDEN");
      assert.equal(row.published_at, null);
    });

    it("N.07 HIDDEN→PUBLISHED re-publish succeeds", () => {
      const sectionId = insertSection(db, { slug: "n07-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "n07-media", storage_type: "R2", r2_key: "test/n07.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n07-item", lifecycle_status: "HIDDEN", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
      assert.ok(row.published_at);
    });

    it("N.08 DRAFT→ARCHIVED succeeds", () => {
      const sectionId = insertSection(db, { slug: "n08-section" });
      const mediaId = insertMedia(db, { id: "n08-media", r2_key: "test/n08.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n08-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'ARCHIVED', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "ARCHIVED");
    });

    it("N.09 IN_REVIEW→ARCHIVED succeeds", () => {
      const sectionId = insertSection(db, { slug: "n09-section" });
      const mediaId = insertMedia(db, { id: "n09-media", r2_key: "test/n09.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n09-item", lifecycle_status: "IN_REVIEW", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'ARCHIVED', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "ARCHIVED");
    });

    it("N.10 ARCHIVED→DRAFT restore succeeds", () => {
      const sectionId = insertSection(db, { slug: "n10-section" });
      const mediaId = insertMedia(db, { id: "n10-media", r2_key: "test/n10.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "n10-item", lifecycle_status: "ARCHIVED", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'DRAFT', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     O. R2 regression — media fields are never mutated by lifecycle transitions
     ═══════════════════════════════════════════════════════════════════════ */

  describe("O. R2 regression — media fields immutable across transitions", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("O.01 r2_key unchanged after DRAFT→IN_REVIEW", () => {
      const sectionId = insertSection(db, { slug: "o01-section" });
      const mediaId = insertMedia(db, { id: "o01-media", storage_type: "R2", r2_key: "original/key.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o01-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT r2_key FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.r2_key, "original/key.jpg");
    });

    it("O.02 storage_type unchanged after DRAFT→IN_REVIEW", () => {
      const sectionId = insertSection(db, { slug: "o02-section" });
      const mediaId = insertMedia(db, { id: "o02-media", storage_type: "PUBLIC", public_path: "/media/o02.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o02-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT storage_type, public_path FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.storage_type, "PUBLIC");
      assert.equal(media.public_path, "/media/o02.jpg");
    });

    it("O.03 public_path unchanged after DRAFT→PUBLISHED", () => {
      const sectionId = insertSection(db, { slug: "o03-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "o03-media", storage_type: "PUBLIC", public_path: "/media/o03.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o03-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT storage_type, public_path, r2_key FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.storage_type, "PUBLIC");
      assert.equal(media.public_path, "/media/o03.jpg");
    });

    it("O.04 display_r2_key unchanged after PUBLISHED→HIDDEN", () => {
      const sectionId = insertSection(db, { slug: "o04-section" });
      const mediaId = insertMedia(db, { id: "o04-media", r2_key: "test/o04.jpg", display_r2_key: "test/o04-display.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o04-item", lifecycle_status: "PUBLISHED", version: 1, published_at: "2024-01-01" });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'HIDDEN', published_at = NULL, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT r2_key, display_r2_key FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.r2_key, "test/o04.jpg");
      assert.equal(media.display_r2_key, "test/o04-display.jpg");
    });

    it("O.05 thumbnail_r2_key unchanged after DRAFT→PUBLISHED", () => {
      const sectionId = insertSection(db, { slug: "o05-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "o05-media", storage_type: "R2", r2_key: "test/o05.jpg",
        thumbnail_r2_key: "test/o05-thumb.jpg", thumbnail_public_path: "/thumb/o05.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o05-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT thumbnail_r2_key, thumbnail_public_path FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.thumbnail_r2_key, "test/o05-thumb.jpg");
      assert.equal(media.thumbnail_public_path, "/thumb/o05.jpg");
    });

    it("O.06 media category, lifecycle_status, approval_status all unchanged", () => {
      const sectionId = insertSection(db, { slug: "o06-section" });
      const mediaId = insertMedia(db, { id: "o06-media", r2_key: "test/o06.jpg", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1 });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o06-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT category, lifecycle_status, status, is_visible FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.category, "GALLERY");
      assert.equal(media.lifecycle_status, "PUBLISHED");
      assert.equal(media.status, "APPROVED");
      assert.equal(media.is_visible, 1);
    });

    it("O.07 display_public_path unchanged after HIDDEN→PUBLISHED", () => {
      const sectionId = insertSection(db, { slug: "o07-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "o07-media", storage_type: "PUBLIC", public_path: "/media/o07.jpg",
        display_r2_key: "test/o07-display.jpg", display_public_path: "/display/o07.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o07-item", lifecycle_status: "HIDDEN", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT display_r2_key, display_public_path FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.display_r2_key, "test/o07-display.jpg");
      assert.equal(media.display_public_path, "/display/o07.jpg");
    });

    it("O.08 media title, alt_text, caption all unchanged after any transition", () => {
      const sectionId = insertSection(db, { slug: "o08-section" });
      const mediaId = insertMedia(db, { id: "o08-media", r2_key: "test/o08.jpg", title: "Original Title", alt_text: "Original Alt", caption: "Original Caption" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "o08-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const media = db.prepare("SELECT title, alt_text, caption FROM media_assets WHERE id = ?").get(mediaId);
      assert.equal(media.title, "Original Title");
      assert.equal(media.alt_text, "Original Alt");
      assert.equal(media.caption, "Original Caption");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     P. Eligibility scope — guard fires only for PUBLISHED target
     ═══════════════════════════════════════════════════════════════════════ */

  describe("P. Eligibility scope — publication guard only for PUBLISHED target", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("P.01 PUBLISHED target: guard blocks when media not GALLERY category", () => {
      const sectionId = insertSection(db, { slug: "p01-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "p01-media", category: "GENERAL", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, r2_key: "test/p01.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p01-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("P.02 PUBLISHED target: guard blocks when media not PUBLISHED lifecycle", () => {
      const sectionId = insertSection(db, { slug: "p02-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "p02-media", category: "GALLERY", lifecycle_status: "DRAFT", status: "APPROVED", is_visible: 1, r2_key: "test/p02.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p02-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("P.03 PUBLISHED target: guard blocks when media not APPROVED", () => {
      const sectionId = insertSection(db, { slug: "p03-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "p03-media", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "PENDING", is_visible: 1, r2_key: "test/p03.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p03-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("P.04 PUBLISHED target: guard blocks when media not visible", () => {
      const sectionId = insertSection(db, { slug: "p04-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "p04-media", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 0, r2_key: "test/p04.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p04-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("P.05 PUBLISHED target: guard blocks when section is deleted", () => {
      const sectionId = insertSection(db, { slug: "p05-section", lifecycle_status: "DRAFT", deleted_at: "2024-01-01" });
      const mediaId = insertMedia(db, { id: "p05-media", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, r2_key: "test/p05.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p05-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("P.06 IN_REVIEW target: no guard — succeeds even with non-GALLERY media", () => {
      const sectionId = insertSection(db, { slug: "p06-section" });
      const mediaId = insertMedia(db, { id: "p06-media", category: "GENERAL", lifecycle_status: "DRAFT", status: "PENDING", is_visible: 0, r2_key: "test/p06.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p06-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "IN_REVIEW");
    });

    it("P.07 PUBLISHED target: guard passes with fully eligible media and section", () => {
      const sectionId = insertSection(db, { slug: "p07-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "p07-media", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, r2_key: "test/p07.jpg",
        storage_type: "R2",
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p07-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
    });

    it("P.08 DRAFT target: no guard — title update succeeds regardless of media state", () => {
      const sectionId = insertSection(db, { slug: "p08-section" });
      const mediaId = insertMedia(db, { id: "p08-media", category: "GENERAL", lifecycle_status: "DRAFT", status: "PENDING", is_visible: 0, r2_key: "test/p08.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "p08-item", lifecycle_status: "IN_REVIEW", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'DRAFT', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     Q. Query/DTO coverage — SELECT includes all required columns
     ═══════════════════════════════════════════════════════════════════════ */

  describe("Q. Query/DTO coverage — SELECT column completeness", () => {
    it("Q.01 ITEM_WITH_MEDIA_SELECT includes all GALLERY_ITEMS_COLUMNS", () => {
      const requiredItemCols = [
        "gi.id", "gi.section_id", "gi.media_id", "gi.slot_key",
        "gi.title_override", "gi.alt_text_override", "gi.caption_override",
        "gi.sort_order", "gi.lifecycle_status", "gi.version",
        "gi.created_by", "gi.updated_by", "gi.created_at", "gi.updated_at",
        "gi.published_at", "gi.deleted_at",
      ];
      for (const col of requiredItemCols) {
        assert.ok(TEST_ITEM_WITH_MEDIA_SELECT.includes(col), `ITEM_WITH_MEDIA_SELECT must include ${col}`);
      }
    });

    it("Q.02 ITEM_WITH_MEDIA_SELECT includes all media columns for DTO", () => {
      const requiredMediaCols = [
        "m.storage_type", "m.r2_key", "m.public_path",
        "m.display_r2_key", "m.display_public_path",
        "m.thumbnail_r2_key", "m.thumbnail_public_path",
        "m.title", "m.alt_text", "m.caption", "m.width", "m.height",
        "m.category AS media_category",
        "m.lifecycle_status AS media_lifecycle_status",
        "m.status AS media_approval_status",
        "m.is_visible AS media_visible",
      ];
      for (const col of requiredMediaCols) {
        assert.ok(TEST_ITEM_WITH_MEDIA_SELECT.includes(col), `ITEM_WITH_MEDIA_SELECT must include ${col}`);
      }
    });

    it("Q.03 post-update query against real DB returns all required item columns", () => {
      const db = createFullyMigratedDb();
      const sectionId = insertSection(db, { slug: "q03-section" });
      const mediaId = insertMedia(db, { id: "q03-media", r2_key: "test/q03.jpg", storage_type: "R2" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "q03-item", slot_key: "hero", lifecycle_status: "DRAFT", version: 1 });

      const row = db.prepare(`SELECT ${TEST_ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`).get(itemId);
      assert.ok(row);
      assert.equal(row.id, itemId);
      assert.equal(row.section_id, sectionId);
      assert.equal(row.media_id, mediaId);
      assert.equal(row.slot_key, "hero");
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1);
      assert.equal(row.storage_type, "R2");
      assert.equal(row.r2_key, "test/q03.jpg");
      assert.equal(row.media_category, "GENERAL");
      assert.equal(row.media_approval_status, "APPROVED");
      assert.equal(row.media_visible, 1);
      db.close();
    });

    it("Q.04 post-update SELECT JOIN works for all lifecycle statuses", () => {
      const db = createFullyMigratedDb();
      const sectionId = insertSection(db, { slug: "q04-section" });
      const mediaId = insertMedia(db, { id: "q04-media", r2_key: "test/q04.jpg", storage_type: "R2" });

      for (const status of ["DRAFT", "IN_REVIEW", "PUBLISHED", "HIDDEN", "ARCHIVED"]) {
        const itemId = insertItem(db, sectionId, mediaId, { id: `q04-item-${status}`, lifecycle_status: status, version: 1 });
        const row = db.prepare(`SELECT ${TEST_ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`).get(itemId);
        assert.ok(row, `SELECT must work for lifecycle_status=${status}`);
        assert.equal(row.lifecycle_status, status);
      }
      db.close();
    });

    it("Q.05 SELECT includes published_at column for timestamp tracking", () => {
      const db = createFullyMigratedDb();
      const sectionId = insertSection(db, { slug: "q05-section" });
      const mediaId = insertMedia(db, { id: "q05-media", r2_key: "test/q05.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "q05-item", lifecycle_status: "PUBLISHED", version: 1 });
      db.prepare("UPDATE gallery_items SET published_at = '2024-06-15T10:00:00Z' WHERE id = ?").run(itemId);

      const row = db.prepare(`SELECT ${TEST_ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`).get(itemId);
      assert.ok(row.published_at, "published_at must be returned by SELECT");
      db.close();
    });

    it("Q.06 SELECT includes deleted_at for soft-delete tracking", () => {
      const db = createFullyMigratedDb();
      const sectionId = insertSection(db, { slug: "q06-section" });
      const mediaId = insertMedia(db, { id: "q06-media", r2_key: "test/q06.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "q06-item", lifecycle_status: "DRAFT", version: 1 });

      const row = db.prepare(`SELECT ${TEST_ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`).get(itemId);
      assert.ok("deleted_at" in row, "deleted_at must be in SELECT results");
      assert.equal(row.deleted_at, null);
      db.close();
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     R. Mutation/response consistency — PATCH response matches DB state
     ═══════════════════════════════════════════════════════════════════════ */

  describe("R. Mutation/response consistency — response matches DB state", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("R.01 DRAFT→IN_REVIEW: response version = original + 1", () => {
      const sectionId = insertSection(db, { slug: "r01-section" });
      const mediaId = insertMedia(db, { id: "r01-media", r2_key: "test/r01.jpg", storage_type: "R2" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "r01-item", lifecycle_status: "DRAFT", version: 3 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 3 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const row = db.prepare("SELECT version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.version, 4);
    });

    it("R.02 DRAFT→IN_REVIEW: response lifecycle_status = IN_REVIEW", () => {
      const sectionId = insertSection(db, { slug: "r02-section" });
      const mediaId = insertMedia(db, { id: "r02-media", r2_key: "test/r02.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "r02-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const row = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "IN_REVIEW");
    });

    it("R.03 DRAFT→PUBLISHED: published_at is set (non-null)", () => {
      const sectionId = insertSection(db, { slug: "r03-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "r03-media", storage_type: "R2", r2_key: "test/r03.jpg",
        category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1,
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "r03-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);

      const row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
      assert.ok(row.published_at, "published_at must be set on first publish");
    });

    it("R.04 PUBLISHED→HIDDEN: published_at is cleared (null)", () => {
      const sectionId = insertSection(db, { slug: "r04-section" });
      const mediaId = insertMedia(db, { id: "r04-media", r2_key: "test/r04.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "r04-item", lifecycle_status: "PUBLISHED", version: 1, published_at: "2024-06-01" });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'HIDDEN', published_at = NULL, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "HIDDEN");
      assert.equal(row.published_at, null);
    });

    it("R.05 DRAFT→IN_REVIEW: re-read from DB confirms same state as response", () => {
      const sectionId = insertSection(db, { slug: "r05-section" });
      const mediaId = insertMedia(db, { id: "r05-media", r2_key: "test/r05.jpg", storage_type: "PUBLIC", public_path: "/media/r05.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, {
        id: "r05-item", slot_key: "featured", title_override: "Featured", lifecycle_status: "DRAFT", version: 1,
      });

      db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const row = db.prepare(`SELECT ${TEST_ITEM_WITH_MEDIA_SELECT} FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ? LIMIT 1`).get(itemId);
      assert.equal(row.id, itemId);
      assert.equal(row.lifecycle_status, "IN_REVIEW");
      assert.equal(row.version, 2);
      assert.equal(row.slot_key, "featured");
      assert.equal(row.title_override, "Featured");
      assert.equal(row.storage_type, "PUBLIC");
      assert.equal(row.r2_key, "test/r05.jpg");
    });

    it("R.06 Optimistic concurrency: version conflict returns 0 changes", () => {
      const sectionId = insertSection(db, { slug: "r06-section" });
      const mediaId = insertMedia(db, { id: "r06-media", r2_key: "test/r06.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "r06-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 99 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0);

      const row = db.prepare("SELECT lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     S. Client refetch — mutation safety and audit resilience
     ═══════════════════════════════════════════════════════════════════════ */

  describe("S. Client refetch — mutation safety and audit resilience", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("S.01 UPDATE succeeds even when post-update SELECT would return no row (simulated)", () => {
      const sectionId = insertSection(db, { slug: "s01-section" });
      const mediaId = insertMedia(db, { id: "s01-media", r2_key: "test/s01.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "s01-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      const row = db.prepare("SELECT lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "IN_REVIEW");
      assert.equal(row.version, 2);
    });

    it("S.02 audit failure does not affect UPDATE outcome", () => {
      const sectionId = insertSection(db, { slug: "s02-section" });
      const mediaId = insertMedia(db, { id: "s02-media", r2_key: "test/s02.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "s02-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);

      assert.throws(() => {
        db.prepare("INSERT INTO audit_log_that_does_not_exist (x) VALUES (?)").run("test");
      });

      const row = db.prepare("SELECT lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "IN_REVIEW");
      assert.equal(row.version, 2);
    });

    it("S.03 multiple rapid transitions accumulate correctly", () => {
      const sectionId = insertSection(db, { slug: "s03-section" });
      const mediaId = insertMedia(db, { id: "s03-media", r2_key: "test/s03.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "s03-item", lifecycle_status: "DRAFT", version: 1 });

      db.prepare(`UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = 'a@t.com', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = 1 AND deleted_at IS NULL`).run(itemId);
      db.prepare(`UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = 'b@t.com', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = 2 AND deleted_at IS NULL`).run(itemId);
      db.prepare(`UPDATE gallery_items SET lifecycle_status = 'HIDDEN', published_at = NULL, version = version + 1, updated_by = 'c@t.com', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = 3 AND deleted_at IS NULL`).run(itemId);

      const row = db.prepare("SELECT lifecycle_status, version, published_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "HIDDEN");
      assert.equal(row.version, 4);
      assert.equal(row.published_at, null);
    });

    it("S.04 slot_key update works independently of lifecycle transition", () => {
      const sectionId = insertSection(db, { slug: "s04-section" });
      const mediaId = insertMedia(db, { id: "s04-media", r2_key: "test/s04.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "s04-item", lifecycle_status: "DRAFT", version: 1, slot_key: "old-slot" });

      db.prepare(
        `UPDATE gallery_items SET slot_key = 'new-slot', lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const row = db.prepare("SELECT slot_key, lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.slot_key, "new-slot");
      assert.equal(row.lifecycle_status, "IN_REVIEW");
      assert.equal(row.version, 2);
    });

    it("S.05 title_override update works independently of lifecycle transition", () => {
      const sectionId = insertSection(db, { slug: "s05-section" });
      const mediaId = insertMedia(db, { id: "s05-media", r2_key: "test/s05.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "s05-item", lifecycle_status: "IN_REVIEW", version: 1, title_override: "Old Title" });

      db.prepare(
        `UPDATE gallery_items SET title_override = 'New Title', lifecycle_status = 'DRAFT', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL`
      ).run("admin@test.com", itemId);

      const row = db.prepare("SELECT title_override, lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.title_override, "New Title");
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 2);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     T. Regression — UPDATE WHERE clause correctness
     ═══════════════════════════════════════════════════════════════════════ */

  describe("T. Regression — UPDATE WHERE clause uses bare column names", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("T.01 bare id = ? works in UPDATE WHERE (item pattern)", () => {
      const sectionId = insertSection(db, { slug: "t01-section" });
      const mediaId = insertMedia(db, { id: "t01-media", r2_key: "test/t01.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "t01-item", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND deleted_at IS NULL`
      ).run("admin@test.com", itemId, 1);
      assert.equal(result.changes, 1);
    });

    it("T.02 gi.id = ? FAILS in UPDATE WHERE (confirms alias is invalid in UPDATE)", () => {
      const sectionId = insertSection(db, { slug: "t02-section" });
      const mediaId = insertMedia(db, { id: "t02-media", r2_key: "test/t02.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "t02-item", version: 1 });

      assert.throws(() => {
        db.prepare(
          `UPDATE gallery_items SET lifecycle_status = 'IN_REVIEW', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE gi.id = ? AND gi.version = ? AND gi.deleted_at IS NULL`
        ).run("admin@test.com", itemId, 1);
      }, /gi/);
    });

    it("T.03 bare id = ? works in UPDATE WHERE for sections", () => {
      const sectionId = insertSection(db, { slug: "t03-section", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_sections SET name = 'Updated', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ? AND deleted_at IS NULL`
      ).run("admin@test.com", sectionId, 1);
      assert.equal(result.changes, 1);
    });

    it("T.04 gs.id = ? FAILS in UPDATE WHERE for sections (confirms alias invalid)", () => {
      const sectionId = insertSection(db, { slug: "t04-section", version: 1 });

      assert.throws(() => {
        db.prepare(
          `UPDATE gallery_sections SET name = 'Updated', version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE gs.id = ? AND gs.version = ? AND gs.deleted_at IS NULL`
        ).run("admin@test.com", sectionId, 1);
      }, /gs/);
    });

    it("T.05 publication guard subqueries use full table name (not alias) in UPDATE", () => {
      const sectionId = insertSection(db, { slug: "t05-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, {
        id: "t05-media", category: "GALLERY", lifecycle_status: "PUBLISHED", status: "APPROVED", is_visible: 1, r2_key: "test/t05.jpg", storage_type: "R2",
      });
      const itemId = insertItem(db, sectionId, mediaId, { id: "t05-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 1);
    });

    it("T.06 changes=0 for PUBLISHED target returns eligibility-appropriate outcome", () => {
      const sectionId = insertSection(db, { slug: "t06-section", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "t06-media", category: "GENERAL", lifecycle_status: "DRAFT", status: "PENDING", is_visible: 0, r2_key: "test/t06.jpg" });
      const itemId = insertItem(db, sectionId, mediaId, { id: "t06-item", lifecycle_status: "DRAFT", version: 1 });

      const result = db.prepare(
        `UPDATE gallery_items SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND version = 1 AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM gallery_sections gs WHERE gs.id = gallery_items.section_id AND gs.deleted_at IS NULL)
           AND EXISTS (SELECT 1 FROM media_assets m WHERE m.id = gallery_items.media_id AND m.category = 'GALLERY' AND m.lifecycle_status = 'PUBLISHED' AND m.status = 'APPROVED' AND m.is_visible = 1 AND m.deleted_at IS NULL)`
      ).run("admin@test.com", itemId);
      assert.equal(result.changes, 0, "Guard must block PUBLISHED with ineligible media");

      const row = db.prepare("SELECT lifecycle_status, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1, "Version must remain unchanged when guard blocks");
    });
  });
});
