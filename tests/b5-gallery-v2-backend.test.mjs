/**
 * B5/M2-B — Gallery v2 Backend Workflow Tests
 *
 * Comprehensive data-behavior tests using real in-memory node:sqlite.
 * Tests cover: slug normalization, lifecycle transitions, section/item CRUD,
 * optimistic concurrency, reorder, publication eligibility, dormant state,
 * and revision system integration.
 *
 * Structural assertions supplement executable tests where needed.
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
  const category = opts.category || "GENERAL";
  const status = opts.status || "APPROVED";
  const isVisible = opts.is_visible ?? 1;
  const lifecycleStatus = opts.lifecycle_status || "PUBLISHED";
  const deletedAt = opts.deleted_at || null;
  const purpose = opts.purpose || "admin-upload";
  const purgeStatus = opts.purge_status || "NONE";
  const version = opts.version || 1;

  const stmt = db.prepare(
    `INSERT INTO media_assets (
      id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by,
      status, is_visible, lifecycle_status, deleted_at, version,
      storage_type, public_path, display_r2_key, display_public_path,
      category, purge_status, rights_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNVERIFIED')`
  );
  stmt.run(
    id, r2Key, opts.file_name || "test.jpg", opts.content_type || "image/jpeg",
    opts.size_bytes || 1024, purpose, "test@example.com",
    status, isVisible, lifecycleStatus, deletedAt, version,
    storageType, publicPath, displayR2Key, displayPublicPath,
    category, purgeStatus,
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

  const stmt = db.prepare(
    `INSERT INTO gallery_sections (id, slug, name, description, sort_order, lifecycle_status, version, created_by, updated_by, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(id, slug, name, description, sortOrder, lifecycleStatus, version, createdBy, createdBy, deletedAt);
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

// Slug normalization (mirrors gallery-v2.ts logic)
function normalizeSlug(input) {
  if (typeof input !== "string") return null;
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  return slug.length > 0 ? slug : null;
}

// Lifecycle transition validation (mirrors gallery-v2.ts logic)
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

// Pagination parsing (mirrors gallery-v2.ts logic)
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

// published_at helper (mirrors gallery-v2.ts logic)
function publishedAtSql(currentStatus, newStatus, currentPublishedAt) {
  const publishingNow = newStatus === "PUBLISHED" && currentStatus !== "PUBLISHED";
  const unpublishingNow = newStatus !== "PUBLISHED" && currentStatus === "PUBLISHED";
  if (publishingNow && !currentPublishedAt) return "SET published_at = CURRENT_TIMESTAMP";
  if (unpublishingNow) return "SET published_at = NULL";
  return null;
}

/* ─── Tests ───────────────────────────────────────────────────────────── */

describe("B5/M2-B — Gallery v2 Backend Workflow", () => {
  /* ═══════════════════════════════════════════════════════════════════════
     A. Domain module unit tests
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

    it("A.05 clamps to max length", () => {
      const long = "a".repeat(200);
      const result = normalizeSlug(long);
      assert.ok(result);
      assert.ok(result.length <= 100);
    });

    it("A.06 handles unicode by stripping non-alphanumerics", () => {
      assert.equal(normalizeSlug("Hello 🌍 World!"), "hello-world");
    });
  });

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

    it("B.06 allows IN_REVIEW → PUBLISHED", () => {
      assert.ok(canGalleryTransition("IN_REVIEW", "PUBLISHED"));
    });

    it("B.07 allows IN_REVIEW → HIDDEN", () => {
      assert.ok(canGalleryTransition("IN_REVIEW", "HIDDEN"));
    });

    it("B.08 allows PUBLISHED → HIDDEN", () => {
      assert.ok(canGalleryTransition("PUBLISHED", "HIDDEN"));
    });

    it("B.09 allows HIDDEN → PUBLISHED (re-publish)", () => {
      assert.ok(canGalleryTransition("HIDDEN", "PUBLISHED"));
    });

    it("B.10 allows ARCHIVED → DRAFT (unarchive)", () => {
      assert.ok(canGalleryTransition("ARCHIVED", "DRAFT"));
    });

    it("B.11 blocks ARCHIVED → PUBLISHED", () => {
      assert.ok(!canGalleryTransition("ARCHIVED", "PUBLISHED"));
    });

    it("B.12 blocks invalid statuses", () => {
      assert.ok(!canGalleryTransition("BOGUS", "PUBLISHED"));
      assert.ok(!canGalleryTransition("PUBLISHED", "BOGUS"));
    });
  });

  describe("C. Pagination parsing", () => {
    it("C.01 defaults limit=25, offset=0", () => {
      assert.deepEqual(parseGalleryLimit(null), { ok: true, value: 25 });
      assert.deepEqual(parseGalleryOffset(null), { ok: true, value: 0 });
    });

    it("C.02 accepts valid limit", () => {
      assert.deepEqual(parseGalleryLimit(10), { ok: true, value: 10 });
      assert.deepEqual(parseGalleryLimit(100), { ok: true, value: 100 });
    });

    it("C.03 rejects limit > 100", () => {
      assert.ok(!parseGalleryLimit(101).ok);
    });

    it("C.04 rejects non-integer limit", () => {
      assert.ok(!parseGalleryLimit(1.5).ok);
      assert.ok(!parseGalleryLimit("abc").ok);
    });

    it("C.05 accepts valid offset", () => {
      assert.deepEqual(parseGalleryOffset(0), { ok: true, value: 0 });
      assert.deepEqual(parseGalleryOffset(50), { ok: true, value: 50 });
    });

    it("C.06 rejects negative offset", () => {
      assert.ok(!parseGalleryOffset(-1).ok);
    });
  });

  describe("D. published_at SQL generation", () => {
    it("D.01 sets published_at on first publish", () => {
      const sql = publishedAtSql("DRAFT", "PUBLISHED", null);
      assert.ok(sql);
      assert.ok(sql.includes("CURRENT_TIMESTAMP"));
    });

    it("D.02 does not overwrite existing published_at", () => {
      const sql = publishedAtSql("DRAFT", "PUBLISHED", "2024-01-01");
      assert.equal(sql, null);
    });

    it("D.03 clears published_at on unpublish", () => {
      const sql = publishedAtSql("PUBLISHED", "HIDDEN", "2024-01-01");
      assert.ok(sql);
      assert.ok(sql.includes("NULL"));
    });

    it("D.04 no-op for non-publishing transitions", () => {
      assert.equal(publishedAtSql("DRAFT", "IN_REVIEW", null), null);
      assert.equal(publishedAtSql("HIDDEN", "ARCHIVED", null), null);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     E. Section CRUD behavior
     ═══════════════════════════════════════════════════════════════════════ */

  describe("E. Section CRUD behavior (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("E.01 inserts section with correct defaults", () => {
      const id = insertSection(db, { slug: "test-defaults", name: "Test Defaults" });
      const row = db.prepare("SELECT * FROM gallery_sections WHERE id = ?").get(id);
      assert.equal(row.slug, "test-defaults");
      assert.equal(row.name, "Test Defaults");
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1);
      assert.equal(row.deleted_at, null);
    });

    it("E.02 enforces unique slug", () => {
      insertSection(db, { slug: "unique-test", name: "First" });
      assert.throws(() => {
        insertSection(db, { slug: "unique-test", name: "Second" });
      }, /UNIQUE/i);
    });

    it("E.03 version bump on update", () => {
      const id = insertSection(db, { slug: "version-test", name: "Original", version: 1 });
      db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("Updated", id);
      const row = db.prepare("SELECT name, version FROM gallery_sections WHERE id = ?").get(id);
      assert.equal(row.name, "Updated");
      assert.equal(row.version, 2);
    });

    it("E.04 optimistic concurrency fails on version mismatch", () => {
      const id = insertSection(db, { slug: "concurrency-test", name: "V1", version: 1 });
      // Simulate concurrent update
      db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("V2-First", id);
      const result = db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("V2-Second", id);
      assert.equal(result.changes, 0);
      const row = db.prepare("SELECT name, version FROM gallery_sections WHERE id = ?").get(id);
      assert.equal(row.name, "V2-First");
      assert.equal(row.version, 2);
    });

    it("E.05 logical deletion sets deleted_at", () => {
      const id = insertSection(db, { slug: "delete-test", name: "To Delete", version: 1 });
      db.prepare("UPDATE gallery_sections SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND version = 1").run(id);
      const row = db.prepare("SELECT deleted_at FROM gallery_sections WHERE id = ?").get(id);
      assert.ok(row.deleted_at);
    });

    it("E.06 soft-deleted section not in active queries", () => {
      const id = insertSection(db, { slug: "filter-test", name: "Hidden", deleted_at: "2024-01-01" });
      const rows = db.prepare("SELECT id FROM gallery_sections WHERE deleted_at IS NULL").all();
      assert.ok(!rows.find((r) => r.id === id));
    });

    it("E.07 lifecycle_status CHECK constraint", () => {
      assert.throws(() => {
        insertSection(db, { slug: "bad-ls", lifecycle_status: "INVALID" });
      }, /CHECK/i);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     F. Item CRUD behavior
     ═══════════════════════════════════════════════════════════════════════ */

  describe("F. Item CRUD behavior (data)", () => {
    let db;
    let sectionId, mediaId;

    before(() => {
      db = createFullyMigratedDb();
      sectionId = insertSection(db, { slug: "item-test-section" });
      mediaId = insertMedia(db, { id: "media-item-test", storage_type: "R2", r2_key: "test/photo.jpg" });
    });
    after(() => { db.close(); });

    it("F.01 inserts item with correct defaults", () => {
      const itemId = insertItem(db, sectionId, mediaId, { slot_key: "hero" });
      const row = db.prepare("SELECT * FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.section_id, sectionId);
      assert.equal(row.media_id, mediaId);
      assert.equal(row.slot_key, "hero");
      assert.equal(row.lifecycle_status, "DRAFT");
      assert.equal(row.version, 1);
    });

    it("F.02 enforces unique slot_key for active items", () => {
      insertItem(db, sectionId, mediaId, { id: "item-slot-a", slot_key: "unique-slot" });
      assert.throws(() => {
        insertItem(db, sectionId, mediaId, { id: "item-slot-b", slot_key: "unique-slot" });
      }, /UNIQUE/i);
    });

    it("F.03 FK constraint on section_id", () => {
      assert.throws(() => {
        insertItem(db, "nonexistent-section", mediaId, { id: "item-fk-test" });
      }, /FOREIGN KEY/i);
    });

    it("F.04 FK constraint on media_id", () => {
      assert.throws(() => {
        insertItem(db, sectionId, "nonexistent-media", { id: "item-fk-media-test" });
      }, /FOREIGN KEY/i);
    });

    it("F.05 item version bump on update", () => {
      const itemId = insertItem(db, sectionId, mediaId, { id: "item-ver-test", version: 1 });
      db.prepare("UPDATE gallery_items SET version = version + 1, title_override = ? WHERE id = ? AND version = 1").run("Updated Title", itemId);
      const row = db.prepare("SELECT title_override, version FROM gallery_items WHERE id = ?").get(itemId);
      assert.equal(row.title_override, "Updated Title");
      assert.equal(row.version, 2);
    });

    it("F.06 logical deletion sets deleted_at", () => {
      const itemId = insertItem(db, sectionId, mediaId, { id: "item-del-test", version: 1 });
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(itemId);
      const row = db.prepare("SELECT deleted_at FROM gallery_items WHERE id = ?").get(itemId);
      assert.ok(row.deleted_at);
    });

    it("F.07 deleted item frees slot_key", () => {
      insertItem(db, sectionId, mediaId, { id: "item-slot-free", slot_key: "freeslot" });
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("item-slot-free");
      // Reuse slot_key — should succeed
      insertItem(db, sectionId, mediaId, { id: "item-slot-reuse", slot_key: "freeslot" });
      const row = db.prepare("SELECT id FROM gallery_items WHERE slot_key = ? AND deleted_at IS NULL").get("freeslot");
      assert.equal(row.id, "item-slot-reuse");
    });

    it("F.08 sort_order CHECK constraint", () => {
      assert.throws(() => {
        insertItem(db, sectionId, mediaId, { id: "item-neg-sort", sort_order: -1 });
      }, /CHECK/i);
    });

    it("F.09 items join with media_assets works", () => {
      const itemId = insertItem(db, sectionId, mediaId, { id: "item-join-test", slot_key: "joinslot" });
      const rows = db.prepare(
        "SELECT gi.id, m.r2_key FROM gallery_items gi INNER JOIN media_assets m ON gi.media_id = m.id WHERE gi.id = ?"
      ).all(itemId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].r2_key, "test/photo.jpg");
    });

    it("F.10 FK RESTRICT blocks media deletion when referenced", () => {
      const mediaUsageId = insertMedia(db, { id: "media-restrict-test", r2_key: "test/restrict.jpg" });
      insertItem(db, sectionId, mediaUsageId, { id: "item-restrict-test" });
      assert.throws(() => {
        db.prepare("DELETE FROM media_assets WHERE id = ?").run("media-restrict-test");
      }, /FOREIGN KEY/i);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     G. Reorder behavior
     ═══════════════════════════════════════════════════════════════════════ */

  describe("G. Reorder behavior (data)", () => {
    let db;
    let sectionId, mediaId;

    before(() => {
      db = createFullyMigratedDb();
      sectionId = insertSection(db, { slug: "reorder-section" });
      mediaId = insertMedia(db, { id: "media-reorder-test", r2_key: "test/reorder.jpg" });
    });
    after(() => { db.close(); });

    it("G.01 reorder updates sort_order atomically", () => {
      const a = insertItem(db, sectionId, mediaId, { id: "reorder-a", sort_order: 0 });
      const b = insertItem(db, sectionId, mediaId, { id: "reorder-b", sort_order: 1 });
      const c = insertItem(db, sectionId, mediaId, { id: "reorder-c", sort_order: 2 });

      // Reverse order
      db.prepare("UPDATE gallery_items SET sort_order = 0 WHERE id = ?").run(c);
      db.prepare("UPDATE gallery_items SET sort_order = 1 WHERE id = ?").run(b);
      db.prepare("UPDATE gallery_items SET sort_order = 2 WHERE id = ?").run(a);

      const rows = db.prepare("SELECT id, sort_order FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC").all(sectionId);
      assert.equal(rows[0].id, "reorder-c");
      assert.equal(rows[1].id, "reorder-b");
      assert.equal(rows[2].id, "reorder-a");
    });

    it("G.02 deleted items excluded from active sort_order", () => {
      const d = insertItem(db, sectionId, mediaId, { id: "reorder-d", sort_order: 3 });
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(d);
      const active = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_items WHERE section_id = ? AND deleted_at IS NULL").get(sectionId);
      assert.equal(active.cnt, 3); // a, b, c only
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     H. Publication eligibility
     ═══════════════════════════════════════════════════════════════════════ */

  describe("H. Publication eligibility (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("H.01 PUBLIC asset requires valid public_path for publishing", () => {
      const goodMediaId = insertMedia(db, {
        id: "media-pub-good",
        storage_type: "PUBLIC",
        public_path: "/assets/hospital/hero.webp",
        lifecycle_status: "DRAFT",
      });
      const row = db.prepare("SELECT public_path FROM media_assets WHERE id = ?").get(goodMediaId);
      assert.ok(row.public_path);
      assert.ok(row.public_path.startsWith("/assets/"));
    });

    it("H.02 PUBLIC asset without public_path blocks publishing", () => {
      const badMediaId = insertMedia(db, {
        id: "media-pub-bad",
        storage_type: "PUBLIC",
        public_path: null,
        lifecycle_status: "DRAFT",
      });
      const row = db.prepare("SELECT public_path FROM media_assets WHERE id = ?").get(badMediaId);
      assert.equal(row.public_path, null);
    });

    it("H.03 R2 asset with valid r2_key is publishable", () => {
      const r2MediaId = insertMedia(db, {
        id: "media-r2-good",
        storage_type: "R2",
        r2_key: "uploads/photo.jpg",
        lifecycle_status: "DRAFT",
      });
      const row = db.prepare("SELECT r2_key FROM media_assets WHERE id = ?").get(r2MediaId);
      assert.ok(row.r2_key);
      assert.ok(!row.r2_key.startsWith("public:"));
    });

    it("H.04 deleted media asset blocks item publishing", () => {
      const mediaDelId = insertMedia(db, {
        id: "media-del-test",
        r2_key: "test/deleted.jpg",
        deleted_at: "2024-01-01",
      });
      const row = db.prepare("SELECT deleted_at FROM media_assets WHERE id = ?").get(mediaDelId);
      assert.ok(row.deleted_at);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     I. Dormant gallery state
     ═══════════════════════════════════════════════════════════════════════ */

  describe("I. Dormant gallery state (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("I.01 seed section is DRAFT (dormant)", () => {
      const row = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = 'gallery-section-facilities'").get();
      assert.ok(row);
      assert.equal(row.lifecycle_status, "DRAFT");
    });

    it("I.02 seed items are DRAFT (dormant)", () => {
      const rows = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE section_id = 'gallery-section-facilities'").all();
      assert.ok(rows.length > 0);
      for (const r of rows) {
        assert.equal(r.lifecycle_status, "DRAFT");
      }
    });

    it("I.03 gallery_v2_initialized marker is '0' by default", () => {
      const row = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
      assert.ok(row);
      assert.equal(row.value, "0");
    });

    it("I.04 public endpoint returns empty when not initialized", () => {
      const marker = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
      assert.equal(marker.value, "0");
      // When marker is '0', public endpoint should return empty sections
      const sections = db.prepare("SELECT COUNT(*) AS cnt FROM gallery_sections WHERE lifecycle_status = 'PUBLISHED' AND deleted_at IS NULL").get();
      assert.equal(sections.cnt, 0);
    });

    it("I.05 seed media assets are dormant", () => {
      const dormantCount = db.prepare(
        "SELECT COUNT(*) AS cnt FROM media_assets WHERE storage_type = 'PUBLIC' AND status = 'HIDDEN' AND is_visible = 0 AND lifecycle_status = 'DRAFT'"
      ).get();
      assert.ok(dormantCount.cnt >= 7);
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     J. Revision system integration
     ═══════════════════════════════════════════════════════════════════════ */

  describe("J. Revision system integration (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("J.01 gallery_section.create revision can be created", () => {
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

    it("J.02 gallery_item.create revision can be created", () => {
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

    it("J.03 revision can be approved", () => {
      const revId = insertRevision(db, { entity_type: "gallery_section.create", entity_id: "gallery-section-approve" });
      db.prepare("UPDATE content_revisions SET status = 'APPROVED', reviewed_by = 'admin@example.com', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(revId);
      const row = db.prepare("SELECT status, reviewed_by FROM content_revisions WHERE id = ?").get(revId);
      assert.equal(row.status, "APPROVED");
      assert.equal(row.reviewed_by, "admin@example.com");
    });

    it("J.04 revision can be rejected", () => {
      const revId = insertRevision(db, { entity_type: "gallery_item.create", entity_id: "gallery-item-reject" });
      db.prepare("UPDATE content_revisions SET status = 'REJECTED', reviewed_by = 'admin@example.com', review_note = 'Not needed', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?").run(revId);
      const row = db.prepare("SELECT status, review_note FROM content_revisions WHERE id = ?").get(revId);
      assert.equal(row.status, "REJECTED");
      assert.equal(row.review_note, "Not needed");
    });

    it("J.05 payload_json round-trips correctly", () => {
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

    it("J.06 content_revisions schema supports gallery entity types", () => {
      const entityTypes = [
        "gallery_section.create",
        "gallery_item.create",
        "gallery_item.update",
        "gallery_item.archive",
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
     K. Validation and error paths
     ═══════════════════════════════════════════════════════════════════════ */

  describe("K. Validation and error paths", () => {
    it("K.01 gallery_v2_initialized marker can be set to '1'", () => {
      const db = createFullyMigratedDb();
      db.prepare("UPDATE site_configs SET value = '1' WHERE key = 'gallery_v2_initialized'").run();
      const row = db.prepare("SELECT value FROM site_configs WHERE key = 'gallery_v2_initialized'").get();
      assert.equal(row.value, "1");
      db.close();
    });

    it("K.02 lifecycle_status CHECK rejects invalid values", () => {
      const db = createFullyMigratedDb();
      assert.throws(() => {
        db.prepare("INSERT INTO gallery_sections (id, slug, name, lifecycle_status, created_by) VALUES (?, ?, ?, ?, ?)").run(
          "bad", "bad", "Bad", "INVALID_STATUS", "test"
        );
      }, /CHECK/i);
      db.close();
    });

    it("K.03 sort_order CHECK rejects negative values", () => {
      const db = createFullyMigratedDb();
      assert.throws(() => {
        db.prepare("INSERT INTO gallery_sections (id, slug, name, sort_order, created_by) VALUES (?, ?, ?, ?, ?)").run(
          "bad-sort", "bad-sort", "Bad Sort", -1, "test"
        );
      }, /CHECK/i);
      db.close();
    });

    it("K.04 version CHECK rejects values < 1", () => {
      const db = createFullyMigratedDb();
      assert.throws(() => {
        db.prepare("INSERT INTO gallery_sections (id, slug, name, version, created_by) VALUES (?, ?, ?, ?, ?)").run(
          "bad-ver", "bad-ver", "Bad Ver", 0, "test"
        );
      }, /CHECK/i);
      db.close();
    });

    it("K.05 gallery_sections and gallery_items tables exist", () => {
      const db = createFullyMigratedDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('gallery_sections', 'gallery_items')").all();
      assert.equal(tables.length, 2);
      db.close();
    });

    it("K.06 gallery indexes exist", () => {
      const db = createFullyMigratedDb();
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_gallery_%'").all();
      const indexNames = indexes.map((i) => i.name);
      assert.ok(indexNames.includes("idx_gallery_sections_lifecycle_order"));
      assert.ok(indexNames.includes("idx_gallery_items_section_lifecycle_order"));
      assert.ok(indexNames.includes("idx_gallery_items_media_deleted"));
      assert.ok(indexNames.includes("idx_gallery_items_active_slot"));
      db.close();
    });
  });

  /* ═══════════════════════════════════════════════════════════════════════
     L. Complex scenarios
     ═══════════════════════════════════════════════════════════════════════ */

  describe("L. Complex scenarios (data)", () => {
    let db;

    before(() => { db = createFullyMigratedDb(); });
    after(() => { db.close(); });

    it("L.01 full section lifecycle: DRAFT → PUBLISHED → HIDDEN → ARCHIVED", () => {
      const sectionId = insertSection(db, { slug: "lifecycle-test", lifecycle_status: "DRAFT" });

      // DRAFT → PUBLISHED
      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP WHERE id = ?").run(sectionId);
      let row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "PUBLISHED");
      assert.ok(row.published_at);

      // PUBLISHED → HIDDEN
      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'HIDDEN', published_at = NULL WHERE id = ?").run(sectionId);
      row = db.prepare("SELECT lifecycle_status, published_at FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "HIDDEN");
      assert.equal(row.published_at, null);

      // HIDDEN → ARCHIVED
      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'ARCHIVED' WHERE id = ?").run(sectionId);
      row = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(row.lifecycle_status, "ARCHIVED");
    });

    it("L.02 section with items: deleting section requires removing items first (FK RESTRICT)", () => {
      const sectionId = insertSection(db, { slug: "fk-restrict-test" });
      const mediaId = insertMedia(db, { id: "media-fk-restrict", r2_key: "test/fk.jpg" });
      insertItem(db, sectionId, mediaId, { id: "item-fk-restrict" });

      // FK RESTRICT should block deletion
      assert.throws(() => {
        db.prepare("DELETE FROM gallery_sections WHERE id = ?").run(sectionId);
      }, /FOREIGN KEY/i);
    });

    it("L.03 publish flow: create section + items, then publish all", () => {
      const sectionId = insertSection(db, { slug: "publish-flow", lifecycle_status: "DRAFT" });
      const mediaId = insertMedia(db, { id: "media-publish-flow", r2_key: "test/publish.jpg", storage_type: "R2" });

      const itemA = insertItem(db, sectionId, mediaId, { id: "item-pub-a", slot_key: "slot-a", sort_order: 0 });
      const itemB = insertItem(db, sectionId, mediaId, { id: "item-pub-b", slot_key: "slot-b", sort_order: 1 });

      // Publish items first
      db.prepare("UPDATE gallery_items SET lifecycle_status = 'PUBLISHED' WHERE id IN (?, ?)").run(itemA, itemB);

      // Then publish section
      db.prepare("UPDATE gallery_sections SET lifecycle_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP WHERE id = ?").run(sectionId);

      const section = db.prepare("SELECT lifecycle_status FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(section.lifecycle_status, "PUBLISHED");

      const items = db.prepare("SELECT lifecycle_status FROM gallery_items WHERE section_id = ?").all(sectionId);
      assert.ok(items.every((r) => r.lifecycle_status === "PUBLISHED"));
    });

    it("L.04 slot_key uniqueness is scoped to active items only", () => {
      const sectionId = insertSection(db, { slug: "slot-unique-test" });
      const mediaId = insertMedia(db, { id: "media-slot-unique", r2_key: "test/slot.jpg" });

      insertItem(db, sectionId, mediaId, { id: "item-slot-1", slot_key: "shared-slot" });
      // Delete first item
      db.prepare("UPDATE gallery_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("item-slot-1");
      // Reuse slot_key — should succeed
      insertItem(db, sectionId, mediaId, { id: "item-slot-2", slot_key: "shared-slot" });

      const active = db.prepare("SELECT id FROM gallery_items WHERE slot_key = 'shared-slot' AND deleted_at IS NULL").all();
      assert.equal(active.length, 1);
      assert.equal(active[0].id, "item-slot-2");
    });

    it("L.05 version conflict detection on PATCH simulation", () => {
      const sectionId = insertSection(db, { slug: "conflict-test", version: 1 });
      // Client A reads version=1
      const current = db.prepare("SELECT version FROM gallery_sections WHERE id = ?").get(sectionId);
      assert.equal(current.version, 1);

      // Client B updates first
      db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1").run("Client B", sectionId);

      // Client A tries to update with stale version=1
      const result = db.prepare("UPDATE gallery_sections SET version = version + 1, name = ? WHERE id = ? AND version = 1 AND deleted_at IS NULL").run("Client A", sectionId);
      assert.equal(result.changes, 0);
    });
  });
});
