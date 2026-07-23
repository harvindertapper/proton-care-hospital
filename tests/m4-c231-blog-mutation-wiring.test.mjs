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
} from "../app/lib/blog-admin.ts";

import { MutationConflictError, MutationNotFoundError } from "../app/lib/mutation-result.ts";
import { executeRoleMutation } from "../app/lib/mutation-result.ts";

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

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 1 — Explicit mode dispatch
   ═════════════════════════════════════════════════════════════════════════════ */

test("MOD.1 — route.ts validatePayload requires mode for blog.save", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const vpIdx = src.indexOf("function validatePayload(");
  const section = src.slice(vpIdx, vpIdx + 3000);
  const blogSaveIdx = section.indexOf('"blog.save"');
  const block = section.slice(blogSaveIdx, blogSaveIdx + 800);
  assert.ok(block.includes("obj.mode"), "validates mode field exists");
  assert.ok(block.includes('"CREATE"') && block.includes('"UPDATE"'), "validates mode is CREATE or UPDATE");
});

test("MOD.2 — route.ts validatePayload requires blogId for UPDATE mode", () => {
  const src = readSource("app/api/admin/data/route.ts");
  assert.ok(src.includes("blogId is required for UPDATE mode"), "UPDATE mode requires blogId");
});

test("MOD.3 — route.ts applyBlog reads explicit mode field", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.ok(applyBlogBlock.includes('clean(payload.mode'), "reads mode from payload");
  assert.ok(applyBlogBlock.includes('"UPDATE"'), "dispatches on UPDATE");
  assert.ok(applyBlogBlock.includes('"CREATE"'), "dispatches on CREATE");
});

test("MOD.4 — route.ts applyBlog rejects unknown mode", () => {
  const src = readSource("app/api/admin/data/route.ts");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.ok(applyBlogBlock.includes("mode must be 'CREATE' or 'UPDATE'"), "rejects unknown mode");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 2 — Slug persistence on UPDATE
   ═════════════════════════════════════════════════════════════════════════════ */

test("SLG.5 — createBlog returns slug in response", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await createBlog(repo, "my-slug", {
    title: "Test", excerpt: "E", body: "B", coverMediaId: null,
  }, "a@t.com");
  assert.equal(result.slug, "my-slug", "createBlog returns slug");
  assert.equal(typeof result.version, "number", "createBlog returns version");
  assert.equal(typeof result.blogId, "string", "createBlog returns blogId");
  db.close();
});

test("SLG.6 — updateBlog returns slug in response", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, slug: "old-slug" });
  const result = await updateBlog(repo, blogId, 1, {
    title: "Updated", slug: "new-slug", excerpt: "E", body: "B",
    coverMediaId: null, coverMediaIdExplicitlyProvided: false,
  }, "a@t.com");
  assert.equal(result.slug, "new-slug", "updateBlog returns new slug");
  assert.equal(result.blogId, blogId, "updateBlog returns blogId");
  assert.equal(result.version, 2, "updateBlog returns incremented version");
  db.close();
});

test("SLG.7 — updateBlog persists slug change in database", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, slug: "old-slug" });
  await updateBlog(repo, blogId, 1, {
    title: "Updated", slug: "new-slug", excerpt: "E", body: "B",
    coverMediaId: null, coverMediaIdExplicitlyProvided: false,
  }, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.slug, "new-slug", "slug persisted in database");
  db.close();
});

test("SLG.8 — updateBlog rejects duplicate slug from another blog", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const id1 = insertBlog(db, { version: 1, slug: "slug-a" });
  const id2 = insertBlog(db, { version: 1, slug: "slug-b" });
  await assert.rejects(
    () => updateBlog(repo, id2, 1, {
      title: "Updated", slug: "slug-a", excerpt: "E", body: "B",
      coverMediaId: null, coverMediaIdExplicitlyProvided: false,
    }, "a@t.com"),
    MutationConflictError,
  );
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 3 — Slug touched tracking
   ═════════════════════════════════════════════════════════════════════════════ */

test("SLT.9 — BlogStudio declares slugTouched state", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("slugTouched"), "slugTouched state exists");
  assert.ok(src.includes("setSlugTouched"), "setSlugTouched setter exists");
});

test("SLT.10 — BlogStudio resets slugTouched on add new", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const addNewIdx = src.indexOf("handleAddNew");
  const block = src.substring(addNewIdx, addNewIdx + 500);
  assert.ok(block.includes("setSlugTouched(false)"), "resets slugTouched to false on add new");
});

test("SLT.11 — BlogStudio sets slugTouched true on slug input change", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const slugIdx = src.indexOf("setSlugTouched(true)");
  assert.ok(slugIdx > 0, "sets slugTouched to true somewhere");
  const slugInputIdx = src.indexOf("Slug");
  assert.ok(slugInputIdx > 0, "slug label exists in source");
});

test("SLT.12 — BlogStudio sets slugTouched true on select existing blog", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const selectIdx = src.indexOf("handleSelectBlog");
  const block = src.substring(selectIdx, selectIdx + 800);
  assert.ok(block.includes("setSlugTouched(true)"), "sets slugTouched true when selecting existing blog");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 4 — Stable archive (no blog.delete)
   ═════════════════════════════════════════════════════════════════════════════ */

test("ARC.13 — BlogStudio uses blog.archive not blog.delete in handleArchive", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("handleArchive"), "handleArchive exists");
  assert.ok(src.includes('"blog.archive"'), "sends blog.archive action");
  assert.ok(!src.includes('"blog.delete"') || !src.includes("handleDelete"), "no blog.delete handler");
});

test("ARC.14 — BlogStudio handleArchive passes blogId and expectedVersion", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const archiveIdx = src.indexOf("handleArchive");
  const block = src.substring(archiveIdx, archiveIdx + 600);
  assert.ok(block.includes("blogId"), "passes blogId");
  assert.ok(block.includes("expectedVersion"), "passes expectedVersion");
});

test("ARC.15 — archiveBlog sets is_deleted=1", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1 });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.is_deleted, 1, "blog is deleted");
  db.close();
});

test("ARC.16 — archiveBlog sets lifecycle_status=ARCHIVED", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, lifecycleStatus: "DRAFT" });
  await archiveBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.lifecycle_status, "ARCHIVED", "lifecycle set to ARCHIVED");
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 5 — Canonical hide lifecycle
   ═════════════════════════════════════════════════════════════════════════════ */

test("HID.17 — hideBlog sets lifecycle_status=DRAFT", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "APPROVED", isVisible: true, lifecycleStatus: "PUBLISHED" });
  await hideBlog(repo, blogId, 1, "a@t.com");
  const loaded = await loadBlogById(repo, blogId);
  assert.equal(loaded.lifecycle_status, "DRAFT", "hide resets lifecycle to DRAFT");
  assert.equal(loaded.status, "HIDDEN", "status is HIDDEN");
  assert.equal(loaded.is_visible, 0, "is_visible is 0");
  db.close();
});

test("HID.18 — hideBlog returns version in response", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "APPROVED", isVisible: true });
  const result = await hideBlog(repo, blogId, 1, "a@t.com");
  assert.equal(typeof result.version, "number", "returns version");
  assert.equal(result.version, 2, "version incremented");
  db.close();
});

test("HID.19 — hideBlog returns slug in response", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, slug: "my-blog", status: "APPROVED", isVisible: true });
  const result = await hideBlog(repo, blogId, 1, "a@t.com");
  assert.equal(result.slug, "my-blog", "returns slug");
  assert.equal(result.blogId, blogId, "returns blogId");
  db.close();
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 6 — Publish/Hide NO_OP
   ═════════════════════════════════════════════════════════════════════════════ */

test("NOP.20 — publishBlog returns NO_OP when already fully published", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "APPROVED", isVisible: true, lifecycleStatus: "PUBLISHED" });
  const result = await publishBlog(repo, blogId, 1, "a@t.com");
  assert.equal(result.outcome, "NO_OP", "returns NO_OP for already published");
  assert.equal(result.version, 1, "version unchanged");
  db.close();
});

test("NOP.21 — hideBlog returns NO_OP when already fully hidden", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, status: "HIDDEN", isVisible: false, lifecycleStatus: "DRAFT" });
  const result = await hideBlog(repo, blogId, 1, "a@t.com");
  assert.equal(result.outcome, "NO_OP", "returns NO_OP for already hidden");
  assert.equal(result.version, 1, "version unchanged");
  db.close();
});

test("NOP.22 — BlogStudio handles NO_OP outcome for publish", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const publishIdx = src.indexOf("handlePublish");
  const block = src.substring(publishIdx, publishIdx + 600);
  assert.ok(block.includes("NO_OP"), "checks for NO_OP outcome");
  assert.ok(block.includes("already published"), "shows already published message");
});

test("NOP.23 — BlogStudio handles NO_OP outcome for hide", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const hideIdx = src.indexOf("handleHide");
  const block = src.substring(hideIdx, hideIdx + 600);
  assert.ok(block.includes("NO_OP"), "checks for NO_OP outcome");
  assert.ok(block.includes("already hidden"), "shows already hidden message");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 7 — Authoritative cover preview
   ═════════════════════════════════════════════════════════════════════════════ */

test("COV.24 — BlogStudio uses /api/media/ gateway for cover preview", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("/api/media/"), "uses /api/media/ gateway for cover preview");
});

test("COV.25 — BlogStudio has coverImgFailed fallback state", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("coverImgFailed"), "coverImgFailed state exists");
  assert.ok(src.includes("setCoverImgFailed"), "setCoverImgFailed setter exists");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 8 — Server response data enrichment
   ═════════════════════════════════════════════════════════════════════════════ */

test("RES.26 — createBlog returns blogId+version+slug", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await createBlog(repo, "test-slug", {
    title: "T", excerpt: "E", body: "B", coverMediaId: null,
  }, "a@t.com");
  assert.ok(result.blogId, "has blogId");
  assert.equal(typeof result.version, "number", "has version");
  assert.equal(result.slug, "test-slug", "has slug");
  db.close();
});

test("RES.27 — updateBlog returns blogId+version+slug", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blogId = insertBlog(db, { version: 1, slug: "old" });
  const result = await updateBlog(repo, blogId, 1, {
    title: "T", slug: "new", excerpt: "E", body: "B",
    coverMediaId: null, coverMediaIdExplicitlyProvided: false,
  }, "a@t.com");
  assert.equal(result.blogId, blogId, "has blogId");
  assert.equal(result.version, 2, "has version");
  assert.equal(result.slug, "new", "has slug");
  db.close();
});

test("RES.28 — executeRoleMutation forwards extra fields from mutation", async () => {
  const result = await executeRoleMutation({
    isStaff: false,
    createRevision: async () => ({}),
    applyMutation: async () => ({
      outcome: "APPLIED",
      blogId: "test-123",
      version: 3,
      slug: "test-slug",
    }),
  });
  assert.equal(result.outcome, "APPLIED", "outcome forwarded");
  assert.equal(result.blogId, "test-123", "blogId forwarded");
  assert.equal(result.version, 3, "version forwarded");
  assert.equal(result.slug, "test-slug", "slug forwarded");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 9 — Role/revision identity for blog.archive
   ═════════════════════════════════════════════════════════════════════════════ */

test("REV.29 — blog.archive goes through executeRoleMutation path", () => {
  const src = readSource("app/api/admin/data/route.ts");
  assert.ok(src.includes('"blog.archive"'), "blog.archive action exists in route.ts");
  assert.ok(src.includes("applyArchiveBlog"), "applyArchiveBlog function exists");
});

test("REV.30 — blog.save STAFF role gets PENDING_APPROVAL", async () => {
  const result = await executeRoleMutation({
    isStaff: true,
    createRevision: async () => ({ id: "rev-1" }),
    applyMutation: async () => ({ outcome: "APPLIED" }),
  });
  assert.equal(result.outcome, "PENDING_APPROVAL", "staff gets PENDING_APPROVAL");
  assert.ok(result.revision, "revision created");
});

/* ═════════════════════════════════════════════════════════════════════════════
   FIX 10 — BlogMutateResult and BlogStudio contract
   ═════════════════════════════════════════════════════════════════════════════ */

test("TYP.31 — BlogMutateResult type includes slug in data", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("slug?: string"), "BlogMutateResult data type includes slug");
});

test("TYP.32 — BlogStudio sends mode in save payload", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  const saveIdx = src.indexOf("handleSave");
  const block = src.substring(saveIdx, saveIdx + 1200);
  assert.ok(block.includes('mode,') || block.includes("mode:"), "sends mode in payload");
  assert.ok(block.includes('"UPDATE"') || block.includes("'UPDATE'") || block.includes("isUpdate ? \"UPDATE\""), "mode is UPDATE for edits");
  assert.ok(block.includes('"CREATE"') || block.includes("'CREATE'") || block.includes("isUpdate ? \"UPDATE\" : \"CREATE\""), "mode is CREATE for new");
});

test("TYP.33 — BlogStudio title typing respects slugTouched", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("slugTouched"), "slugTouched is used in BlogStudio");
  assert.ok(src.includes("slugTouched)"), "slugTouched is checked in a condition (parenthesized)");
});

test("TYP.34 — BlogStudio cover preview uses on error fallback", () => {
  const src = readSource("app/components/admin/BlogStudio.tsx");
  assert.ok(src.includes("onError") || src.includes("onerror"), "has onError handler for cover image");
  assert.ok(src.includes("setCoverImgFailed(true)"), "sets coverImgFailed on error");
});

test("TYP.35 — blogMutate in AdminConsole extracts slug from response", () => {
  const src = readSource("app/components/AdminConsole.tsx");
  const blogMutateIdx = src.indexOf("async function blogMutate");
  const block = src.substring(blogMutateIdx, blogMutateIdx + 600);
  assert.ok(block.includes("slug"), "blogMutate passes slug through");
});

test("TYP.36 — blog-admin.ts updateBlog accepts slug in fields", () => {
  const src = readSource("app/lib/blog-admin.ts");
  assert.ok(src.includes("slug: string") || src.includes("slug:"), "updateBlog fields type includes slug");
  assert.ok(src.includes("SET slug"), "updateBlog SQL updates slug column");
  assert.ok(src.includes("fields.slug"), "updateBlog reads slug from fields");
});
