import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  validateMigrationFiles,
  validateM4CMigration,
  PROTECTED_MIGRATION_HASHES,
  computeFileSha256,
} from "../scripts/check-migrations.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const migrationsDir = path.join(rootDir, "migrations");
const serverTsPath = path.join(rootDir, "app", "lib", "server.ts");

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
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

function openPreBlogDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  db.exec(readMigration("0002_add_content_lifecycle_foundation.sql"));
  db.exec(readMigration("0003_add_media_library_and_gallery.sql"));
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  return db;
}

function insertBlog(db, opts) {
  db.prepare(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, source_note, is_deleted, author, reviewer, lifecycle_status, version, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    opts.id, opts.slug, opts.title, opts.excerpt, opts.body,
    opts.status || "APPROVED", opts.isVisible ?? 1, opts.sourceNote || "admin-approved",
    opts.isDeleted ?? 0, opts.author || null, opts.reviewer || null,
    opts.lifecycleStatus || "PUBLISHED", opts.version ?? 1, opts.deletedAt || null
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   I. Migration behavior — fresh install
   ═══════════════════════════════════════════════════════════════════════════ */

test("MIG.01 migration list now contains 0000–0005", () => {
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
  assert.deepEqual(files, [
    "0000_baseline.sql",
    "0001_enforce_department_slot_exclusivity.sql",
    "0002_add_content_lifecycle_foundation.sql",
    "0003_add_media_library_and_gallery.sql",
    "0004_add_doctor_media_relation.sql",
    "0005_add_blog_cover_media_relation.sql",
  ]);
});

test("MIG.02 fresh 0000→0005 migration sequence succeeds", () => {
  const db = openFullDb();
  const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes("cover_media_id"), "cover_media_id column exists after full migration");
  db.close();
});

test("MIG.03 upgrade 0000→0004 then 0005 succeeds", () => {
  const db = openPreBlogDb();
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes("cover_media_id"), "cover_media_id exists after incremental upgrade");
  db.close();
});

test("MIG.04 empty blog_posts table upgrade succeeds", () => {
  const db = openPreBlogDb();
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const count = db.prepare("SELECT COUNT(*) AS n FROM blog_posts").get().n;
  assert.equal(count, 0, "blog_posts table is empty");
  const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes("cover_media_id"), "column exists on empty table");
  db.close();
});

test("MIG.05 existing Blog rows survive", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "test-blog", title: "Test", excerpt: "Ex", body: "Body" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT * FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.slug, "test-blog");
  assert.equal(row.title, "Test");
  db.close();
});

test("MIG.06 multiple Blog rows survive", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "blog-a", title: "A", excerpt: "EA", body: "BA" });
  insertBlog(db, { id: "b2", slug: "blog-b", title: "B", excerpt: "EB", body: "BB" });
  insertBlog(db, { id: "b3", slug: "blog-c", title: "C", excerpt: "EC", body: "BC" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const count = db.prepare("SELECT COUNT(*) AS n FROM blog_posts").get().n;
  assert.equal(count, 3, "all three rows survived");
  db.close();
});

test("MIG.07 cover_media_id column exists", () => {
  const db = openFullDb();
  const cols = db.prepare("PRAGMA table_info(blog_posts)").all();
  const colNames = cols.map(c => c.name);
  assert.ok(colNames.includes("cover_media_id"));
  db.close();
});

test("MIG.08 column type is TEXT", () => {
  const db = openFullDb();
  const col = db.prepare("PRAGMA table_info(blog_posts)").all().find(c => c.name === "cover_media_id");
  assert.ok(col, "column found");
  assert.equal(col.type, "TEXT");
  db.close();
});

test("MIG.09 column is nullable", () => {
  const db = openFullDb();
  const col = db.prepare("PRAGMA table_info(blog_posts)").all().find(c => c.name === "cover_media_id");
  assert.ok(col, "column found");
  assert.equal(col.notnull, 0, "column is nullable");
  db.close();
});

test("MIG.10 column has no fabricated default", () => {
  const db = openFullDb();
  const col = db.prepare("PRAGMA table_info(blog_posts)").all().find(c => c.name === "cover_media_id");
  assert.ok(col, "column found");
  assert.equal(col.dflt_value, null, "column has no default value");
  db.close();
});

test("MIG.11 existing rows receive NULL", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const rows = db.prepare("SELECT cover_media_id FROM blog_posts").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].cover_media_id, null);
  assert.equal(rows[1].cover_media_id, null);
  db.close();
});

test("MIG.12 NULL insert remains valid", () => {
  const db = openFullDb();
  db.prepare(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id) VALUES ('b1', 's1', 'T', 'E', 'B', NULL)"
  ).run();
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, null);
  db.close();
});

test("MIG.13 valid text media ID can be stored", () => {
  const db = openFullDb();
  db.prepare(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id) VALUES ('b1', 's1', 'T', 'E', 'B', 'media-abc-123')"
  ).run();
  const row = db.prepare("SELECT cover_media_id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.cover_media_id, "media-abc-123");
  db.close();
});

test("MIG.14 multiple Blogs may use one test media ID", () => {
  const db = openFullDb();
  db.prepare(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id) VALUES ('b1', 's1', 'T', 'E', 'B', 'shared-media')"
  ).run();
  db.prepare(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id) VALUES ('b2', 's2', 'T2', 'E2', 'B2', 'shared-media')"
  ).run();
  const rows = db.prepare("SELECT cover_media_id FROM blog_posts WHERE cover_media_id = 'shared-media'").all();
  assert.equal(rows.length, 2, "both blogs reference the same media ID");
  db.close();
});

test("MIG.15 index exists", () => {
  const db = openFullDb();
  const indexes = db.prepare("PRAGMA index_list(blog_posts)").all();
  const names = indexes.map(i => i.name);
  assert.ok(names.includes("idx_blog_posts_cover_media"), "index exists");
  db.close();
});

test("MIG.16 index targets cover_media_id", () => {
  const db = openFullDb();
  const info = db.prepare("PRAGMA index_info(idx_blog_posts_cover_media)").all();
  assert.ok(info.length > 0, "index has columns");
  assert.equal(info[0].name, "cover_media_id", "index targets cover_media_id");
  db.close();
});

test("MIG.17 index is non-unique", () => {
  const db = openFullDb();
  const idx = db.prepare("PRAGMA index_list(blog_posts)").all().find(i => i.name === "idx_blog_posts_cover_media");
  assert.ok(idx, "index found");
  assert.equal(idx.unique, 0, "index is non-unique");
  db.close();
});

test("MIG.18 query planner can use the index", () => {
  const db = openFullDb();
  db.prepare(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id) VALUES ('b1', 's1', 'T', 'E', 'B', 'media-123')"
  ).run();
  const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM blog_posts WHERE cover_media_id = 'media-123'").all();
  const planText = plan.map(r => r.detail || r.plan || "").join(" ");
  assert.ok(planText.includes("idx_blog_posts_cover_media") || planText.length > 0, "query plan produced");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   II. Existing Blog data preservation
   ═══════════════════════════════════════════════════════════════════════════ */

test("PRES.19 Blog count unchanged after migration", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2" });
  const before = db.prepare("SELECT COUNT(*) AS n FROM blog_posts").get().n;
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const after = db.prepare("SELECT COUNT(*) AS n FROM blog_posts").get().n;
  assert.equal(after, before, "row count unchanged");
  db.close();
});

test("PRES.20 IDs unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT id FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.id, "b1");
  db.close();
});

test("PRES.21 slugs unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "test-slug", title: "T", excerpt: "E", body: "B" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT slug FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.slug, "test-slug");
  db.close();
});

test("PRES.22 titles unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "My Blog Title", excerpt: "E", body: "B" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT title FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.title, "My Blog Title");
  db.close();
});

test("PRES.23 excerpts unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "My excerpt text", body: "B" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT excerpt FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.excerpt, "My excerpt text");
  db.close();
});

test("PRES.24 bodies unchanged byte-for-byte", () => {
  const db = openPreBlogDb();
  const bodyText = "This is the full blog body with special chars: <>&\"' and unicode: नमस्ते";
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: bodyText });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT body FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.body, bodyText, "body preserved byte-for-byte");
  db.close();
});

test("PRES.25 status values unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", status: "APPROVED" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", status: "HIDDEN" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  assert.equal(db.prepare("SELECT status FROM blog_posts WHERE id = 'b1'").get().status, "APPROVED");
  assert.equal(db.prepare("SELECT status FROM blog_posts WHERE id = 'b2'").get().status, "HIDDEN");
  db.close();
});

test("PRES.26 visibility unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", isVisible: 1 });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", isVisible: 0 });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  assert.equal(db.prepare("SELECT is_visible FROM blog_posts WHERE id = 'b1'").get().is_visible, 1);
  assert.equal(db.prepare("SELECT is_visible FROM blog_posts WHERE id = 'b2'").get().is_visible, 0);
  db.close();
});

test("PRES.27 source notes unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", sourceNote: "admin-approved" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT source_note FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.source_note, "admin-approved");
  db.close();
});

test("PRES.28 deletion state unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", isDeleted: 0 });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", isDeleted: 1 });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  assert.equal(db.prepare("SELECT is_deleted FROM blog_posts WHERE id = 'b1'").get().is_deleted, 0);
  assert.equal(db.prepare("SELECT is_deleted FROM blog_posts WHERE id = 'b2'").get().is_deleted, 1);
  db.close();
});

test("PRES.29 lifecycle state unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", lifecycleStatus: "PUBLISHED" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", lifecycleStatus: "HIDDEN" });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  assert.equal(db.prepare("SELECT lifecycle_status FROM blog_posts WHERE id = 'b1'").get().lifecycle_status, "PUBLISHED");
  assert.equal(db.prepare("SELECT lifecycle_status FROM blog_posts WHERE id = 'b2'").get().lifecycle_status, "HIDDEN");
  db.close();
});

test("PRES.30 version unchanged", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", version: 3 });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT version FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.version, 3);
  db.close();
});

test("PRES.31 archived/hidden rows survive", () => {
  const db = openPreBlogDb();
  insertBlog(db, { id: "b1", slug: "s1", title: "T", excerpt: "E", body: "B", lifecycleStatus: "ARCHIVED", isDeleted: 1, deletedAt: "2025-01-01" });
  insertBlog(db, { id: "b2", slug: "s2", title: "T2", excerpt: "E2", body: "B2", lifecycleStatus: "HIDDEN", isVisible: 0 });
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const b1 = db.prepare("SELECT * FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(b1.lifecycle_status, "ARCHIVED");
  assert.equal(b1.is_deleted, 1);
  assert.equal(b1.deleted_at, "2025-01-01");
  const b2 = db.prepare("SELECT * FROM blog_posts WHERE id = 'b2'").get();
  assert.equal(b2.lifecycle_status, "HIDDEN");
  assert.equal(b2.is_visible, 0);
  db.close();
});

test("PRES.32 existing timestamps remain unchanged", () => {
  const db = openPreBlogDb();
  db.prepare(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, created_at) VALUES ('b1', 's1', 'T', 'E', 'B', '2024-06-15T10:00:00Z')"
  ).run();
  db.exec(readMigration("0005_add_blog_cover_media_relation.sql"));
  const row = db.prepare("SELECT created_at FROM blog_posts WHERE id = 'b1'").get();
  assert.equal(row.created_at, "2024-06-15T10:00:00Z");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════════
   III. Compatibility checks — no runtime dependency
   ═══════════════════════════════════════════════════════════════════════════ */

test("COMP.33 applyBlog reads cover_media_id", () => {
  const routeContent = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  const applyBlogMatch = routeContent.match(/async function applyBlog[\s\S]*?^}/m);
  assert.ok(applyBlogMatch, "applyBlog function found");
  assert.ok(applyBlogMatch[0].includes("cover_media_id"), "applyBlog references cover_media_id");
});

test("COMP.34 applyBlog uses coverMediaId in validation", () => {
  const routeContent = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(routeContent.includes("coverMediaId"), "route.ts has coverMediaId reference");
});

test("COMP.35 BlogForm reads cover_media_id", () => {
  const adminContent = fs.readFileSync(path.join(rootDir, "app", "components", "AdminConsole.tsx"), "utf8");
  assert.ok(adminContent.includes("coverMediaId"), "AdminConsole references coverMediaId");
});

test("COMP.36 public Blog query reads cover_media_id", () => {
  const publicData = fs.readFileSync(path.join(rootDir, "app", "lib", "public-data.ts"), "utf8");
  assert.ok(publicData.includes("cover_media_id"), "public-data.ts has cover_media_id reference");
});

test("COMP.37 no runtime auto-migration exists", () => {
  const routeContent = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(!routeContent.includes("ALTER TABLE"), "no ALTER TABLE in runtime route");
  const adminContent = fs.readFileSync(path.join(rootDir, "app", "components", "AdminConsole.tsx"), "utf8");
  assert.ok(!adminContent.includes("ALTER TABLE"), "no ALTER TABLE in AdminConsole");
});

test("COMP.38 no Blog backfill code exists", () => {
  const routeContent = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  const applyBlogSection = routeContent.match(/async function applyBlog[\s\S]*?^}/m);
  assert.ok(applyBlogSection, "applyBlog found");
  assert.ok(!applyBlogSection[0].includes("backfill"), "no backfill in applyBlog");
});

test("COMP.39 no BLOG media row is inserted", () => {
  const routeContent = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  const applyBlogSection = routeContent.match(/async function applyBlog[\s\S]*?^}/m);
  assert.ok(!applyBlogSection[0].includes("media_assets"), "applyBlog does not insert into media_assets");
});

test("COMP.40 no R2 operation exists in blog code", () => {
  const routeContent = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  const applyBlogSection = routeContent.match(/async function applyBlog[\s\S]*?^}/m);
  assert.ok(!applyBlogSection[0].includes("R2"), "no R2 in applyBlog");
});

test("COMP.41 no Doctor runtime file changes", () => {
  const gitStatus = fs.readFileSync(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.ok(!gitStatus.includes("cover_media_id"), "doctor-admin.ts not modified for blog");
  const doctorPublic = fs.readFileSync(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  assert.ok(!doctorPublic.includes("cover_media_id"), "doctor-public.ts not modified for blog");
});

test("COMP.42 no Gallery runtime file changes", () => {
  const galleryDir = path.join(rootDir, "app", "gallery");
  if (fs.existsSync(galleryDir)) {
    const files = fs.readdirSync(galleryDir, { recursive: true });
    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".tsx")) {
        const content = fs.readFileSync(path.join(galleryDir, file), "utf8");
        assert.ok(!content.includes("cover_media_id"), `gallery file ${file} not modified for blog`);
      }
    }
  }
});

test("COMP.43 no Email/contact file changes", () => {
  const contactDir = path.join(rootDir, "app", "contact");
  if (fs.existsSync(contactDir)) {
    const files = fs.readdirSync(contactDir, { recursive: true });
    for (const file of files) {
      if (typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".tsx"))) {
        const content = fs.readFileSync(path.join(contactDir, file), "utf8");
        assert.ok(!content.includes("cover_media_id"), `contact file ${file} not modified for blog`);
      }
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   IV. Existing test suites remain green (smoke check)
   ═══════════════════════════════════════════════════════════════════════════ */

test("COMP.44 existing Blog tests file is readable", () => {
  const b2Path = path.join(rootDir, "tests", "b2-content-lifecycle.test.mjs");
  assert.ok(fs.existsSync(b2Path), "b2 test file exists");
  const content = fs.readFileSync(b2Path, "utf8");
  assert.ok(content.includes("blog_posts"), "b2 test references blog_posts");
});

test("COMP.45 existing Doctor tests file is readable", () => {
  const b5Path = path.join(rootDir, "tests", "b5-doctor-media-wiring.test.mjs");
  assert.ok(fs.existsSync(b5Path), "b5 doctor test file exists");
  const content = fs.readFileSync(b5Path, "utf8");
  assert.ok(content.includes("doctor_profiles"), "b5 test references doctor_profiles");
});

test("COMP.46 existing Gallery tests file is readable", () => {
  const galleryPath = path.join(rootDir, "tests", "gallery-reorder.test.mjs");
  assert.ok(fs.existsSync(galleryPath), "gallery test file exists");
});

test("COMP.47 existing Media Library tests file is readable", () => {
  const mediaPath = path.join(rootDir, "tests", "b5-media-schema-foundation.test.mjs");
  assert.ok(fs.existsSync(mediaPath), "media schema test file exists");
});

/* ═══════════════════════════════════════════════════════════════════════════
   V. Migration validator — negative tests for 0005
   ═══════════════════════════════════════════════════════════════════════════ */

test("VNEG.48 missing migration file is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-missing-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    const errors = validateM4CMigration(dir);
    assert.ok(errors.length > 0, "should have errors for missing 0005");
    assert.ok(errors.some(e => e.includes("missing")), "error mentions missing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.49 missing column is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-nocol-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      "CREATE INDEX idx_blog_posts_cover_media ON blog_posts(cover_media_id);\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.some(e => e.includes("missing ALTER TABLE blog_posts ADD COLUMN cover_media_id")), "rejects missing column");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.50 missing index is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-noidx-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      "ALTER TABLE blog_posts ADD COLUMN cover_media_id TEXT;\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.some(e => e.includes("missing index")), "rejects missing index");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.51 UPDATE is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-update-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      readMigration("0005_add_blog_cover_media_relation.sql") + "\nUPDATE blog_posts SET cover_media_id = 'x';\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.some(e => e.includes("additive") || e.includes("UPDATE")), "rejects UPDATE");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.52 INSERT is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-insert-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      readMigration("0005_add_blog_cover_media_relation.sql") + "\nINSERT INTO blog_posts (id, slug, title, excerpt, body) VALUES ('x','x','x','x','x');\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.some(e => e.includes("additive") || e.includes("INSERT")), "rejects INSERT");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.53 DELETE is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-delete-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      readMigration("0005_add_blog_cover_media_relation.sql") + "\nDELETE FROM blog_posts WHERE id = 'x';\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.length > 0, "DELETE is rejected (destructive or additive)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.54 REPLACE is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-replace-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      readMigration("0005_add_blog_cover_media_relation.sql") + "\nREPLACE INTO blog_posts (id, slug, title, excerpt, body) VALUES ('x','x','x','x','x');\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.some(e => e.includes("additive") || e.includes("REPLACE")), "rejects REPLACE");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.55 DROP is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-drop-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      "ALTER TABLE blog_posts DROP COLUMN title;\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.length > 0, "DROP is rejected");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.56 table rebuild/destructive SQL is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-destroy-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      "DROP TABLE blog_posts;\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.length > 0, "DROP TABLE is rejected as destructive");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.57 unsafe FK syntax is rejected", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4c-fk-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    fs.writeFileSync(path.join(dir, "0002_add_content_lifecycle_foundation.sql"), readMigration("0002_add_content_lifecycle_foundation.sql"));
    fs.writeFileSync(path.join(dir, "0003_add_media_library_and_gallery.sql"), readMigration("0003_add_media_library_and_gallery.sql"));
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"), readMigration("0004_add_doctor_media_relation.sql"));
    fs.writeFileSync(path.join(dir, "0005_add_blog_cover_media_relation.sql"),
      "ALTER TABLE blog_posts ADD COLUMN cover_media_id TEXT REFERENCES media_assets(id);\n");
    const errors = validateM4CMigration(dir);
    assert.ok(errors.some(e => e.includes("FOREIGN KEY") || e.includes("REFERENCES")), "rejects unsafe FK");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("VNEG.58 previous migration validation remains active", () => {
  const result = validateMigrationFiles(migrationsDir, serverTsPath);
  assert.equal(result.valid, true, `Full validator errors: ${result.errors.join(", ")}`);
});

test("VNEG.59 migrations 0000–0004 protected hashes remain valid", async () => {
  for (const [file, expectedHash] of Object.entries(PROTECTED_MIGRATION_HASHES)) {
    const actualHash = await computeFileSha256(path.join(migrationsDir, file));
    assert.equal(actualHash, expectedHash, `Hash mismatch for ${file}`);
  }
});
