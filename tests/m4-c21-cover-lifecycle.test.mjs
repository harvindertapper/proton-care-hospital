import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "..");

import {
  validateBlogMediaRelation,
  loadBlog,
  loadBlogById,
  createBlog,
  updateBlog,
} from "../app/lib/blog-admin.ts";

import { ALLOWED_PURPOSES } from "../app/lib/media-policy.ts";
import { MEDIA_CATEGORIES } from "../app/lib/media-schema.ts";

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
  const id = opts.id || `blog-${opts.slug || "test-blog"}`;
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, cover_media_id, lifecycle_status, version, is_deleted, source_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'test')`,
  ).run(
    id, opts.slug || "test-blog", opts.title || "Test Blog",
    opts.excerpt || "Test excerpt", opts.body || "Test body content.",
    opts.status || "APPROVED", opts.isVisible !== undefined ? (opts.isVisible ? 1 : 0) : 1,
    opts.coverMediaId !== undefined ? opts.coverMediaId : null,
    opts.lifecycleStatus || "PUBLISHED", opts.version || 1, opts.isDeleted || 0,
  );
}

function insertMedia(db, opts = {}) {
  const id = opts.id || crypto.randomUUID();
  const r2Key = opts.r2Key || `blog-cover/${crypto.randomUUID()}-test.jpg`;
  db.prepare(
    `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, consent_note,
      status, is_visible, lifecycle_status, storage_type, category, updated_at, rights_status, purge_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'UNVERIFIED', 'NONE')`,
  ).run(
    id, r2Key, "test.jpg", "image/jpeg", 1024, opts.purpose || "blog-cover", "test@test.com", "",
    opts.status || "APPROVED", opts.isVisible !== undefined ? (opts.isVisible ? 1 : 0) : 1,
    opts.lifecycleStatus || "PUBLISHED", opts.storageType || "R2", opts.category || "BLOG",
  );
  if (opts.deletedAt) {
    db.exec(`UPDATE media_assets SET deleted_at = '${opts.deletedAt}' WHERE id = '${id}'`);
  }
  return { id, r2Key };
}

function makeRepo(db) {
  return {
    query: (sql, ...binds) => {
      try {
        return Promise.resolve({ results: db.prepare(sql).all(...binds) });
      } catch (err) {
        return Promise.reject(err);
      }
    },
    run: (sql, ...binds) => {
      try {
        const info = db.prepare(sql).run(...binds);
        return Promise.resolve({ success: true, meta: { changes: info.changes } });
      } catch (err) {
        return Promise.reject(err);
      }
    },
    audit: () => Promise.resolve(),
  };
}

const PUBLIC_BLOG_LIST_SQL = `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.body, bp.author, bp.reviewer, bp.created_at,
              ma.storage_type AS cover_storage_type,
              ma.r2_key AS cover_r2_key,
              ma.public_path AS cover_public_path,
              ma.display_public_path AS cover_display_public_path,
              ma.alt_text AS cover_alt_text
       FROM blog_posts bp
       LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
       WHERE bp.status = 'APPROVED' AND bp.is_visible = 1 AND bp.is_deleted = 0
         AND bp.lifecycle_status = 'PUBLISHED'
       ORDER BY bp.created_at DESC`;

const PUBLIC_BLOG_BY_SLUG_SQL = `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.body, bp.author, bp.reviewer, bp.created_at,
              ma.storage_type AS cover_storage_type,
              ma.r2_key AS cover_r2_key,
              ma.public_path AS cover_public_path,
              ma.display_public_path AS cover_display_public_path,
              ma.alt_text AS cover_alt_text
       FROM blog_posts bp
       LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id AND ma.deleted_at IS NULL
       WHERE bp.slug = ? AND bp.status = 'APPROVED' AND bp.is_visible = 1 AND bp.is_deleted = 0
         AND bp.lifecycle_status = 'PUBLISHED'`;

/* ═════════════════════════════════════════════════════════════════════════════
   I. Upload Lifecycle — blog-cover starts DRAFT, not PUBLISHED
   ═════════════════════════════════════════════════════════════════════════════ */

test("UL.01 — blog-cover upload initializes as DRAFT/HIDDEN/not-visible", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  assert.match(src, /purpose === "blog-cover"/, "blog-cover purpose branch exists");
  assert.match(src, /status = "HIDDEN"/, "blog-cover sets status=HIDDEN");
  assert.match(src, /isVisible = 0/, "blog-cover sets isVisible=0");
  assert.match(src, /lifecycleStatus = "DRAFT"/, "blog-cover sets lifecycleStatus=DRAFT");
});

test("UL.02 — gallery upload still initializes as PUBLISHED", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const galleryBlock = src.substring(src.indexOf('purpose === "gallery"'), src.indexOf('purpose === "doctor-photo"'));
  assert.match(galleryBlock, /status = "APPROVED"/, "gallery sets status=APPROVED");
  assert.match(galleryBlock, /isVisible = 1/, "gallery sets isVisible=1");
  assert.match(galleryBlock, /lifecycleStatus = "PUBLISHED"/, "gallery sets lifecycleStatus=PUBLISHED");
});

test("UL.03 — doctor-photo upload still initializes as PUBLISHED", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const docBlock = src.substring(src.indexOf('purpose === "doctor-photo"'), src.indexOf('purpose === "blog-cover"'));
  assert.match(docBlock, /status = "APPROVED"/, "doctor-photo sets status=APPROVED");
  assert.match(docBlock, /isVisible = 1/, "doctor-photo sets isVisible=1");
  assert.match(docBlock, /lifecycleStatus = "PUBLISHED"/, "doctor-photo sets lifecycleStatus=PUBLISHED");
});

test("UL.04 — admin-upload default still initializes as HIDDEN", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const adminBlock = src.substring(src.indexOf("} else {", src.indexOf('purpose === "blog-cover"')));
  assert.match(adminBlock, /status = "HIDDEN"/, "admin-upload sets status=HIDDEN");
  assert.match(adminBlock, /isVisible = 0/, "admin-upload sets isVisible=0");
  assert.match(adminBlock, /lifecycleStatus = "HIDDEN"/, "admin-upload sets lifecycleStatus=HIDDEN");
});

test("UL.05 — blog-cover purpose is in ALLOWED_PURPOSES", () => {
  assert.ok(ALLOWED_PURPOSES.has("blog-cover"), "blog-cover is an allowed purpose");
  assert.equal(ALLOWED_PURPOSES.size, 4, "there are exactly 4 allowed purposes");
});

test("UL.06 — blog-cover maps to BLOG category in media upload", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  assert.match(src, /purpose === "blog-cover" \? "BLOG"/, "blog-cover maps to BLOG category");
});

test("UL.07 — blog-cover upload uses DRAFT lifecycle consistently", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const blogCoverStart = src.indexOf('purpose === "blog-cover"');
  const nextBlock = src.indexOf("} else {", blogCoverStart);
  const blogCoverBlock = src.substring(blogCoverStart, nextBlock);
  assert.doesNotMatch(blogCoverBlock, /PUBLISHED/, "blog-cover block does not set PUBLISHED");
});

/* ═════════════════════════════════════════════════════════════════════════════
   II. Concurrency — create/update split with version guards
   ═════════════════════════════════════════════════════════════════════════════ */

test("CONC.08 — createBlog exists and is exported from blog-admin.ts", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  assert.match(src, /export async function createBlog/, "createBlog is exported");
});

test("CONC.09 — updateBlog exists and is exported from blog-admin.ts", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  assert.match(src, /export async function updateBlog/, "updateBlog is exported");
});

test("CONC.10 — createBlog INSERTs with version=1 and NEEDS_REVIEW/DRAFT defaults", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  const createStart = src.indexOf("export async function createBlog");
  const createEnd = src.indexOf("export async function updateBlog");
  const createBlock = src.substring(createStart, createEnd);
  assert.ok(createBlock.includes("NEEDS_REVIEW"), "createBlog sets status=NEEDS_REVIEW");
  assert.ok(createBlock.includes("'DRAFT'"), "createBlog sets lifecycle_status=DRAFT");
  assert.ok(createBlock.includes("1)"), "createBlog sets version=1");
  assert.match(createBlock, /INSERT INTO blog_posts/, "createBlog uses INSERT");
});

test("CONC.11 — updateBlog uses WHERE id = ? AND version = ? guard", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  const updateBlock = src.substring(src.indexOf("export async function updateBlog"));
  assert.match(updateBlock, /WHERE id = \? AND version = \? AND is_deleted = 0/, "updateBlog uses id+version guard");
  assert.match(updateBlock, /version = version \+ 1/, "updateBlog increments version");
});

test("CONC.12 — updateBlog throws MutationConflictError on version mismatch", async () => {
  const db = openFullDb();
  const blogId = "blog-id-conc-test";
  insertBlog(db, { id: blogId, slug: "conc-test", version: 2 });
  const repo = makeRepo(db);

  try {
    await updateBlog(repo, blogId, 1, {
      title: "Updated", excerpt: "Updated", body: "Updated",
      coverMediaId: null, coverMediaIdExplicitlyProvided: false,
    }, "test@test.com");
    assert.fail("Should have thrown");
  } catch (err) {
    assert.equal(err.name, "MutationConflictError", "throws MutationConflictError on version mismatch");
  }
});

test("CONC.13 — updateBlog succeeds on correct version", async () => {
  const db = openFullDb();
  const blogId = "blog-id-conc-ok";
  insertBlog(db, { id: blogId, slug: "conc-ok", version: 1 });
  const repo = makeRepo(db);

  const result = await updateBlog(repo, blogId, 1, {
    title: "Updated Title", excerpt: "Updated", body: "Updated body",
    coverMediaId: null, coverMediaIdExplicitlyProvided: false,
  }, "test@test.com");
  assert.equal(result.outcome, "APPLIED", "updateBlog returns APPLIED");

  const rows = db.prepare("SELECT title, version FROM blog_posts WHERE id = 'blog-id-conc-ok'").all();
  assert.equal(rows[0].title, "Updated Title", "title was updated");
  assert.equal(rows[0].version, 2, "version was incremented");
});

test("CONC.14 — createBlog creates with version=1 and stable UUID in database", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);

  const result = await createBlog(repo, "new-blog", {
    title: "New Blog", excerpt: "New", body: "Body",
    coverMediaId: null,
  }, "test@test.com");

  const rows = db.prepare("SELECT version, id FROM blog_posts WHERE slug = 'new-blog'").all();
  assert.equal(rows.length, 1, "blog was created");
  assert.equal(rows[0].version, 1, "version is 1");
  assert.equal(rows[0].id, result.blogId, "id is a stable UUID returned by createBlog");
  assert.ok(rows[0].id.length > 0, "id is non-empty");
});

test("CONC.15 — createBlog throws MutationConflictError on duplicate slug", async () => {
  const db = openFullDb();
  insertBlog(db, { slug: "dup-blog" });
  const repo = makeRepo(db);

  try {
    await createBlog(repo, "dup-blog", {
      title: "Dup", excerpt: "Dup", body: "Dup",
      coverMediaId: null, isVisible: true,
    }, "test@test.com");
    assert.fail("Should have thrown");
  } catch (err) {
    assert.equal(err.name, "MutationConflictError", "throws on duplicate slug");
  }
});

test("CONC.16 — applyBlog requires expectedVersion for existing blogs", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.match(applyBlogBlock, /expectedVersion is required for existing blog posts/, "requires expectedVersion for existing");
});

test("CONC.17 — applyBlog no longer uses UPSERT", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.doesNotMatch(applyBlogBlock, /ON CONFLICT.*DO UPDATE/, "no longer uses blind UPSERT");
  assert.match(applyBlogBlock, /return createBlog/, "delegates to createBlog for new posts");
  assert.match(applyBlogBlock, /return updateBlog/, "delegates to updateBlog for existing posts");
});

test("CONC.18 — applyBlog imports createBlog and updateBlog", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  assert.ok(src.includes("createBlog") && src.includes("from") && src.includes("blog-admin"), "imports createBlog from blog-admin");
  assert.ok(src.includes("updateBlog") && src.includes("from") && src.includes("blog-admin"), "imports updateBlog from blog-admin");
});

/* ═════════════════════════════════════════════════════════════════════════════
   III. Cover tri-state — omit/preserve, null/clear, value/set
   ═════════════════════════════════════════════════════════════════════════════ */

test("TRI.19 — coverMediaId omission preserves existing cover on update", async () => {
  const db = openFullDb();
  const media = insertMedia(db);
  const blogId = "blog-id-tri-preserve";
  insertBlog(db, { id: blogId, slug: "tri-preserve", coverMediaId: media.id, version: 1 });
  const repo = makeRepo(db);

  await updateBlog(repo, blogId, 1, {
    title: "Updated", excerpt: "Updated", body: "Updated",
    coverMediaId: null, coverMediaIdExplicitlyProvided: false,
  }, "test@test.com");

  const rows = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'blog-id-tri-preserve'").all();
  assert.equal(rows[0].cover_media_id, media.id, "cover_media_id is preserved when not explicitly provided");
});

test("TRI.20 — coverMediaId null explicitly clears existing cover on update", async () => {
  const db = openFullDb();
  const media = insertMedia(db);
  const blogId = "blog-id-tri-clear";
  insertBlog(db, { id: blogId, slug: "tri-clear", coverMediaId: media.id, version: 1 });
  const repo = makeRepo(db);

  await updateBlog(repo, blogId, 1, {
    title: "Updated", excerpt: "Updated", body: "Updated",
    coverMediaId: null, coverMediaIdExplicitlyProvided: true,
  }, "test@test.com");

  const rows = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'blog-id-tri-clear'").all();
  assert.equal(rows[0].cover_media_id, null, "cover_media_id is cleared when explicitly set to null");
});

test("TRI.21 — coverMediaId value sets new cover on update", async () => {
  const db = openFullDb();
  const media1 = insertMedia(db);
  const media2 = insertMedia(db);
  const blogId = "blog-id-tri-set";
  insertBlog(db, { id: blogId, slug: "tri-set", coverMediaId: media1.id, version: 1 });
  const repo = makeRepo(db);

  await updateBlog(repo, blogId, 1, {
    title: "Updated", excerpt: "Updated", body: "Updated",
    coverMediaId: media2.id, coverMediaIdExplicitlyProvided: true,
  }, "test@test.com");

  const rows = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'blog-id-tri-set'").all();
  assert.equal(rows[0].cover_media_id, media2.id, "cover_media_id is updated to new value");
});

test("TRI.22 — createBlog with null coverMediaId creates blog without cover", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);

  await createBlog(repo, "no-cover", {
    title: "No Cover", excerpt: "No cover", body: "Body",
    coverMediaId: null, isVisible: true,
  }, "test@test.com");

  const rows = db.prepare("SELECT cover_media_id FROM blog_posts WHERE slug = 'no-cover'").all();
  assert.equal(rows[0].cover_media_id, null, "new blog has null cover_media_id");
});

test("TRI.23 — createBlog with valid coverMediaId sets cover on creation", async () => {
  const db = openFullDb();
  const media = insertMedia(db);
  const repo = makeRepo(db);

  await createBlog(repo, "with-cover", {
    title: "With Cover", excerpt: "Covered", body: "Body",
    coverMediaId: media.id, isVisible: true,
  }, "test@test.com");

  const rows = db.prepare("SELECT cover_media_id FROM blog_posts WHERE slug = 'with-cover'").all();
  assert.equal(rows[0].cover_media_id, media.id, "new blog has cover_media_id set");
});

test("TRI.24 — applyBlog preserves cover when coverMediaId not in payload", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.match(applyBlogBlock, /coverMediaIdExplicitlyProvided/, "tracks whether coverMediaId was explicitly provided");
});

/* ═════════════════════════════════════════════════════════════════════════════
   IV. Target state — visibility validation uses post-save state
   ═════════════════════════════════════════════════════════════════════════════ */

test("TGT.25 — applyBlog uses existing blog's is_visible for media validation", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.match(applyBlogBlock, /existingVisible/, "uses existingVisible for media validation");
});

test("TGT.26 — validateBlogMediaRelation enforces PUBLISHED when isBlogVisible=true", async () => {
  const db = openFullDb();
  const media = insertMedia(db, { lifecycleStatus: "DRAFT", status: "HIDDEN", isVisible: false });
  const repo = makeRepo(db);

  const result = await validateBlogMediaRelation(repo, media.id, true);
  assert.equal(result.ok, false, "DRAFT media rejected for visible blog");
  assert.match(result.error, /Publish and approve/, "error mentions publish requirement");
});

test("TGT.27 — validateBlogMediaRelation allows DRAFT media when isBlogVisible=false", async () => {
  const db = openFullDb();
  const media = insertMedia(db, { lifecycleStatus: "DRAFT", status: "HIDDEN", isVisible: false });
  const repo = makeRepo(db);

  const result = await validateBlogMediaRelation(repo, media.id, false);
  assert.equal(result.ok, true, "DRAFT media accepted for hidden blog");
});

test("TGT.28 — validateBlogMediaRelation allows PUBLISHED media when isBlogVisible=true", async () => {
  const db = openFullDb();
  const media = insertMedia(db, { lifecycleStatus: "PUBLISHED", status: "APPROVED", isVisible: true });
  const repo = makeRepo(db);

  const result = await validateBlogMediaRelation(repo, media.id, true);
  assert.equal(result.ok, true, "PUBLISHED media accepted for visible blog");
});

/* ═════════════════════════════════════════════════════════════════════════════
   V. Public eligibility — lifecycle_status = 'PUBLISHED' in queries
   ═════════════════════════════════════════════════════════════════════════════ */

test("PUB.29 — public blog list SQL includes lifecycle_status = 'PUBLISHED'", () => {
  assert.match(PUBLIC_BLOG_LIST_SQL, /lifecycle_status = 'PUBLISHED'/, "blog list query requires PUBLISHED lifecycle");
});

test("PUB.30 — public blog by slug SQL includes lifecycle_status = 'PUBLISHED'", () => {
  assert.match(PUBLIC_BLOG_BY_SLUG_SQL, /lifecycle_status = 'PUBLISHED'/, "blog slug query requires PUBLISHED lifecycle");
});

test("PUB.31 — DRAFT blog excluded from public list", () => {
  const db = openFullDb();
  insertBlog(db, { slug: "draft-blog", lifecycleStatus: "DRAFT" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 0, "DRAFT blog is excluded");
});

test("PUB.32 — HIDDEN blog excluded from public list", () => {
  const db = openFullDb();
  insertBlog(db, { slug: "hidden-blog", lifecycleStatus: "HIDDEN" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 0, "HIDDEN blog is excluded");
});

test("PUB.33 — PUBLISHED blog included in public list", () => {
  const db = openFullDb();
  insertBlog(db, { slug: "pub-blog", lifecycleStatus: "PUBLISHED" });
  const rows = db.prepare(PUBLIC_BLOG_LIST_SQL).all();
  assert.equal(rows.length, 1, "PUBLISHED blog is included");
  assert.equal(rows[0].slug, "pub-blog");
});

test("PUB.34 — DRAFT blog excluded from public by slug", () => {
  const db = openFullDb();
  insertBlog(db, { slug: "draft-slug", lifecycleStatus: "DRAFT" });
  const rows = db.prepare(PUBLIC_BLOG_BY_SLUG_SQL).all("draft-slug");
  assert.equal(rows.length, 0, "DRAFT blog excluded from slug query");
});

test("PUB.35 — PUBLISHED blog included in public by slug", () => {
  const db = openFullDb();
  insertBlog(db, { slug: "pub-slug", lifecycleStatus: "PUBLISHED" });
  const rows = db.prepare(PUBLIC_BLOG_BY_SLUG_SQL).all("pub-slug");
  assert.equal(rows.length, 1, "PUBLISHED blog included in slug query");
});

test("PUB.36 — public blog list includes cover_alt_text column", () => {
  assert.match(PUBLIC_BLOG_LIST_SQL, /ma\.alt_text AS cover_alt_text/, "blog list query selects alt_text");
});

test("PUB.37 — public blog by slug includes cover_alt_text column", () => {
  assert.match(PUBLIC_BLOG_BY_SLUG_SQL, /ma\.alt_text AS cover_alt_text/, "blog slug query selects alt_text");
});

test("PUB.38 — public-data.ts getPublishedBlogs has lifecycle_status check", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "public-data.ts"), "utf-8");
  const fnBlock = src.substring(src.indexOf("export async function getPublishedBlogs"), src.indexOf("export async function getPublishedJobs"));
  assert.match(fnBlock, /lifecycle_status = 'PUBLISHED'/, "getPublishedBlogs SQL has lifecycle_status check");
  assert.match(fnBlock, /cover_alt_text/, "getPublishedBlogs maps coverAltText");
});

test("PUB.39 — public-data.ts getBlogBySlug has lifecycle_status check", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "public-data.ts"), "utf-8");
  const fnBlock = src.substring(src.indexOf("export async function getBlogBySlug"), src.indexOf("export async function getJobBySlug"));
  assert.match(fnBlock, /lifecycle_status = 'PUBLISHED'/, "getBlogBySlug SQL has lifecycle_status check");
  assert.match(fnBlock, /cover_alt_text/, "getBlogBySlug maps coverAltText");
});

/* ═════════════════════════════════════════════════════════════════════════════
   VI. Empty/failure — no defaultBlogs fallback
   ═════════════════════════════════════════════════════════════════════════════ */

test("EMP.40 — getPublishedBlogs returns empty array on no blogs", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "public-data.ts"), "utf-8");
  const fnBlock = src.substring(src.indexOf("export async function getPublishedBlogs"), src.indexOf("export async function getPublishedJobs"));
  assert.match(fnBlock, /return \[\]/, "returns empty array instead of defaultBlogs");
  assert.doesNotMatch(fnBlock, /defaultBlogs/, "does not reference defaultBlogs");
});

test("EMP.41 — getBlogBySlug returns null on blog not found", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "public-data.ts"), "utf-8");
  const fnBlock = src.substring(src.indexOf("export async function getBlogBySlug"), src.indexOf("export async function getJobBySlug"));
  assert.doesNotMatch(fnBlock, /defaultBlogs/, "does not reference defaultBlogs");
  assert.match(fnBlock, /return null/, "returns null when blog not found");
});

test("EMP.42 — defaultBlogs import removed from public-data.ts", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "public-data.ts"), "utf-8");
  assert.doesNotMatch(src, /import.*defaultBlogs/, "defaultBlogs is not imported");
});

test("EMP.43 — PublicBlog type includes coverAltText field", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "public-data.ts"), "utf-8");
  const typeBlock = src.substring(src.indexOf("export type PublicBlog"), src.indexOf("};", src.indexOf("export type PublicBlog")) + 2);
  assert.match(typeBlock, /coverAltText/, "PublicBlog type has coverAltText");
});

/* ═════════════════════════════════════════════════════════════════════════════
   VII. Gateway — lifecycle_status in blog-cover authorization
   ═════════════════════════════════════════════════════════════════════════════ */

test("GW.44 — gateway blog-cover query requires lifecycle_status = 'PUBLISHED'", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  assert.match(src, /lifecycle_status = 'PUBLISHED'/, "gateway checks lifecycle_status");
});

test("GW.45 — gateway blog-cover purpose checks BLOG category", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  assert.match(src, /purpose === "blog-cover"/, "gateway has blog-cover branch");
  assert.match(src, /category !== "BLOG"/, "gateway checks BLOG category");
});

test("GW.46 — gateway blog-cover checks blog is_visible and is_deleted", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const blogCoverIdx = src.indexOf('purpose === "blog-cover"');
  const nextBranch = src.indexOf("} else if", blogCoverIdx + 1);
  const block = src.substring(blogCoverIdx, nextBranch);
  assert.match(block, /is_visible = 1/, "checks is_visible");
  assert.match(block, /is_deleted = 0/, "checks is_deleted");
  assert.match(block, /lifecycle_status = 'PUBLISHED'/, "checks lifecycle_status");
});

test("GW.47 — gateway doctor-photo BLOG path checks eligibility", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const docPhotoIdx = src.indexOf('purpose === "doctor-photo"');
  const blogCheckIdx = src.indexOf('category === "BLOG"', docPhotoIdx);
  assert.ok(blogCheckIdx > docPhotoIdx, "BLOG check exists in doctor-photo path");
  const block = src.substring(docPhotoIdx, blogCheckIdx + 800);
  assert.ok(block.includes("blog_posts bp"), "doctor-photo BLOG path joins blog_posts");
  assert.ok(block.includes("is_visible = 1"), "doctor-photo BLOG path checks is_visible");
  assert.ok(block.includes("lifecycle_status = 'PUBLISHED'"), "doctor-photo BLOG path checks lifecycle_status");
});

test("GW.48 — gateway main query checks lifecycle_status, status, visibility", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  assert.match(src, /lifecycle_status = 'PUBLISHED'/, "main R2 query checks lifecycle_status");
  assert.match(src, /status = 'APPROVED'/, "main R2 query checks status=APPROVED");
  assert.match(src, /is_visible = 1/, "main R2 query checks is_visible=1");
});

test("GW.49 — gateway rejects non-BLOG category in blog-cover branch", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const blogCoverIdx = src.indexOf('purpose === "blog-cover"');
  const block = src.substring(blogCoverIdx, blogCoverIdx + 300);
  assert.match(block, /category !== "BLOG"/, "rejects non-BLOG category");
  assert.match(block, /Not found/, "returns 404 for wrong category");
});

test("GW.50 — gateway returns 404 when no blog references cover", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const blogCoverIdx = src.indexOf('purpose === "blog-cover"');
  const block = src.substring(blogCoverIdx, blogCoverIdx + 500);
  assert.match(block, /return new Response\("Not found"/, "returns 404 when no blog references");
});

test("GW.51 — gateway validates key segments before R2 access", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  assert.match(src, /function validateKeySegments/, "has key validation function");
  assert.match(src, /public:/, "rejects public: locator keys");
});

test("GW.52 — gateway fetches R2 after metadata authorization", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const bucketIdx = src.indexOf("getR2()");
  const authIdx = src.indexOf("Authorize by purpose");
  assert.ok(authIdx < bucketIdx, "authorization comes before R2 binding");
});

test("GW.53 — gateway sets cache-control and nosniff headers", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  assert.match(src, /cache-control.*public/, "sets cache-control header");
  assert.match(src, /x-content-type-options.*nosniff/, "sets nosniff header");
});

test("GW.54 — gateway rejects invalid path segments", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  assert.match(src, /\.\./, "rejects .. segments");
});

/* ═════════════════════════════════════════════════════════════════════════════
   VIII. Admin UX — BlogForm version, preview, expectedVersion
   ═════════════════════════════════════════════════════════════════════════════ */

test("UX.55 — BlogForm state includes expectedVersion", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 1000);
  assert.match(block, /expectedVersion/, "BlogForm state includes expectedVersion");
});

test("UX.56 — BlogForm state includes blogId", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 1000);
  assert.match(block, /blogId/, "BlogForm state includes blogId");
});

test("UX.57 — BlogForm sends expectedVersion in save payload", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 2000);
  assert.match(block, /expectedVersion: isEditing/, "sends expectedVersion");
});

test("UX.58 — BlogForm onRowClick populates version and blogId", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  assert.ok(src.includes("row.version"), "populates expectedVersion from row.version");
  assert.ok(src.includes("row.id"), "populates blogId from row.id");
  assert.ok(src.includes("expectedVersion: Number(row.version"), "expectedVersion mapped from row.version");
});

test("UX.59 — BlogForm cover shows image preview using canonical media URL", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 4000);
  assert.match(block, /<img/, "renders img element");
  assert.match(block, /Cover set/, "user-friendly label");
  assert.match(block, /\/api\/media\/\$\{form\.coverMediaId\}/, "uses canonical media URL for preview");
});

test("UX.60 — BlogForm cover img uses alt attribute with title fallback", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 4000);
  assert.match(block, /alt=\{form\.title \|\| "Blog cover"\}/, "alt uses title with fallback");
});

test("UX.61 — BlogForm cover img has dimensions", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 4000);
  assert.match(block, /width: 48/, "has width");
  assert.match(block, /height: 48/, "has height");
});

test("UX.62 — BlogForm Create New resets expectedVersion to 0", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 2000);
  assert.match(block, /expectedVersion: 0/, "resets to 0");
});

test("UX.63 — BlogForm shows editing banner when isEditing", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 2000);
  assert.match(block, /isEditing/, "uses isEditing variable");
  assert.match(block, /Editing blog post/, "shows editing banner");
});

test("UX.64 — BlogForm MediaPickerDialog category is BLOG", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 5000);
  assert.ok(block.includes('category="BLOG"'), "category is BLOG");
  assert.ok(block.includes('categoryLabel="Blog Cover"'), "categoryLabel is Blog Cover");
});

/* ═════════════════════════════════════════════════════════════════════════════
   IX. Public rendering — img alt, width, height
   ═════════════════════════════════════════════════════════════════════════════ */

test("REN.65 — blog list img uses coverAltText || title", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "page.tsx"), "utf-8");
  assert.match(src, /alt=\{blog\.coverAltText \|\| blog\.title\}/, "uses coverAltText fallback");
});

test("REN.66 — blog list img uses stored dimensions with fallback", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "page.tsx"), "utf-8");
  assert.ok(src.includes("blog.coverWidth && blog.coverWidth > 0 ? blog.coverWidth : 800"), "uses stored width with fallback");
  assert.ok(src.includes("blog.coverHeight && blog.coverHeight > 0 ? blog.coverHeight : 180"), "uses stored height with fallback");
});

test("REN.67 — blog detail img uses coverAltText || title", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "[slug]", "page.tsx"), "utf-8");
  assert.match(src, /alt=\{blog\.coverAltText \|\| blog\.title\}/, "uses coverAltText fallback");
});

test("REN.68 — blog detail img uses stored dimensions with fallback", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "[slug]", "page.tsx"), "utf-8");
  assert.ok(src.includes("blog.coverWidth && blog.coverWidth > 0 ? blog.coverWidth : 800"), "uses stored width with fallback");
  assert.ok(src.includes("blog.coverHeight && blog.coverHeight > 0 ? blog.coverHeight : 400"), "uses stored height with fallback");
});

test("REN.69 — blog list renders img only when coverMediaUrl", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "page.tsx"), "utf-8");
  assert.match(src, /blog\.coverMediaUrl \?/, "conditional img render");
});

test("REN.70 — blog detail renders img only when coverMediaUrl", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "[slug]", "page.tsx"), "utf-8");
  assert.match(src, /blog\.coverMediaUrl &&/, "conditional img render");
});

test("REN.71 — blog list falls back to Newspaper icon", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "page.tsx"), "utf-8");
  assert.match(src, /Newspaper/, "has Newspaper icon");
  assert.match(src, /aria-hidden="true"/, "icon is aria-hidden");
});

test("REN.72 — blog detail includes cover in JSON-LD", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "blog", "[slug]", "page.tsx"), "utf-8");
  assert.match(src, /jsonLd\.image = blog\.coverMediaUrl/, "cover in JSON-LD");
});

/* ═════════════════════════════════════════════════════════════════════════════
   X. Reference/audit — DELETE blog guard on media
   ═════════════════════════════════════════════════════════════════════════════ */

test("REF.73 — media DELETE checks blog_posts.cover_media_id", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const deleteIdx = src.indexOf("export async function DELETE");
  const block = src.substring(deleteIdx);
  assert.match(block, /blog_posts.*cover_media_id/, "checks blog reference");
  assert.match(block, /blogCoverRef/, "uses blogCoverRef variable");
});

test("REF.74 — media DELETE returns 409 when blog references media", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const deleteIdx = src.indexOf("export async function DELETE");
  const blogRefIdx = src.indexOf("blogCoverRef", deleteIdx);
  const block = src.substring(blogRefIdx, blogRefIdx + 400);
  assert.match(block, /CONFLICT/, "returns CONFLICT status");
  assert.match(block, /Media is still in use/, "conflict error message");
});

test("REF.75 — library DELETE also checks blog reference", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "library", "[id]", "route.ts"), "utf-8");
  const deleteIdx = src.indexOf("export async function DELETE");
  const block = src.substring(deleteIdx);
  assert.match(block, /blog_posts.*cover_media_id/, "checks blog reference");
});

test("REF.76 — media DELETE checks gallery reference", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const deleteIdx = src.indexOf("export async function DELETE");
  const block = src.substring(deleteIdx, deleteIdx + 3000);
  assert.match(block, /gallery_items.*media_id/, "checks gallery reference");
});

test("REF.77 — media DELETE checks doctor photo reference", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const deleteIdx = src.indexOf("export async function DELETE");
  const block = src.substring(deleteIdx, deleteIdx + 4000);
  assert.match(block, /doctor_profiles.*photo_url/, "checks doctor photo_url");
  assert.match(block, /doctor_profiles.*photo_media_id/, "checks photo_media_id");
});

test("REF.78 — dashboard query no longer has redundant cover_media_id", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  assert.doesNotMatch(src, /SELECT \*, cover_media_id FROM blog_posts/, "no redundant column");
  assert.match(src, /SELECT \* FROM blog_posts/, "uses SELECT *");
});

test("REF.79 — blog-admin exports ARCHIVED_BLOG_SAVE_ERROR", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  assert.match(src, /export const ARCHIVED_BLOG_SAVE_ERROR/, "exports constant");
});

test("REF.80 — media DELETE blog guard comes before R2 deletion", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "media", "route.ts"), "utf-8");
  const deleteIdx = src.indexOf("export async function DELETE");
  const blogRefIdx = src.indexOf("blogCoverRef", deleteIdx);
  const r2DeleteIdx = src.indexOf("R2 assets: preserve", deleteIdx);
  assert.ok(blogRefIdx < r2DeleteIdx, "blog guard comes before R2 deletion");
});

/* ═════════════════════════════════════════════════════════════════════════════
   XI. Regressions — existing patterns still work
   ═════════════════════════════════════════════════════════════════════════════ */

test("REG.81 — validateBlogMediaRelation accepts null coverMediaId", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, null, true);
  assert.equal(result.ok, true, "null coverMediaId is valid");
});

test("REG.82 — validateBlogMediaRelation rejects non-existent media", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, "nonexistent-id", true);
  assert.equal(result.ok, false, "non-existent rejected");
  assert.match(result.error, /not found/, "error mentions not found");
});

test("REG.83 — validateBlogMediaRelation rejects archived media", async () => {
  const db = openFullDb();
  const media = insertMedia(db, { deletedAt: "2026-01-01" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, media.id, true);
  assert.equal(result.ok, false, "archived rejected");
  assert.match(result.error, /archived/, "error mentions archived");
});

test("REG.84 — validateBlogMediaRelation rejects wrong category", async () => {
  const db = openFullDb();
  const media = insertMedia(db, { category: "GALLERY" });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, media.id, true);
  assert.equal(result.ok, false, "wrong category rejected");
  assert.match(result.error, /Blog category/, "error mentions Blog category");
});

test("REG.85 — loadBlog still works with full schema", async () => {
  const db = openFullDb();
  const media = insertMedia(db);
  insertBlog(db, { slug: "load-test", coverMediaId: media.id });
  const repo = makeRepo(db);

  const blog = await loadBlog(repo, "load-test");
  assert.ok(blog, "blog is loaded");
  assert.equal(blog.slug, "load-test");
  assert.equal(blog.cover_media_id, media.id);
  assert.equal(blog.version, 1);
  assert.equal(blog.is_visible, 1);
});

test("REG.86 — loadBlog returns null for non-existent slug", async () => {
  const db = openFullDb();
  const repo = makeRepo(db);
  const blog = await loadBlog(repo, "nonexistent");
  assert.equal(blog, null, "returns null");
});

test("REG.87 — ALLOWED_PURPOSES has exactly 4 entries", () => {
  assert.equal(ALLOWED_PURPOSES.size, 4, "4 purposes");
  assert.ok(ALLOWED_PURPOSES.has("gallery"));
  assert.ok(ALLOWED_PURPOSES.has("doctor-photo"));
  assert.ok(ALLOWED_PURPOSES.has("blog-cover"));
  assert.ok(ALLOWED_PURPOSES.has("admin-upload"));
});

test("REG.88 — BLOG is a valid media category", () => {
  assert.ok(MEDIA_CATEGORIES.has("BLOG"), "BLOG is valid");
});

test("REG.89 — blog-admin exports type definitions", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  assert.match(src, /export type BlogRepo/, "exports BlogRepo");
  assert.match(src, /export type BlogQueryFn/, "exports BlogQueryFn");
  assert.match(src, /export type BlogRunFn/, "exports BlogRunFn");
  assert.match(src, /export type BlogAuditFn/, "exports BlogAuditFn");
  assert.match(src, /export type LoadedBlog/, "exports LoadedBlog");
});

test("REG.90 — MediaPickerDialog handles BLOG category with categoryLabel", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "admin", "MediaPickerDialog.tsx"), "utf-8");
  assert.match(src, /categoryLabel/, "accepts categoryLabel prop");
});

test("ID.91 — loadBlogById exists and is exported from blog-admin.ts", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  assert.match(src, /export async function loadBlogById/, "loadBlogById is exported");
});

test("ID.92 — loadBlogById queries by id, not slug", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "lib", "blog-admin.ts"), "utf-8");
  const fnStart = src.indexOf("export async function loadBlogById");
  const fnEnd = src.indexOf("export async function validateBlogMediaRelation");
  const fnBlock = src.substring(fnStart, fnEnd);
  assert.match(fnBlock, /WHERE id = \? LIMIT 1/, "queries by id");
  assert.doesNotMatch(fnBlock, /WHERE slug = \?/, "does not query by slug");
});

test("ID.93 — loadBlogById returns all lifecycle fields", async () => {
  const db = openFullDb();
  const blogId = "blog-id-lifecycle-test";
  insertBlog(db, { id: blogId, slug: "lifecycle-test", status: "APPROVED", lifecycleStatus: "PUBLISHED", version: 3 });
  const repo = makeRepo(db);
  const blog = await loadBlogById(repo, blogId);
  assert.ok(blog, "blog loaded");
  assert.equal(blog.status, "APPROVED", "has status");
  assert.equal(blog.lifecycle_status, "PUBLISHED", "has lifecycle_status");
  assert.equal(blog.version, 3, "has version");
  assert.equal(blog.id, blogId, "has id");
});

test("ID.94 — validateCoverForPublication rejects non-PUBLISHED media", async () => {
  const db = openFullDb();
  const media = insertMedia(db, { lifecycleStatus: "DRAFT", status: "HIDDEN", isVisible: false });
  const repo = makeRepo(db);
  const result = await validateBlogMediaRelation(repo, media.id, true);
  assert.equal(result.ok, false, "DRAFT media rejected");
});

test("ID.95 — applyBlog uses blogId for existing post identity", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "admin", "data", "route.ts"), "utf-8");
  const applyBlogBlock = src.substring(src.indexOf("async function applyBlog"), src.indexOf("async function applyCareer"));
  assert.match(applyBlogBlock, /loadBlogById\(blogRepo, blogId\)/, "uses loadBlogById with blogId");
  assert.match(applyBlogBlock, /existing\.version !== expectedVersion/, "version check against existing");
});

test("GW.96 — gateway blog-cover branch checks status = 'APPROVED'", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const blogCoverIdx = src.indexOf('purpose === "blog-cover"');
  const nextBranch = src.indexOf("} else if", blogCoverIdx + 1);
  const block = src.substring(blogCoverIdx, nextBranch);
  assert.match(block, /status = 'APPROVED'/, "checks status=APPROVED for blog-cover");
});

test("GW.97 — gateway checks deleted_at IS NULL for blog-cover", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const blogCoverIdx = src.indexOf('purpose === "blog-cover"');
  const nextBranch = src.indexOf("} else if", blogCoverIdx + 1);
  const block = src.substring(blogCoverIdx, nextBranch);
  assert.match(block, /deleted_at IS NULL/, "checks deleted_at IS NULL for blog");
});

test("GW.98 — gateway BLOG compatibility path checks status = 'APPROVED'", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "api", "media", "[...key]", "route.ts"), "utf-8");
  const docPhotoIdx = src.indexOf('purpose === "doctor-photo"');
  const blogCheckIdx = src.indexOf('category === "BLOG"', docPhotoIdx);
  const block = src.substring(docPhotoIdx, blogCheckIdx + 800);
  assert.ok(block.includes("status = 'APPROVED'"), "BLOG compatibility path checks status=APPROVED");
});

test("UX.99 — BlogForm editing banner shows version number", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 2000);
  assert.match(block, /Editing blog post.*\(v\{form\.expectedVersion\}\)/s, "shows version in editing banner");
});

test("UX.100 — BlogForm send blogId and coverDirty guard on save", () => {
  const src = fs.readFileSync(path.join(ROOT, "app", "components", "AdminConsole.tsx"), "utf-8");
  const blogFormIdx = src.indexOf("function BlogForm");
  const block = src.substring(blogFormIdx, blogFormIdx + 2000);
  assert.match(block, /if \(isEditing && form\.blogId\)/, "sends blogId only when editing");
  assert.match(block, /if \(isEditing && coverDirty\)/, "sends coverMediaId only when coverDirty");
});
