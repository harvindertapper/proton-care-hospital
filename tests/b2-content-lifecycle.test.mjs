import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  validateMigrationFiles,
  LIFECYCLE_FOUNDATION_MIGRATION,
} from "../scripts/check-migrations.mjs";
import {
  mapLegacyLifecycle,
  canTransition,
  assertValidLifecycleTransition,
  CONTENT_LIFECYCLE_STATES,
} from "../app/lib/content/lifecycle.ts";
import {
  ContentVersionConflictError,
  InvalidLifecycleTransitionError,
  ContentMutationFailedError,
} from "../app/lib/content/errors.ts";
import { MutationNotFoundError } from "../app/lib/mutation-result.ts";
import {
  isContentLifecycleTable,
  CONTENT_LIFECYCLE_DOMAINS,
  createLifecycleSchemaInspector,
  getLifecycleColumnReport,
  assertSchemaSupportsLifecycle,
} from "../app/lib/content/schema-capabilities.ts";
import {
  contentCacheTag,
  contentCacheKeyTag,
  isValidCacheKey,
  isContentCacheDomain,
} from "../app/lib/content/cache.ts";
import {
  executeOptimisticContentMutation,
} from "../app/lib/content/optimistic-mutation.ts";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const migrationsDir = path.join(rootDir, "migrations");
const serverTsPath = path.join(rootDir, "app", "lib", "server.ts");

const LIFECYCLE_FOUNDATION_TABLES_FOR_TEST = [
  "department_timings",
  "doctor_profiles",
  "blog_posts",
  "career_jobs",
  "patient_videos",
  "media_assets",
];

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
}

function openMigratedDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
  return db;
}

// 0000 + 0001 only: used to seed legacy rows, then apply 0002 to exercise backfill.
function openPreLifecycleDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  return db;
}

// ---------------------------------------------------------------------------
// Migration validator
// ---------------------------------------------------------------------------

test("migration 0002 passes the repository validator", () => {
  const result = validateMigrationFiles(migrationsDir, serverTsPath);
  assert.equal(result.valid, true, `Validator errors: ${result.errors.join(", ")}`);
});

test("validator fails when 0002 is missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-missing-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /0002.*missing/i.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects a 0002 missing one lifecycle ALTER", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      /ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;/,
      "",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("missing additive ALTER") || e.includes("exactly")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects fewer than 18 approved ALTERs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    // Drop the entire media_assets block (3 ALTERs + 1 backfill UPDATE).
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      /-- media_assets[\s\S]*?WHERE lifecycle_status = 'PUBLISHED';/,
      "",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /exactly 18/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects more than 18 approved ALTERs (extra column)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      "ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;",
      "ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;\nALTER TABLE media_assets ADD COLUMN extra_col TEXT;",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /exactly 18/.test(e) || /unexpected column/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects fewer than six approved backfill UPDATEs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      /-- media_assets[\s\S]*?WHERE lifecycle_status = 'PUBLISHED';/,
      "",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /exactly 6/.test(e) || /missing a backfill UPDATE/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects more than six approved backfill UPDATEs (duplicate)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      /UPDATE media_assets[\s\S]*?WHERE lifecycle_status = 'PUBLISHED';/,
      (m) => `${m}\nUPDATE media_assets SET lifecycle_status = CASE WHEN is_visible = 0 THEN 'HIDDEN' ELSE 'PUBLISHED' END WHERE lifecycle_status = 'PUBLISHED';`,
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /exactly 6/.test(e) || /duplicate backfill UPDATE/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects a 0002 that drops a legacy column", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      "ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;",
      "ALTER TABLE media_assets DROP COLUMN file_name;",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e) || /DROP/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized INSERT in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION) + "\nINSERT INTO blog_posts (id) VALUES ('x');";
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized CREATE TABLE in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION) + "\nCREATE TABLE extra (id TEXT);";
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized CREATE INDEX in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION) + "\nCREATE INDEX idx_x ON blog_posts(slug);";
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized REPLACE in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION) + "\nREPLACE INTO blog_posts (id) VALUES ('x');";
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized DELETE in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION) + "\nDELETE FROM blog_posts WHERE id = 'x';";
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized TRUNCATE in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION) + "\nTRUNCATE blog_posts;";
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects an unauthorized RENAME in 0002", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      "ALTER TABLE media_assets ADD COLUMN deleted_at TEXT;",
      "ALTER TABLE media_assets RENAME COLUMN deleted_at TO removed_at;",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /unauthorized/.test(e) || /RENAME/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects a 0002 whose backfill omits the is_deleted branch for doctor_profiles", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      /UPDATE doctor_profiles[\s\S]*?WHERE lifecycle_status = 'PUBLISHED';/,
      "UPDATE doctor_profiles SET lifecycle_status = CASE WHEN upper(status) = 'NEEDS_REVIEW' THEN 'IN_REVIEW' ELSE 'PUBLISHED' END WHERE lifecycle_status = 'PUBLISHED';",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /is_deleted[\s\S]*ARCHIVED/i.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("validator rejects a 0002 whose backfill lacks the PUBLISHED WHERE guard", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b2-neg-"));
  try {
    fs.writeFileSync(path.join(dir, "0000_baseline.sql"), readMigration("0000_baseline.sql"));
    fs.writeFileSync(path.join(dir, "0001_enforce_department_slot_exclusivity.sql"), readMigration("0001_enforce_department_slot_exclusivity.sql"));
    const broken = readMigration(LIFECYCLE_FOUNDATION_MIGRATION).replace(
      "WHERE lifecycle_status = 'PUBLISHED';",
      "WHERE 1=1;",
    );
    fs.writeFileSync(path.join(dir, LIFECYCLE_FOUNDATION_MIGRATION), broken);
    const res = validateMigrationFiles(dir, serverTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => /PUBLISHED/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Cumulative migration 0000 -> 0001 -> 0002
// ---------------------------------------------------------------------------

test("0000 -> 0001 -> 0002 apply cleanly and add all lifecycle columns", () => {
  const db = openMigratedDb();
  for (const table of LIFECYCLE_FOUNDATION_TABLES_FOR_TEST) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    for (const expected of ["lifecycle_status", "version", "deleted_at"]) {
      assert.ok(cols.includes(expected), `${table} missing column ${expected}`);
    }
  }
  // 0001 index still present.
  const idx = db.prepare("PRAGMA index_list(appointments)").all().map((r) => r.name);
  assert.ok(idx.includes("idx_appointments_department_slot"));
});

test("legacy backfill maps is_deleted -> ARCHIVED with deleted_at", () => {
  const db = openPreLifecycleDb();
  db.exec(
    "INSERT INTO doctor_profiles (id, slug, name, speciality, department_slug, status, is_visible, is_deleted) VALUES ('d1','dr-a','Dr A','heart','cardiology','APPROVED',1,1)",
  );
  applyMigrationOnly(db);
  const row = db.prepare("SELECT lifecycle_status, deleted_at FROM doctor_profiles WHERE id='d1'").get();
  assert.equal(row.lifecycle_status, "ARCHIVED");
  assert.ok(row.deleted_at !== null);
});

test("legacy backfill maps NEEDS_REVIEW -> IN_REVIEW", () => {
  const db = openPreLifecycleDb();
  db.exec(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted) VALUES ('b1','x','Y','e','b','NEEDS_REVIEW',0,0)",
  );
  applyMigrationOnly(db);
  const row = db.prepare("SELECT lifecycle_status FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.lifecycle_status, "IN_REVIEW");
});

test("legacy backfill maps is_visible=0 -> HIDDEN", () => {
  const db = openPreLifecycleDb();
  db.exec(
    "INSERT INTO department_timings (id, department_slug, department_name, start_time, end_time, status, is_visible) VALUES ('t1','cardiology','Cardiology','09:00','17:00','APPROVED',0)",
  );
  applyMigrationOnly(db);
  const row = db.prepare("SELECT lifecycle_status FROM department_timings WHERE id='t1'").get();
  assert.equal(row.lifecycle_status, "HIDDEN");
});

test("legacy backfill keeps visible APPROVED rows as PUBLISHED", () => {
  const db = openPreLifecycleDb();
  db.exec(
    "INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, uploaded_by, status, is_visible) VALUES ('m1','key/a.png','a.png','image/png',10,'staff','APPROVED',1)",
  );
  applyMigrationOnly(db);
  const row = db.prepare("SELECT lifecycle_status FROM media_assets WHERE id='m1'").get();
  assert.equal(row.lifecycle_status, "PUBLISHED");
});

// ---------------------------------------------------------------------------
// Lifecycle model
// ---------------------------------------------------------------------------

test("mapLegacyLifecycle precedence matches migration backfill", () => {
  assert.deepEqual(mapLegacyLifecycle({ isDeleted: 1 }), {
    lifecycleStatus: "ARCHIVED",
    deletedAt: null,
  });
  assert.equal(mapLegacyLifecycle({ status: "NEEDS_REVIEW" }).lifecycleStatus, "IN_REVIEW");
  assert.equal(mapLegacyLifecycle({ isVisible: 0 }).lifecycleStatus, "HIDDEN");
  assert.equal(mapLegacyLifecycle({ status: "HIDDEN" }).lifecycleStatus, "HIDDEN");
  assert.equal(mapLegacyLifecycle({ status: "APPROVED", isVisible: 1 }).lifecycleStatus, "PUBLISHED");
});

test("allowed lifecycle transitions match spec", () => {
  assert.equal(canTransition("DRAFT", "IN_REVIEW"), true);
  assert.equal(canTransition("DRAFT", "PUBLISHED"), false);
  assert.equal(canTransition("IN_REVIEW", "PUBLISHED"), true);
  assert.equal(canTransition("PUBLISHED", "HIDDEN"), true);
  assert.equal(canTransition("HIDDEN", "PUBLISHED"), true);
  assert.equal(canTransition("ARCHIVED", "DRAFT"), true);
  assert.equal(canTransition("PUBLISHED", "ARCHIVED"), true);
  assert.equal(canTransition("ARCHIVED", "PUBLISHED"), false);
  for (const s of CONTENT_LIFECYCLE_STATES) {
    assert.equal(canTransition(s, s), false);
  }
});

test("assertValidLifecycleTransition throws INVALID_TRANSITION on illegal transition", () => {
  assert.throws(() => assertValidLifecycleTransition("DRAFT", "PUBLISHED"), InvalidLifecycleTransitionError);
  assert.equal(new InvalidLifecycleTransitionError("DRAFT", "PUBLISHED").code, "INVALID_TRANSITION");
});

test("content lifecycle allowlist contains exactly the six canonical tables", () => {
  for (const t of LIFECYCLE_FOUNDATION_TABLES_FOR_TEST) {
    assert.equal(isContentLifecycleTable(t), true);
  }
  assert.equal(isContentLifecycleTable("appointments"), false);
});

// ---------------------------------------------------------------------------
// Cache keys (requirement 3 + 4)
// ---------------------------------------------------------------------------

test("cache tags use canonical domains (doctors/department-timings/blogs/careers/videos/media)", () => {
  assert.equal(contentCacheTag("blogs"), "content:blogs");
  assert.equal(contentCacheKeyTag("blogs", "b1"), "content:blogs:b1");
  assert.equal(contentCacheTag("doctors"), "content:doctors");
  assert.equal(contentCacheTag("department-timings"), "content:department-timings");
  assert.equal(contentCacheTag("careers"), "content:careers");
  assert.equal(contentCacheTag("videos"), "content:videos");
  assert.equal(contentCacheTag("media"), "content:media");
});

test("cache domain validation rejects unknown domains", () => {
  assert.equal(isContentCacheDomain("blogs"), true);
  assert.equal(isContentCacheDomain("blog_posts"), false);
  assert.equal(isContentCacheDomain("appointments"), false);
  assert.throws(() => contentCacheTag("blog_posts"), /Unknown content cache domain/);
  assert.throws(() => contentCacheKeyTag("blog_posts", "b1"), /Unknown content cache domain/);
});

test("safe keys reject colon, dot, slash, backslash, whitespace, and control chars", () => {
  assert.equal(isValidCacheKey("b1"), true);
  assert.equal(isValidCacheKey("a-b_c1"), true);
  assert.equal(isValidCacheKey("a:b"), false);
  assert.equal(isValidCacheKey("a.b"), false);
  assert.equal(isValidCacheKey("a/b"), false);
  assert.equal(isValidCacheKey("a\\b"), false);
  assert.equal(isValidCacheKey("a b"), false);
  assert.equal(isValidCacheKey("a\tb"), false);
  assert.equal(isValidCacheKey("a\nb"), false);
  assert.throws(() => contentCacheKeyTag("blogs", "a/b"), /unsafe/);
  assert.throws(() => contentCacheKeyTag("blogs", "a.b"), /unsafe/);
});

test("domain-to-table mapping is bijective across the six canonical tables", () => {
  assert.deepEqual(
    [...CONTENT_LIFECYCLE_DOMAINS].sort(),
    ["blogs", "careers", "department-timings", "doctors", "media", "videos"].sort(),
  );
  for (const t of LIFECYCLE_FOUNDATION_TABLES_FOR_TEST) {
    assert.equal(isContentLifecycleTable(t), true);
  }
});

// ---------------------------------------------------------------------------
// PRAGMA schema-capability detection (requirement 6 + 11)
// ---------------------------------------------------------------------------

test("PRAGMA-based detection reports lifecycle support correctly", () => {
  const supported = [
    { name: "id" },
    { name: "lifecycle_status", dflt_value: "'PUBLISHED'" },
    { name: "version", type: "INTEGER CHECK (version >= 1)" },
    { name: "deleted_at" },
  ];
  const report = getLifecycleColumnReport(supported);
  assert.equal(report.hasLifecycleStatus, true);
  assert.equal(report.hasVersion, true);
  assert.equal(report.hasDeletedAt, true);
  assert.equal(report.versionCheckEnforced, true);
  assert.equal(report.lifecycleStatusDefault, "'PUBLISHED'");

  const partial = [{ name: "id" }, { name: "lifecycle_status" }];
  assert.throws(() => assertSchemaSupportsLifecycle(partial, "blog_posts"), /missing/i);
  assert.ok(assertSchemaSupportsLifecycle(supported, "blog_posts") === undefined);
});

test("real PRAGMA table_info from migrated DB passes schema capability", () => {
  const db = openMigratedDb();
  for (const table of LIFECYCLE_FOUNDATION_TABLES_FOR_TEST) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    assert.doesNotThrow(() => assertSchemaSupportsLifecycle(rows, table));
  }
});

test("injected, allowlist-first PRAGMA inspector rejects non-allowlisted tables", () => {
  const inspector = createLifecycleSchemaInspector();
  assert.equal(inspector.isAllowedTable("blog_posts"), true);
  assert.equal(inspector.isAllowedTable("appointments"), false);
  const rows = [
    { name: "id" },
    { name: "lifecycle_status", dflt_value: "'PUBLISHED'" },
    { name: "version", type: "INTEGER CHECK (version >= 1)" },
    { name: "deleted_at" },
  ];
  assert.doesNotThrow(() => inspector.inspect(rows, "blog_posts"));
  assert.throws(() => inspector.inspect(rows, "appointments"), /not in the content lifecycle allowlist/);
  // Custom allowlist is honored.
  const scoped = createLifecycleSchemaInspector(["blog_posts"]);
  assert.throws(() => scoped.inspect(rows, "doctor_profiles"), /not in the content lifecycle allowlist/);
});

// ---------------------------------------------------------------------------
// Orchestrator (pure DI)
// ---------------------------------------------------------------------------

function applyMigrationOnly(db) {
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
}

// A real-D1-shaped backend bound to an in-memory blog_posts table. The snapshot
// now carries deletedAt so the orchestrator can enforce null/deleted checks.
function makeBlogBackend(db) {
  const backend = {
    async loadRow(id) {
      const row = db
        .prepare("SELECT version, lifecycle_status, deleted_at FROM blog_posts WHERE id = ?")
        .get(id);
      if (!row) return null;
      return { version: row.version, lifecycleStatus: row.lifecycle_status, deletedAt: row.deleted_at };
    },
    async applyMutation({ id, expectedVersion, targetLifecycle, newVersion }) {
      const info = db
        .prepare(
          "UPDATE blog_posts SET lifecycle_status = ?, version = ? WHERE id = ? AND version = ?",
        )
        .run(targetLifecycle, newVersion, id, expectedVersion);
      return info.changes ?? 0;
    },
  };
  return backend;
}

function seedBlog(db, id, version, status, deletedAt = null) {
  db.exec(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted, lifecycle_status, version, deleted_at) VALUES ('${id}','${id}','T','e','b','APPROVED',1,0,'${status}',${version},${deletedAt === null ? "NULL" : `'${deletedAt}'`})`,
  );
}

test("orchestrator applies on matching expectedVersion and bumps version", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const audits = [];
  const res = await executeOptimisticContentMutation({
    backend,
    domain: "blogs",
    id: "b1",
    expectedVersion: 1,
    targetLifecycle: "HIDDEN",
    audit: { record: (e) => audits.push(e) },
  });
  assert.equal(res.outcome, "APPLIED");
  assert.equal(res.appliedVersion, 2);
  assert.equal(res.lifecycleStatus, "HIDDEN");
  const row = db.prepare("SELECT version, lifecycle_status FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.version, 2);
  assert.equal(row.lifecycle_status, "HIDDEN");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, "APPLIED");
  assert.equal(audits[0].appliedVersion, 2);
});

test("orchestrator maps missing rows to MutationNotFoundError", async () => {
  const db = openMigratedDb();
  const backend = makeBlogBackend(db);
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "ghost",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
    }),
  );
  assert.ok(err instanceof MutationNotFoundError);
  // No record id / domain / table must leak into the message.
  assert.ok(!/ghost/.test(err.message));
  assert.ok(!/blogs/.test(err.message));
  assert.ok(!/blog_posts/.test(err.message));
});

test("orchestrator maps deleted (ARCHIVED + deleted_at) rows to MutationNotFoundError", async () => {
  const db = openMigratedDb();
  seedBlog(db, "del", 1, "ARCHIVED", "2026-01-01T00:00:00Z");
  const backend = makeBlogBackend(db);
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "del",
      expectedVersion: 1,
      targetLifecycle: "DRAFT",
    }),
  );
  assert.ok(err instanceof MutationNotFoundError);
  assert.ok(!/del/.test(err.message));
});

test("orchestrator maps deleted (null deletedAt but ARCHIVED) rows to MutationNotFoundError", async () => {
  const backend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "ARCHIVED", deletedAt: null };
    },
    async applyMutation() {
      return 0;
    },
  };
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "del",
      expectedVersion: 1,
      targetLifecycle: "DRAFT",
    }),
  );
  assert.ok(err instanceof MutationNotFoundError);
});

test("orchestrator maps stale expectedVersion to CONFLICT (initial mismatch)", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 3, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
    }),
  );
  assert.ok(err instanceof ContentVersionConflictError);
  assert.equal(err.code, "CONFLICT");
  assert.equal(err.expectedVersion, 1);
  assert.equal(err.actualVersion, 3);
  assert.ok(!/b1/.test(err.message));
  // Row must be untouched on conflict.
  const row = db.prepare("SELECT version, lifecycle_status FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.version, 3);
  assert.equal(row.lifecycle_status, "PUBLISHED");
});

test("orchestrator reloads after zero affected rows: missing row => NOT_FOUND", async () => {
  // Backend applies but reports 0 changes because the row was removed.
  const backend = {
    async loadRow() {
      return null;
    },
    async applyMutation() {
      return 0;
    },
  };
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
    }),
  );
  assert.ok(err instanceof MutationNotFoundError);
});

test("orchestrator reloads after zero affected rows: deleted row => NOT_FOUND", async () => {
  const backend = {
    async loadRow() {
      return { version: 2, lifecycleStatus: "ARCHIVED", deletedAt: "2026-01-01T00:00:00Z" };
    },
    async applyMutation() {
      return 0;
    },
  };
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "DRAFT",
    }),
  );
  assert.ok(err instanceof MutationNotFoundError);
});

test("orchestrator reloads after zero affected rows: surviving newer row => CONFLICT with reloaded version", async () => {
  const backend = {
    async loadRow() {
      // Surviving row now at version 5 (someone else won the race).
      return { version: 5, lifecycleStatus: "PUBLISHED", deletedAt: null };
    },
    async applyMutation() {
      return 0;
    },
  };
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
    }),
  );
  assert.ok(err instanceof ContentVersionConflictError);
  assert.equal(err.code, "CONFLICT");
  assert.equal(err.actualVersion, 5);
  assert.ok(!/b1/.test(err.message));
});

test("orchestrator throws FAILED at AUDIT stage and never returns APPLIED", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
      audit: {
        record() {
          throw new Error("audit down");
        },
      },
    }),
  );
  assert.ok(err instanceof ContentMutationFailedError);
  assert.equal(err.code, "FAILED");
  assert.equal(err.stage, "AUDIT");
  assert.equal(err.appliedVersion, 2);
  // Mutation did apply, but because audit failed the result is FAILED, not APPLIED.
  const row = db.prepare("SELECT version FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.version, 2);
});

test("orchestrator throws FAILED at CACHE stage and never returns APPLIED", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const invalidated = [];
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blogs",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
      cacheInvalidator: {
        invalidate(tags) {
          invalidated.push(tags);
          throw new Error("cache down");
        },
      },
    }),
  );
  assert.ok(err instanceof ContentMutationFailedError);
  assert.equal(err.code, "FAILED");
  assert.equal(err.stage, "CACHE");
  assert.equal(err.appliedVersion, 2);
  // Invalidation was attempted before the throw.
  assert.equal(invalidated.length, 1);
  assert.deepEqual(invalidated[0], ["content:blogs", "content:blogs:b1"]);
});

test("orchestrator invalidates content:<domain> and content:<domain>:<key> on success", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const invalidated = [];
  await executeOptimisticContentMutation({
    backend,
    domain: "blogs",
    id: "b1",
    expectedVersion: 1,
    targetLifecycle: "HIDDEN",
    cacheInvalidator: { invalidate: (tags) => invalidated.push(tags) },
  });
  assert.equal(invalidated.length, 1);
  assert.deepEqual(invalidated[0], ["content:blogs", "content:blogs:b1"]);
});

test("orchestrator rejects invalid lifecycle transition with INVALID_TRANSITION", async () => {
  const backend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "DRAFT", deletedAt: null };
    },
    async applyMutation() {
      return 1;
    },
  };
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "blogs",
        id: "b1",
        expectedVersion: 1,
        targetLifecycle: "PUBLISHED",
      }),
    InvalidLifecycleTransitionError,
  );
});

test("orchestrator rejects unknown domain (security)", async () => {
  const backend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "PUBLISHED", deletedAt: null };
    },
    async applyMutation() {
      return 1;
    },
  };
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "appointments",
        id: "b1",
        expectedVersion: 1,
        targetLifecycle: "HIDDEN",
      }),
    /not a recognised content lifecycle domain/,
  );
});

test("orchestrator requires a positive integer expectedVersion", async () => {
  const backend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "PUBLISHED", deletedAt: null };
    },
    async applyMutation() {
      return 1;
    },
  };
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "blogs",
        id: "b1",
        expectedVersion: 0,
        targetLifecycle: "HIDDEN",
      }),
    /expectedVersion must be a positive integer/,
  );
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function captureReject(fn) {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected rejection");
}
