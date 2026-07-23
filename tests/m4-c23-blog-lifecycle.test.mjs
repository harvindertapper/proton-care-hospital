import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

import {
  createBlog,
  updateBlog,
  publishBlog,
  hideBlog,
  archiveBlog,
  loadBlogById,
  validateBlogMediaRelation,
  validateCoverForPublication,
  ARCHIVED_BLOG_SAVE_ERROR,
} from "../app/lib/blog-admin.ts";

import { MutationConflictError, MutationNotFoundError } from "../app/lib/mutation-result.ts";

/* ═════════════════════════════════════════════════════════════════════════════
   Helpers
   ═════════════════════════════════════════════════════════════════════════════ */

function readMigration(name) {
  return fs.readFileSync(path.join(ROOT, "migrations", name), "utf-8");
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

function insertBlog(db, opts = {}) {
  const id = opts.id || `blog-${opts.slug || "test-blog"}-${Date.now()}`;
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, cover_media_id, lifecycle_status, version, is_deleted, source_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test')`,
  ).run(
    id, opts.slug || `slug-${Date.now()}`, opts.title || "Test Blog",
    opts.excerpt || "Test excerpt", opts.body || "Test body content.",
    opts.status || "DRAFT", opts.isVisible !== undefined ? (opts.isVisible ? 1 : 0) : 0,
    opts.coverMediaId || null,
    opts.lifecycleStatus || "DRAFT", opts.version || 1,
    opts.isDeleted ? 1 : 0,
  );
  return id;
}

function insertMedia(db, opts = {}) {
  const id = opts.id || `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note,
      status, is_visible, lifecycle_status, storage_type, category, updated_at, rights_status, purge_status)
     VALUES (?, ?, ?, ?, ?, 'blog-cover', 'test', '', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'UNVERIFIED', 'NONE')`,
  ).run(
    id, opts.r2Key || `blog-cover/${id}-test.jpg`,
    opts.fileName || "test.jpg", opts.contentType || "image/jpeg",
    opts.fileSize || 1024,
    opts.status || "APPROVED", opts.isVisible !== undefined ? (opts.isVisible ? 1 : 0) : 1,
    opts.lifecycleStatus || "PUBLISHED", opts.storageType || "R2", opts.category || "BLOG",
  );
  if (opts.deletedAt) {
    db.exec(`UPDATE media_assets SET deleted_at = '${opts.deletedAt}' WHERE id = '${id}'`);
  }
  return id;
}

function makeRepo(db) {
  return {
    query: (sql, ...binds) => {
      const stmt = db.prepare(sql);
      const results = stmt.all(...binds);
      return { results };
    },
    run: (sql, ...binds) => {
      const stmt = db.prepare(sql);
      const result = stmt.run(...binds);
      return { success: true, meta: { changes: Number(result.changes || 0) } };
    },
    audit: () => {},
  };
}

function makeSpyRepo(db) {
  const audits = [];
  return {
    query: (sql, ...binds) => {
      const stmt = db.prepare(sql);
      const results = stmt.all(...binds);
      return { results };
    },
    run: (sql, ...binds) => {
      const stmt = db.prepare(sql);
      const result = stmt.run(...binds);
      return { success: true, meta: { changes: Number(result.changes || 0) } };
    },
    audit: (actor, action, entityType, entityId, details) => {
      audits.push({ actor, action, entityType, entityId, details });
    },
    audits,
  };
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

/* ═════════════════════════════════════════════════════════════════════════════
   Section I: Blog Identity — blogId-based, not slug-based
   ═════════════════════════════════════════════════════════════════════════════ */

test("ID.1 — createBlog returns blogId and creates by stable id", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await createBlog(repo, "my-blog", { title: "T", excerpt: "E", body: "B", coverMediaId: null }, "admin@test.com");
  assert.ok(result.blogId, "returns blogId");
  assert.equal(result.outcome, "APPLIED");
  const loaded = await loadBlogById(repo, result.blogId);
  assert.ok(loaded, "can load by blogId");
  assert.equal(loaded.slug, "my-blog");
  db.close();
});

test("ID.2 — loadBlogById loads by blogId (not slug)", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { slug: "unique-slug-1", title: "Specific" });
  const loaded = await loadBlogById(repo, blogId);
  assert.ok(loaded, "loaded");
  assert.equal(loaded.id, blogId);
  assert.equal(loaded.slug, "unique-slug-1");
  db.close();
});

test("ID.3 — updateBlog uses blogId for identity (not slug)", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "DRAFT" });
  await updateBlog(repo, blogId, 1, {
    title: "Updated", excerpt: "E", body: "B", coverMediaId: null, coverMediaIdExplicitlyProvided: false,
  }, "admin@test.com");
  const row = db.prepare("SELECT title FROM blog_posts WHERE id = ?").get(blogId);
  assert.equal(row.title, "Updated", "title updated via blogId");
  db.close();
});

test("ID.4 — publishBlog uses blogId for identity", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "NEEDS_REVIEW" });
  await publishBlog(repo, blogId, 1, "admin@test.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.status, "APPROVED");
  assert.equal(loaded.is_visible, 1);
  db.close();
});

test("ID.5 — archiveBlog uses blogId for identity", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "DRAFT" });
  await archiveBlog(repo, blogId, 1, "admin@test.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.is_deleted, 1);
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section II: Version concurrency guards
   ═════════════════════════════════════════════════════════════════════════════ */

test("VC.6 — updateBlog rejects stale version", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await assert.rejects(
    () => updateBlog(repo, blogId, 2, { title: "X", excerpt: "E", body: "B", coverMediaId: null, coverMediaIdExplicitlyProvided: false }, "a@t.com"),
    MutationConflictError,
  );
  db.close();
});

test("VC.7 — publishBlog rejects stale version", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await assert.rejects(
    () => publishBlog(repo, blogId, 2, "a@t.com"),
    MutationConflictError,
  );
  db.close();
});

test("VC.8 — hideBlog rejects stale version", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "APPROVED", isVisible: true });
  await assert.rejects(
    () => hideBlog(repo, blogId, 2, "a@t.com"),
    MutationConflictError,
  );
  db.close();
});

test("VC.9 — archiveBlog rejects stale version", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await assert.rejects(
    () => archiveBlog(repo, blogId, 2, "a@t.com"),
    MutationConflictError,
  );
  db.close();
});

test("VC.10 — updateBlog succeeds with matching version", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await updateBlog(repo, blogId, 1, { title: "New", excerpt: "E", body: "B", coverMediaId: null, coverMediaIdExplicitlyProvided: false }, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.version, 2, "version incremented");
  const row = db.prepare("SELECT title FROM blog_posts WHERE id = ?").get(blogId);
  assert.equal(row.title, "New");
  db.close();
});

test("VC.11 — publishBlog succeeds with matching version and increments", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await publishBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.version, 2, "version incremented");
  assert.equal(loaded.status, "APPROVED");
  db.close();
});

test("VC.12 — archiveBlog succeeds with matching version and increments", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.version, 2, "version incremented");
  assert.equal(loaded.is_deleted, 1);
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section III: Archive lifecycle
   ═════════════════════════════════════════════════════════════════════════════ */

test("ARC.13 — archiveBlog sets is_deleted=1", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.is_deleted, 1);
  db.close();
});

test("ARC.14 — archiveBlog sets is_visible=0", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, isVisible: true, status: "APPROVED" });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.is_visible, 0);
  db.close();
});

test("ARC.15 — archiveBlog sets status=HIDDEN", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "APPROVED" });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.status, "HIDDEN");
  db.close();
});

test("ARC.16 — archiveBlog sets deleted_at timestamp", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const rows = repo.query("SELECT deleted_at FROM blog_posts WHERE id = ?", blogId);
  assert.ok(rows.results[0].deleted_at, "deleted_at is set");
  db.close();
});

test("ARC.17 — archiveBlog rejects already-deleted blog", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  await assert.rejects(
    () => archiveBlog(repo, blogId, 2, "a@t.com"),
    MutationNotFoundError,
  );
  db.close();
});

test("ARC.18 — archiveBlog rejects non-existent blog", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  await assert.rejects(
    () => archiveBlog(repo, "nonexistent-id", 1, "a@t.com"),
    MutationNotFoundError,
  );
  db.close();
});

test("ARC.19 — archiveBlog audits BLOG_ARCHIVED", async () => {
  const db = openFullDb();
  const spyRepo = makeSpyRepo(db);
  const blogId = insertBlog(db, { version: 1, slug: "audit-test" });
  await archiveBlog(spyRepo, blogId, 1, "admin@test.com");
  const match = spyRepo.audits.find((a) => a.action === "BLOG_ARCHIVED");
  assert.ok(match, "BLOG_ARCHIVED audit found");
  assert.equal(match.entityId, blogId);
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section IV: Update/publish on archived blog is rejected
   ═════════════════════════════════════════════════════════════════════════════ */

test("ARC.20 — updateBlog rejects archived blog", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  await assert.rejects(
    () => updateBlog(repo, blogId, 2, { title: "X", excerpt: "E", body: "B", coverMediaId: null, coverMediaIdExplicitlyProvided: false }, "a@t.com"),
    MutationNotFoundError,
  );
  db.close();
});

test("ARC.21 — publishBlog rejects archived blog", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  await assert.rejects(
    () => publishBlog(repo, blogId, 2, "a@t.com"),
    MutationNotFoundError,
  );
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section V: Cover semantics — CREATE vs UPDATE
   ═════════════════════════════════════════════════════════════════════════════ */

test("COV.22 — createBlog accepts coverMediaId", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await createBlog(repo, "with-cover", { title: "T", excerpt: "E", body: "B", coverMediaId: "media-123" }, "a@t.com");
  const loaded = await loadBlogById(repo, result.blogId);
  assert.equal(loaded.cover_media_id, "media-123");
  db.close();
});

test("COV.23 — createBlog stores null cover when not provided", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await createBlog(repo, "no-cover", { title: "T", excerpt: "E", body: "B", coverMediaId: null }, "a@t.com");
  const loaded = await loadBlogById(repo, result.blogId);
  assert.equal(loaded.cover_media_id, null);
  db.close();
});

test("COV.24 — updateBlog preserves cover when coverMediaIdExplicitlyProvided=false", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, coverMediaId: "cover-original" });
  await updateBlog(repo, blogId, 1, { title: "Updated", excerpt: "E", body: "B", coverMediaId: null, coverMediaIdExplicitlyProvided: false }, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.cover_media_id, "cover-original", "cover preserved");
  db.close();
});

test("COV.25 — updateBlog replaces cover when explicit with new id", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, coverMediaId: "cover-1" });
  await updateBlog(repo, blogId, 1, { title: "Updated", excerpt: "E", body: "B", coverMediaId: "cover-2", coverMediaIdExplicitlyProvided: true }, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.cover_media_id, "cover-2", "cover replaced");
  db.close();
});

test("COV.26 — updateBlog clears cover when explicit with null", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, coverMediaId: "cover-1" });
  await updateBlog(repo, blogId, 1, { title: "Updated", excerpt: "E", body: "B", coverMediaId: null, coverMediaIdExplicitlyProvided: true }, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.cover_media_id, null, "cover cleared");
  db.close();
});

test("COV.27 — validateBlogMediaRelation accepts null coverMediaId", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, null, false);
  assert.equal(result.ok, true);
  db.close();
});

test("COV.28 — validateBlogMediaRelation rejects non-existent media", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "nonexistent-media-id", false);
  assert.equal(result.ok, false);
  db.close();
});

test("COV.29 — validateBlogMediaRelation rejects deleted media", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const mediaId = insertMedia(db, { deletedAt: "2025-01-01" });
  const result = await validateBlogMediaRelation(repo, mediaId, false);
  assert.equal(result.ok, false);
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section VI: Publication lifecycle
   ═════════════════════════════════════════════════════════════════════════════ */

test("PUB.30 — publishBlog sets status=APPROVED", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "DRAFT" });
  await publishBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.status, "APPROVED");
  db.close();
});

test("PUB.31 — publishBlog sets is_visible=1", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, isVisible: false });
  await publishBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.is_visible, 1);
  db.close();
});

test("PUB.32 — publishBlog sets lifecycle_status=PUBLISHED", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, lifecycleStatus: "DRAFT" });
  await publishBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.lifecycle_status, "PUBLISHED");
  db.close();
});

test("PUB.33 — re-publish still succeeds and increments version", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await publishBlog(repo, blogId, 1, "a@t.com");
  const after = await loadBlogById(repo, blogId);
  await publishBlog(repo, blogId, after.version, "a@t.com");
  const final = await loadBlogById(repo, blogId);
  assert.equal(final.version, after.version + 1, "version incremented again");
  db.close();
});

test("PUB.34 — hideBlog sets status=HIDDEN and is_visible=0", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "APPROVED", isVisible: true });
  await hideBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.status, "HIDDEN");
  assert.equal(loaded.is_visible, 0);
  db.close();
});

test("PUB.35 — hideBlog rejects non-existent blog", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  await assert.rejects(
    () => hideBlog(repo, "fake-id", 1, "a@t.com"),
    MutationNotFoundError,
  );
  db.close();
});

test("PUB.36 — validateCoverForPublication accepts fully eligible media", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const mediaId = insertMedia(db, { status: "APPROVED", lifecycleStatus: "PUBLISHED", isVisible: true, storageType: "R2", r2Key: "blog-cover/valid.jpg" });
  const result = await validateCoverForPublication(repo, mediaId);
  assert.equal(result.ok, true);
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section VII: Frontend BlogStudio contract
   ═════════════════════════════════════════════════════════════════════════════ */

test("FE.37 — BlogStudio component exists at expected path", () => {
  const exists = fs.existsSync(path.join(ROOT, "app", "components", "admin", "BlogStudio.tsx"));
  assert.ok(exists, "BlogStudio.tsx exists");
});

test("FE.38 — BlogStudio exports BlogMutateResult type", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("BlogMutateResult"), "exports BlogMutateResult");
});

test("FE.39 — BlogStudio uses selectedBlogId for isEditing", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.match(src, /const isEditing = Boolean\(selectedBlogId\)/, "uses selectedBlogId");
});

test("FE.40 — BlogStudio sends blogId in UPDATE payload", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("payload.blogId = selectedBlogId"), "sends blogId in update");
});

test("FE.41 — BlogStudio sends coverMediaId on CREATE when present", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const idx = src.indexOf("handleSave");
  const block = src.substring(idx, idx + 2000);
  assert.ok(block.includes("coverMediaId"), "includes coverMediaId in save");
});

test("FE.42 — BlogStudio handles archive action", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("blog.archive") || src.includes("archive"), "handles archive action");
});

test("FE.43 — BlogStudio row actions use stopPropagation", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("stopPropagation"), "uses stopPropagation on action buttons");
});

/* ═════════════════════════════════════════════════════════════════════════════
   Section VIII: Backend wiring
   ═════════════════════════════════════════════════════════════════════════════ */

test("API.44 — route.ts has blog.archive action dispatch", () => {
  const src = readSource("app/api/admin/data/route.ts");
  assert.ok(src.includes('"blog.archive"'), "blog.archive dispatch exists");
});

test("API.45 — route.ts validates blog.archive requires blogId and expectedVersion", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const idx = src.indexOf('action === "blog.archive"');
  const block = src.substring(idx - 50, idx + 400);
  assert.ok(block.includes("blogId") || src.includes("blogId is required."), "validates blogId");
  assert.ok(block.includes("expectedVersion") || src.includes("expectedVersion is required for blog archive"), "validates expectedVersion");
});

test("APL.46 — blog-admin.ts exports archiveBlog", () => {
  const src = readSource("app/lib/blog-admin.ts");
  assert.ok(src.includes("export async function archiveBlog"), "exports archiveBlog");
});

test("APL.47 — AdminConsole wires BlogStudio instead of BlogForm", () => {
  const src = readSource("app/components/AdminConsole.tsx");
  assert.ok(src.includes("BlogStudio"), "imports/uses BlogStudio");
  assert.ok(!src.includes("function BlogForm"), "BlogForm definition removed");
});
