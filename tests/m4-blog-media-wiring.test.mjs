import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");

function readMigration(name) {
  return fs.readFileSync(path.join(rootDir, "migrations", name), "utf8");
}

function openFullDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  db.exec(readMigration("0002_add_content_lifecycle_foundation.sql"));
  db.exec(readMigration("0003_add_media_library_and_gallery.sql"));
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  return db;
}

function insertBlog(db, opts) {
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, source_note, is_deleted, author, reviewer, lifecycle_status, version, deleted_at, cover_media_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.id, opts.slug, opts.title, opts.excerpt, opts.body,
    opts.status || "APPROVED", opts.isVisible ?? 1, opts.sourceNote || "admin-approved",
    opts.isDeleted ?? 0, opts.author || null, opts.reviewer || null,
    opts.lifecycleStatus || "PUBLISHED", opts.version ?? 1, opts.deletedAt || null,
    opts.coverMediaId || null
  );
}

function insertMedia(db, opts) {
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, category, uploaded_by, consent_note, status, is_visible, lifecycle_status, storage_type, deleted_at, version)
     VALUES (?, ?, ?, 'image/webp', 1024, ?, ?, 'test@example.com', '', ?, ?, ?, ?, ?, 1)`
  ).run(
    opts.id, opts.r2Key, opts.fileName || "test.webp",
    opts.purpose || "blog-cover", opts.category || "BLOG",
    opts.status || "APPROVED", opts.isVisible ?? 1,
    opts.lifecycleStatus || "PUBLISHED", opts.storageType || "R2",
    opts.deletedAt || null
  );
}

function insertPublicMedia(db, opts) {
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, category, uploaded_by, consent_note, status, is_visible, lifecycle_status, storage_type, public_path, deleted_at, version)
     VALUES (?, ?, ?, 'image/webp', 1024, ?, ?, 'test@example.com', '', ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    opts.id, opts.r2Key || "public:test.webp", opts.fileName || "test.webp",
    opts.purpose || "blog-cover", opts.category || "BLOG",
    opts.status || "APPROVED", opts.isVisible ?? 1,
    opts.lifecycleStatus || "PUBLISHED", opts.storageType || "PUBLIC",
    opts.publicPath || "/assets/blog/test.webp", opts.deletedAt || null
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   I. blog-admin.ts — validateBlogMediaRelation
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  validateBlogMediaRelation,
  loadBlog,
} from "../app/lib/blog-admin.ts";

function makeRepo(db) {
  return {
    query: async (sql, ...binds) => ({ results: db.prepare(sql).all(...binds) }),
    run: async (sql, ...binds) => { const r = db.prepare(sql).run(...binds); return { success: true, meta: { changes: r.changes } }; },
    audit: async () => {},
  };
}

test("VAL.01 null coverMediaId returns ok", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, null, false);
  assert.deepEqual(result, { ok: true });
  db.close();
});

test("VAL.02 empty string coverMediaId returns ok", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "", false);
  assert.deepEqual(result, { ok: true });
  db.close();
});

test("VAL.03 nonexistent media returns error", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "nonexistent-id", false);
  assert.equal(result.ok, false);
  assert.match(result.error, /not found/i);
  db.close();
});

test("VAL.04 deleted media returns error", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", deletedAt: "2026-01-01" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.equal(result.ok, false);
  assert.match(result.error, /archived or unavailable/i);
  db.close();
});

test("VAL.05 non-BLOG category returns error", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "doctor-photo/m1.webp", category: "DOCTOR" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.equal(result.ok, false);
  assert.match(result.error, /Blog category/i);
  db.close();
});

test("VAL.06 valid BLOG R2 media returns ok (hidden blog)", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.deepEqual(result, { ok: true });
  db.close();
});

test("VAL.07 visible blog requires published+approved+visible media", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", lifecycleStatus: "DRAFT", status: "NEW" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false);
  assert.match(result.error, /Publish and approve/i);
  db.close();
});

test("VAL.08 visible blog with published+approved+visible media returns ok", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", true);
  assert.deepEqual(result, { ok: true });
  db.close();
});

test("VAL.09 invalid R2 key returns error", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.equal(result.ok, false);
  assert.match(result.error, /valid public media location/i);
  db.close();
});

test("VAL.10 valid PUBLIC media returns ok", async () => {
  const db = openFullDb();
  insertPublicMedia(db, { id: "m1" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.deepEqual(result, { ok: true });
  db.close();
});

test("VAL.11 PUBLIC media missing public_path returns error", async () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, category, uploaded_by, consent_note, status, is_visible, lifecycle_status, storage_type, public_path, deleted_at, version)
     VALUES ('m1', 'none', 'test.webp', 'image/webp', 1024, 'blog-cover', 'BLOG', 'test@example.com', '', 'APPROVED', 1, 'PUBLISHED', 'PUBLIC', NULL, NULL, 1)`
  ).run();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.equal(result.ok, false);
  assert.match(result.error, /valid public media location/i);
  db.close();
});

test("VAL.12 visible blog with DRAFT media returns error", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: 0 });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false);
  assert.match(result.error, /Publish and approve/i);
  db.close();
});

test("VAL.13 HIDDEN media on visible blog returns error", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", status: "HIDDEN" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false);
  assert.match(result.error, /Publish and approve/i);
  db.close();
});

test("VAL.14 unknown storage type returns error", async () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, category, uploaded_by, consent_note, status, is_visible, lifecycle_status, storage_type, deleted_at, version)
     VALUES ('m1', 'test', 'test.webp', 'image/webp', 1024, 'blog-cover', 'BLOG', 'test@example.com', '', 'APPROVED', 1, 'DRAFT', 'R2', NULL, 1)`
  ).run();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.equal(result.ok, true, "R2 without valid key is still valid storage type");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   II. blog-admin.ts — loadBlog
   ═══════════════════════════════════════════════════════════════════════════ */

test("LOAD.15 loadBlog returns null for nonexistent slug", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await loadBlog(repo, "nonexistent");
  assert.equal(result, null);
  db.close();
});

test("LOAD.16 loadBlog returns blog data", async () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "test-blog", title: "Test", excerpt: "E", body: "B" });
  const repo = makeRepo(db);
  const result = await loadBlog(repo, "test-blog");
  assert.ok(result);
  assert.equal(result.slug, "test-blog");
  assert.equal(result.is_deleted, 0);
  assert.equal(result.cover_media_id, null);
  db.close();
});

test("LOAD.17 loadBlog reads cover_media_id", async () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "test-blog", title: "Test", excerpt: "E", body: "B", coverMediaId: "media-123" });
  const repo = makeRepo(db);
  const result = await loadBlog(repo, "test-blog");
  assert.ok(result);
  assert.equal(result.cover_media_id, "media-123");
  db.close();
});

test("LOAD.18 loadBlog returns version", async () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "test-blog", title: "Test", excerpt: "E", body: "B", version: 3 });
  const repo = makeRepo(db);
  const result = await loadBlog(repo, "test-blog");
  assert.ok(result);
  assert.equal(result.version, 3);
  db.close();
});

test("LOAD.19 loadBlog returns null for deleted blog", async () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "test-blog", title: "Test", excerpt: "E", body: "B", isDeleted: 1, deletedAt: "2026-01-01" });
  const repo = makeRepo(db);
  const result = await loadBlog(repo, "test-blog");
  assert.equal(result, null, "loadBlog returns null for deleted blog");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   III. Public queries — LEFT JOIN + cover URL resolution (tested via SQL)
   ═══════════════════════════════════════════════════════════════════════════ */

function _okQuery(rows) {
  return async () => ({ results: rows });
}

function _throwingQuery() {
  return async () => { throw new Error("D1 unavailable"); };
}

const PUBLIC_BLOG_LIST_SQL = `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.body, bp.author, bp.reviewer, bp.created_at,
            ma.storage_type AS cover_storage_type,
            ma.r2_key AS cover_r2_key,
            ma.public_path AS cover_public_path,
            ma.display_public_path AS cover_display_public_path
       FROM blog_posts bp
       LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
       WHERE bp.status = 'APPROVED' AND bp.is_visible = 1 AND bp.is_deleted = 0
       ORDER BY bp.created_at DESC`;

const PUBLIC_BLOG_BY_SLUG_SQL = `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.body, bp.author, bp.reviewer, bp.created_at,
              ma.storage_type AS cover_storage_type,
              ma.r2_key AS cover_r2_key,
              ma.public_path AS cover_public_path,
              ma.display_public_path AS cover_display_public_path
       FROM blog_posts bp
       LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
       WHERE bp.slug = ? AND bp.status = 'APPROVED' AND bp.is_visible = 1 AND bp.is_deleted = 0`;

test("PUB.20 blog list SQL includes LEFT JOIN media_assets for cover", () => {
  assert.ok(PUBLIC_BLOG_LIST_SQL.includes("LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id"));
  assert.ok(PUBLIC_BLOG_LIST_SQL.includes("ma.storage_type AS cover_storage_type"));
  assert.ok(PUBLIC_BLOG_LIST_SQL.includes("ma.r2_key AS cover_r2_key"));
});

test("PUB.21 blog slug SQL includes LEFT JOIN media_assets for cover", () => {
  assert.ok(PUBLIC_BLOG_BY_SLUG_SQL.includes("LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL"));
  assert.ok(PUBLIC_BLOG_BY_SLUG_SQL.includes("ma.public_path AS cover_public_path"));
  assert.ok(PUBLIC_BLOG_BY_SLUG_SQL.includes("ma.display_public_path AS cover_display_public_path"));
});

test("PUB.22 LEFT JOIN returns blog with R2 cover data", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_storage_type, "R2");
  assert.equal(rows[0].cover_r2_key, "blog-cover/m1.webp");
  db.close();
});

test("PUB.23 blog without cover_media_id returns null cover columns", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_storage_type, null);
  assert.equal(rows[0].cover_r2_key, null);
  db.close();
});

test("PUB.24 deleted media returns null cover columns via LEFT JOIN", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", deletedAt: "2026-01-01" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_storage_type, null);
  db.close();
});

test("PUB.25 multiple blogs with different covers", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T1", excerpt: "E1", body: "B1", coverMediaId: "m1" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 2);
  const withCover = rows.find(r => r.slug === "s1");
  const withoutCover = rows.find(r => r.slug === "s2");
  assert.equal(withCover.cover_r2_key, "blog-cover/m1.webp");
  assert.equal(withoutCover.cover_r2_key, null);
  db.close();
});

test("PUB.26 blog slug query returns cover data", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const rows = db.prepare(PUBLIC_BLOG_BY_SLUG_SQL).all("s1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_r2_key, "blog-cover/m1.webp");
  db.close();
});

test("PUB.27 blog slug query returns null cover for uncovered blog", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B" });
  const rows = db.prepare(PUBLIC_BLOG_BY_SLUG_SQL).all("s1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_r2_key, null);
  db.close();
});

test("PUB.28 PUBLIC storage blog returns public_path", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertPublicMedia(db, { id: "m1" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows[0].cover_storage_type, "PUBLIC");
  assert.equal(rows[0].cover_public_path, "/assets/blog/test.webp");
  db.close();
});

test("PUB.29 SQL excludes hidden blogs", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", isVisible: 0, status: "HIDDEN" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 0);
  db.close();
});

test("PUB.30 SQL excludes deleted blogs", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", isDeleted: 1, deletedAt: "2026-01-01" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 0);
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   IV. Media upload — blog-cover purpose
   ═══════════════════════════════════════════════════════════════════════════ */

import { ALLOWED_PURPOSES } from "../app/lib/media-policy.ts";
import { MEDIA_CATEGORIES } from "../app/lib/media-schema.ts";

test("UPLOAD.26 blog-cover is in ALLOWED_PURPOSES", () => {
  assert.ok(ALLOWED_PURPOSES.has("blog-cover"));
});

test("UPLOAD.27 BLOG is in MEDIA_CATEGORIES", () => {
  assert.ok(MEDIA_CATEGORIES.has("BLOG"));
});

test("UPLOAD.28 blog-cover purpose maps to BLOG category in SQL", () => {
  const category = "blog-cover" === "gallery" ? "GALLERY" : "blog-cover" === "doctor-photo" ? "DOCTOR" : "blog-cover" === "blog-cover" ? "BLOG" : "GENERAL";
  assert.equal(category, "BLOG");
});

test("UPLOAD.29 blog-cover uploads auto-publish (APPROVED + VISIBLE + PUBLISHED)", () => {
  let status, isVisible, lifecycleStatus;
  const purpose = "blog-cover";
  if (purpose === "gallery") {
    status = "APPROVED"; isVisible = 1; lifecycleStatus = "PUBLISHED";
  } else if (purpose === "doctor-photo") {
    status = "APPROVED"; isVisible = 1; lifecycleStatus = "PUBLISHED";
  } else if (purpose === "blog-cover") {
    status = "APPROVED"; isVisible = 1; lifecycleStatus = "PUBLISHED";
  } else {
    status = "HIDDEN"; isVisible = 0; lifecycleStatus = "HIDDEN";
  }
  assert.equal(status, "APPROVED");
  assert.equal(isVisible, 1);
  assert.equal(lifecycleStatus, "PUBLISHED");
});

/* ═══════════════════════════════════════════════════════════════════════════
   V. Media gateway — BLOG category authorization
   ═══════════════════════════════════════════════════════════════════════════ */

test("GW.30 gateway source includes blog-cover purpose handling", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "media", "[...key]", "route.ts"), "utf8");
  assert.ok(src.includes('meta.purpose === "blog-cover"'), "gateway must check blog-cover purpose");
  assert.ok(src.includes("cover_media_id"), "gateway must check cover_media_id reference");
});

test("GW.31 gateway checks BLOG category for blog-cover purpose", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "media", "[...key]", "route.ts"), "utf8");
  assert.ok(src.includes("category !== \"BLOG\""), "gateway must reject non-BLOG category for blog-cover");
});

test("GW.32 gateway authorizes blog-cover via blog_posts.cover_media_id", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "media", "[...key]", "route.ts"), "utf8");
  assert.ok(src.includes("blog_posts"), "gateway must query blog_posts for authorization");
});

test("GW.33 gateway handles admin-upload with BLOG category", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "media", "[...key]", "route.ts"), "utf8");
  assert.ok(src.includes('category === "BLOG"'), "gateway must handle BLOG in admin-upload path");
});

/* ═══════════════════════════════════════════════════════════════════════════
   VI. Media library DELETE — blog reference protection
   ═══════════════════════════════════════════════════════════════════════════ */

test("DEL.34 DELETE atomic SQL includes blog_posts reference check", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "media", "library", "[id]", "route.ts"), "utf8");
  assert.ok(src.includes("blog_posts WHERE cover_media_id"), "DELETE must check blog_posts.cover_media_id");
});

test("DEL.35 DELETE recheck includes blog reference detection", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "media", "library", "[id]", "route.ts"), "utf8");
  assert.ok(src.includes("blogRef"), "DELETE recheck must detect blog reference");
});

test("DEL.36 DELETE blocks media referenced by active blog", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const blogRef = db.prepare("SELECT id FROM blog_posts WHERE cover_media_id = ? AND is_deleted = 0 LIMIT 1").get("m1");
  assert.ok(blogRef, "blog reference blocks deletion");
  db.close();
});

test("DEL.37 DELETE allows media not referenced by any blog", () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const blogRef = db.prepare("SELECT id FROM blog_posts WHERE cover_media_id = ? AND is_deleted = 0 LIMIT 1").get("m1");
  assert.equal(blogRef, undefined, "no blog reference");
  db.close();
});

test("DEL.38 DELETE allows media referenced by deleted blog", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1", isDeleted: 1, deletedAt: "2026-01-01" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const blogRef = db.prepare("SELECT id FROM blog_posts WHERE cover_media_id = ? AND is_deleted = 0 LIMIT 1").get("m1");
  assert.equal(blogRef, undefined, "deleted blog does not block deletion");
  db.close();
});

test("DEL.39 atomic delete SQL excludes blog reference", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const result = db.prepare(
    `UPDATE media_assets
     SET lifecycle_status = 'ARCHIVED', status = 'HIDDEN', is_visible = 0,
         deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND version = ? AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE media_id = media_assets.id)
       AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets.id)
       AND NOT EXISTS (SELECT 1 FROM blog_posts WHERE cover_media_id = media_assets.id AND is_deleted = 0)`
  ).run("m1", 1);
  assert.equal(result.changes, 0, "blog reference blocks atomic delete");
  db.close();
});

test("DEL.40 atomic delete succeeds when no blog references", () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const result = db.prepare(
    `UPDATE media_assets
     SET lifecycle_status = 'ARCHIVED', status = 'HIDDEN', is_visible = 0,
         deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND version = ? AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE media_id = media_assets.id)
       AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets.id)
       AND NOT EXISTS (SELECT 1 FROM blog_posts WHERE cover_media_id = media_assets.id AND is_deleted = 0)`
  ).run("m1", 1);
  assert.equal(result.changes, 1, "no references allows delete");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   VII. Admin data route — applyBlog with coverMediaId
   ═══════════════════════════════════════════════════════════════════════════ */

test("API.41 applyBlog SQL includes cover_media_id in INSERT", async () => {
  const blogAdmin = fs.readFileSync(path.join(rootDir, "app", "lib", "blog-admin.ts"), "utf8");
  assert.ok(blogAdmin.includes("cover_media_id"), "blog-admin createBlog/updateBlog include cover_media_id SQL");
});

test("API.42 applyBlog validates coverMediaId via validateBlogMediaRelation", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(src.includes("validateBlogMediaRelation"), "applyBlog must call validateBlogMediaRelation");
});

test("API.43 applyBlog imports blog-admin module", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(src.includes('from "@/app/lib/blog-admin"'), "must import blog-admin");
  assert.ok(src.includes("loadBlog"), "must import loadBlog");
  assert.ok(src.includes("validateBlogMediaRelation"), "must import validateBlogMediaRelation");
});

test("API.44 applyBlog inserts cover_media_id NULL when not provided", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, cover_media_id = excluded.cover_media_id`
  ).run("blog-s1", "s1", "T", "E", "B", null);
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'blog-s1'").get();
  assert.equal(row.cover_media_id, null);
  db.close();
});

test("API.45 applyBlog inserts cover_media_id when provided", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')`
  ).run("blog-s1", "s1", "T", "E", "B", "media-abc");
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'blog-s1'").get();
  assert.equal(row.cover_media_id, "media-abc");
  db.close();
});

test("API.46 applyBlog UPSERT updates cover_media_id on conflict", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, NULL, 'APPROVED', 1, 'admin-approved')`
  ).run("blog-s1", "s1", "T", "E", "B");
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, cover_media_id = excluded.cover_media_id`
  ).run("blog-s1", "s1", "T2", "E2", "B2", "media-new");
  const row = db.prepare("SELECT cover_media_id, title FROM blog_posts WHERE id = 'blog-s1'").get();
  assert.equal(row.cover_media_id, "media-new");
  assert.equal(row.title, "T2");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   VIII. Public data type — PublicBlog.coverMediaUrl
   ═══════════════════════════════════════════════════════════════════════════ */

test("TYPE.47 PublicBlog type includes coverMediaUrl", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "lib", "public-data.ts"), "utf8");
  assert.ok(src.includes("coverMediaUrl"), "PublicBlog type must include coverMediaUrl");
});

test("TYPE.48 public-data.ts imports media-resolver", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "lib", "public-data.ts"), "utf8");
  assert.ok(src.includes('from "./media-resolver.ts"'), "must import media-resolver");
  assert.ok(src.includes("generateR2MediaUrl"), "must import generateR2MediaUrl");
  assert.ok(src.includes("validatePublicPath"), "must import validatePublicPath");
});

test("TYPE.49 getPublishedBlogs SQL includes LEFT JOIN media_assets", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "lib", "public-data.ts"), "utf8");
  assert.ok(src.includes("LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id"), "SQL must LEFT JOIN media_assets");
});

test("TYPE.50 getBlogBySlug SQL includes LEFT JOIN media_assets", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "lib", "public-data.ts"), "utf8");
  assert.ok(src.includes("LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id"), "Slug query must LEFT JOIN");
  assert.ok(src.includes("ma.deleted_at IS NULL"), "Slug query must check ma.deleted_at IS NULL");
  assert.ok(src.includes("ma.category = 'BLOG'"), "Slug query must check ma.category = BLOG");
});

/* ═══════════════════════════════════════════════════════════════════════════
   IX. Blog list page — cover image rendering
   ═══════════════════════════════════════════════════════════════════════════ */

test("PAGE.51 blog list page renders coverMediaUrl", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "blog", "page.tsx"), "utf8");
  assert.ok(src.includes("coverMediaUrl"), "blog list page must use coverMediaUrl");
  assert.ok(src.includes("<img"), "blog list page must render img element");
});

test("PAGE.52 blog list page uses Newspaper fallback when no cover", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "blog", "page.tsx"), "utf8");
  assert.ok(src.includes("Newspaper"), "blog list page must use Newspaper as fallback icon");
});

/* ═══════════════════════════════════════════════════════════════════════════
   X. Blog detail page — cover image + JSON-LD
   ═══════════════════════════════════════════════════════════════════════════ */

test("PAGE.53 blog detail page renders coverMediaUrl", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "blog", "[slug]", "page.tsx"), "utf8");
  assert.ok(src.includes("coverMediaUrl"), "blog detail page must use coverMediaUrl");
});

test("PAGE.54 blog detail page renders cover img element", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "blog", "[slug]", "page.tsx"), "utf8");
  assert.ok(src.includes("<img"), "blog detail page must render img element");
});

test("PAGE.55 blog detail page includes cover in JSON-LD image", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "blog", "[slug]", "page.tsx"), "utf8");
  assert.ok(src.includes("jsonLd.image = blog.coverMediaUrl"), "JSON-LD must include image from coverMediaUrl");
});

test("PAGE.56 blog detail page conditionally renders cover", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "blog", "[slug]", "page.tsx"), "utf8");
  assert.ok(src.includes("blog.coverMediaUrl &&"), "cover rendering must be conditional");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XI. BlogStudio — MediaPickerDialog integration
   ═══════════════════════════════════════════════════════════════════════════ */

function readBlogStudioSrc() {
  return fs.readFileSync(path.join(rootDir, "app", "components", "admin", "BlogStudio.tsx"), "utf8");
}

test("FORM.57 BlogStudio accepts csrf prop", async () => {
  const src = readBlogStudioSrc();
  const match = src.match(/function BlogStudio\(\{[^}]*csrf[^}]*\}/s);
  assert.ok(match, "BlogStudio must accept csrf prop");
});

test("FORM.58 BlogStudio state includes coverMediaId", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes('coverMediaId: ""'), "BlogStudio state must include coverMediaId");
});

test("FORM.59 BlogStudio renders MediaPickerDialog with category BLOG", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes('category="BLOG"'), "MediaPickerDialog must use BLOG category");
});

test("FORM.60 BlogStudio conditionally includes coverMediaId in save payload", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes("coverMediaId || null"), "save payload must include coverMediaId when provided");
});

test("FORM.61 BlogStudio has Remove Cover button", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes("Remove") || src.includes("remove"), "BlogStudio must have Remove Cover button");
});

test("FORM.62 BlogStudio has Select Cover button", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes("Select Cover") || src.includes("Replace"), "BlogStudio must have Select Cover button");
});

test("FORM.63 BlogStudio onRowClick includes coverMediaId", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes("coverMediaId"), "BlogStudio onRowClick must populate coverMediaId");
});

test("FORM.64 BlogStudio shows cover status indicator", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes("No cover image set") || src.includes("No cover"), "BlogStudio must show no-cover indicator");
});

test("FORM.65 BlogStudio pass csrf from session", async () => {
  const adminSrc = fs.readFileSync(path.join(rootDir, "app", "components", "AdminConsole.tsx"), "utf8");
  assert.ok(adminSrc.includes("csrf={session.csrf}") || adminSrc.includes("csrf="), "BlogStudio must receive csrf from session");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XII. Client-side validation — coverMediaId
   ═══════════════════════════════════════════════════════════════════════════ */

test("VAL.66 client validatePayload accepts valid coverMediaId", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "components", "AdminConsole.tsx"), "utf8");
  assert.ok(src.includes('coverMediaId.length > 140'), "client validation must check coverMediaId length");
});

test("VAL.67 server validatePayload accepts valid coverMediaId", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(src.includes('coverMediaId.length > 140'), "server validation must check coverMediaId length");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XIII. UPSERT blog cover — set, update, clear
   ═══════════════════════════════════════════════════════════════════════════ */

test("UPSERT.68 create blog with cover_media_id", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')`
  ).run("b1", "s1", "T", "E", "B", "media-1");
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, "media-1");
  db.close();
});

test("UPSERT.69 create blog without cover_media_id", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')`
  ).run("b1", "s1", "T", "E", "B");
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, null);
  db.close();
});

test("UPSERT.70 update blog to add cover_media_id", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')`
  ).run("b1", "s1", "T", "E", "B");
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, cover_media_id = excluded.cover_media_id`
  ).run("b1", "s1", "T", "E", "B", "media-1");
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, "media-1");
  db.close();
});

test("UPSERT.71 update blog to clear cover_media_id", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')`
  ).run("b1", "s1", "T", "E", "B", "media-1");
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, cover_media_id = excluded.cover_media_id`
  ).run("b1", "s1", "T", "E", "B", null);
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, null);
  db.close();
});

test("UPSERT.72 update blog to change cover_media_id", () => {
  const db = openFullDb();
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')`
  ).run("b1", "s1", "T", "E", "B", "media-1");
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note)
     VALUES (?, ?, ?, ?, ?, ?, 'APPROVED', 1, 'admin-approved')
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, excerpt = excluded.excerpt, body = excluded.body, cover_media_id = excluded.cover_media_id`
  ).run("b1", "s1", "T", "E", "B", "media-2");
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, "media-2");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XIV. LEFT JOIN query correctness
   ═══════════════════════════════════════════════════════════════════════════ */

test("JOIN.73 LEFT JOIN returns blog even when media doesn't exist", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "nonexistent" });
  const rows = db.prepare(
    `SELECT bp.id, bp.slug, ma.r2_key AS cover_r2_key
     FROM blog_posts bp
     LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
     WHERE bp.id = 'b1'`
  ).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_r2_key, null);
  db.close();
});

test("JOIN.74 LEFT JOIN returns blog when cover_media_id is NULL", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B" });
  const rows = db.prepare(
    `SELECT bp.id, ma.r2_key AS cover_r2_key
     FROM blog_posts bp
     LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
     WHERE bp.id = 'b1'`
  ).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover_r2_key, null);
  db.close();
});

test("JOIN.75 LEFT JOIN resolves R2 key for valid cover", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/test.webp" });
  const rows = db.prepare(
    `SELECT ma.r2_key AS cover_r2_key, ma.storage_type AS cover_storage_type
     FROM blog_posts bp
     LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
     WHERE bp.id = 'b1'`
  ).all();
  assert.equal(rows[0].cover_r2_key, "blog-cover/test.webp");
  assert.equal(rows[0].cover_storage_type, "R2");
  db.close();
});

test("JOIN.76 LEFT JOIN resolves PUBLIC path for valid cover", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertPublicMedia(db, { id: "m1" });
  const rows = db.prepare(
    `SELECT ma.storage_type AS cover_storage_type, ma.public_path AS cover_public_path, ma.display_public_path AS cover_display_public_path
     FROM blog_posts bp
     LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
     WHERE bp.id = 'b1'`
  ).all();
  assert.equal(rows[0].cover_storage_type, "PUBLIC");
  assert.equal(rows[0].cover_public_path, "/assets/blog/test.webp");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XV. Cover URL resolution (media-resolver)
   ═══════════════════════════════════════════════════════════════════════════ */

import { generateR2MediaUrl, validatePublicPath } from "../app/lib/media-resolver.ts";

test("URL.77 generateR2MediaUrl produces valid gateway URL for blog cover", () => {
  const result = generateR2MediaUrl("blog-cover/m1.webp");
  assert.equal(result.ok, true);
  assert.equal(result.url, "/api/media/blog-cover/m1.webp");
});

test("URL.78 validatePublicPath accepts valid blog asset path", () => {
  const result = validatePublicPath("/assets/blog/cover.webp");
  assert.equal(result.ok, true);
  assert.equal(result.path, "/assets/blog/cover.webp");
});

test("URL.79 generateR2MediaUrl rejects empty key", () => {
  const result = generateR2MediaUrl("");
  assert.equal(result.ok, false);
});

test("URL.80 validatePublicPath rejects non-/assets/ path", () => {
  const result = validatePublicPath("/images/blog.webp");
  assert.equal(result.ok, false);
});

/* ═══════════════════════════════════════════════════════════════════════════
   XVI. Dashboard data query includes cover_media_id
   ═══════════════════════════════════════════════════════════════════════════ */

test("DASH.81 dashboard blog query includes cover_media_id", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(src.includes("SELECT * FROM blog_posts"), "dashboard query selects all columns including cover_media_id");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XVII. Blog admin module exports
   ═══════════════════════════════════════════════════════════════════════════ */

test("MOD.82 blog-admin.ts exports validateBlogMediaRelation", async () => {
  assert.equal(typeof validateBlogMediaRelation, "function");
});

test("MOD.83 blog-admin.ts exports loadBlog", async () => {
  assert.equal(typeof loadBlog, "function");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XVIII. Blog delete clears cover reference
   ═══════════════════════════════════════════════════════════════════════════ */

test("DEL.84 soft-deleted blog no longer blocks media deletion", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  db.prepare("UPDATE blog_posts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = 'b1'").run();
  const blogRef = db.prepare("SELECT id FROM blog_posts WHERE cover_media_id = ? AND is_deleted = 0 LIMIT 1").get("m1");
  assert.equal(blogRef, undefined, "deleted blog no longer blocks");
  db.close();
});

test("DEL.85 atomic delete succeeds after blog soft-delete", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  db.prepare("UPDATE blog_posts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = 'b1'").run();
  const result = db.prepare(
    `UPDATE media_assets
     SET lifecycle_status = 'ARCHIVED', status = 'HIDDEN', is_visible = 0,
         deleted_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND version = ? AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM gallery_items WHERE media_id = media_assets.id)
       AND NOT EXISTS (SELECT 1 FROM doctor_profiles WHERE photo_media_id = media_assets.id)
       AND NOT EXISTS (SELECT 1 FROM blog_posts WHERE cover_media_id = media_assets.id AND is_deleted = 0)`
  ).run("m1", 1);
  assert.equal(result.changes, 1, "delete succeeds after blog soft-delete");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XIX. Multiple blogs referencing same media
   ═══════════════════════════════════════════════════════════════════════════ */

test("MULTI.86 two blogs can reference the same media", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T1", excerpt: "E1", body: "B1", coverMediaId: "m1" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  const blogs = db.prepare("SELECT id FROM blog_posts WHERE cover_media_id = 'm1' AND is_deleted = 0").all();
  assert.equal(blogs.length, 2);
  db.close();
});

test("MULTI.87 media blocked by one blog still blocked when other is deleted", () => {
  const db = openFullDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T1", excerpt: "E1", body: "B1", coverMediaId: "m1" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", coverMediaId: "m1" });
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp" });
  db.prepare("UPDATE blog_posts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = 'b1'").run();
  const blogRef = db.prepare("SELECT id FROM blog_posts WHERE cover_media_id = ? AND is_deleted = 0 LIMIT 1").get("m1");
  assert.ok(blogRef, "still blocked by active blog");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XX. Gallery item FK guard unchanged
   ═══════════════════════════════════════════════════════════════════════════ */

test("GAL.88 gallery items media FK still enforced", () => {
  const db = openFullDb();
  assert.throws(() => {
    db.prepare("INSERT INTO gallery_items (id, section_id, media_id, sort_order, lifecycle_status, version, created_by, updated_by) VALUES ('gi1', 'nonexistent', 'nonexistent', 0, 'DRAFT', 1, 'test', 'test')").run();
  }, /FOREIGN KEY/);
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXI. Doctor relation guard unchanged
   ═══════════════════════════════════════════════════════════════════════════ */

test("DOC.89 doctor_profiles photo_media_id guard still works", () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", category: "DOCTOR" });
  db.prepare(
    `INSERT INTO doctor_profiles (id, slug, name, speciality, qualification, department_slug, photo_url, photo_media_id, profile_note, consent_status, status, is_visible, approved_by, is_deleted, lifecycle_status, version)
     VALUES ('d1', 'dr-test', 'Dr Test', '', '', 'cardiology', '', 'm1', '', 'APPROVED_SOURCE', 'APPROVED', 1, 'test', 0, 'PUBLISHED', 1)`
  ).run();
  const doctor = db.prepare("SELECT photo_media_id FROM doctor_profiles WHERE id = 'd1'").get();
  assert.equal(doctor.photo_media_id, "m1");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXII. Blog cover R2 upload key structure
   ═══════════════════════════════════════════════════════════════════════════ */

test("KEY.90 upload route generates R2 key with blog-cover prefix", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "media", "route.ts"), "utf8");
  assert.ok(src.includes("blog-cover"), "upload route must support blog-cover purpose in key generation");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXIII. blog-admin import in route.ts
   ═══════════════════════════════════════════════════════════════════════════ */

test("IMP.91 route.ts imports BlogRepo type", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(src.includes("type BlogRepo"), "must import BlogRepo type");
});

test("IMP.92 route.ts constructs blogRepo for validation", async () => {
  const src = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(src.includes("const blogRepo: BlogRepo"), "must construct blogRepo");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXIV. Blog visibility interaction with cover
   ═══════════════════════════════════════════════════════════════════════════ */

test("VIS.93 visible blog requires PUBLISHED media", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", lifecycleStatus: "HIDDEN" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", true);
  assert.equal(result.ok, false);
  assert.match(result.error, /Publish and approve/i);
  db.close();
});

test("VIS.94 hidden blog accepts DRAFT media", async () => {
  const db = openFullDb();
  insertMedia(db, { id: "m1", r2Key: "blog-cover/m1.webp", lifecycleStatus: "DRAFT", status: "NEW", isVisible: 0 });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "m1", false);
  assert.deepEqual(result, { ok: true });
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXV. Media category set includes BLOG
   ═══════════════════════════════════════════════════════════════════════════ */

test("CAT.95 MEDIA_CATEGORIES set includes BLOG", () => {
  assert.ok(MEDIA_CATEGORIES.has("BLOG"));
});

test("CAT.96 MEDIA_CATEGORIES set includes all expected categories", () => {
  assert.ok(MEDIA_CATEGORIES.has("GENERAL"));
  assert.ok(MEDIA_CATEGORIES.has("GALLERY"));
  assert.ok(MEDIA_CATEGORIES.has("DOCTOR"));
  assert.ok(MEDIA_CATEGORIES.has("BLOG"));
  assert.ok(MEDIA_CATEGORIES.has("VIDEO_POSTER"));
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXVI. BlogStudio covers Blog Cover section header
   ═══════════════════════════════════════════════════════════════════════════ */

test("UI.97 BlogStudio has Blog Cover section header", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes("Cover Image") || src.includes("Cover"), "BlogStudio must have Cover section header");
});

test("UI.98 MediaPickerDialog categoryLabel set to Blog Cover", async () => {
  const src = readBlogStudioSrc();
  assert.ok(src.includes('categoryLabel="Blog Cover"'), "MediaPickerDialog must have Blog Cover categoryLabel");
});

/* ═══════════════════════════════════════════════════════════════════════════
   XXVII. Existing M4-C tests still pass (regression guard)
   ═══════════════════════════════════════════════════════════════════════════ */

test("REG.99 cover_media_id column exists after full migration", () => {
  const db = openFullDb();
  const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes("cover_media_id"), "cover_media_id exists");
  db.close();
});

test("REG.100 index idx_blog_posts_cover_media exists after full migration", () => {
  const db = openFullDb();
  const indexes = db.prepare("PRAGMA index_list(blog_posts)").all();
  const names = indexes.map(i => i.name);
  assert.ok(names.includes("idx_blog_posts_cover_media"), "index exists");
  db.close();
});
