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
  assertValidTransition,
  CONTENT_LIFECYCLE_STATES,
} from "../app/lib/content/lifecycle.ts";
import {
  ContentVersionConflictError,
  InvalidLifecycleTransitionError,
  ContentMutationFailedError,
} from "../app/lib/content/errors.ts";
import { MutationNotFoundError } from "../app/lib/mutation-result.ts";
import { isContentLifecycleTable } from "../app/lib/content/schema-capabilities.ts";
import {
  getLifecycleColumnReport,
  assertSchemaSupportsLifecycle,
} from "../app/lib/content/schema-capabilities.ts";
import {
  contentCacheTag,
  contentCacheKeyTag,
  isValidCacheKey,
} from "../app/lib/content/cache.ts";
import {
  executeOptimisticContentMutation,
} from "../app/lib/content/optimistic-mutation.ts";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const migrationsDir = path.join(rootDir, "migrations");
const serverTsPath = path.join(rootDir, "app", "lib", "server.ts");

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
    assert.ok(res.errors.some((e) => /drop|DROP/i.test(e)));
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

test("assertValidTransition throws INVALID_TRANSITION on illegal transition", () => {
  assert.throws(() => assertValidTransition("DRAFT", "PUBLISHED"), InvalidLifecycleTransitionError);
  assert.equal(new InvalidLifecycleTransitionError("DRAFT", "PUBLISHED").code, "INVALID_TRANSITION");
});

test("content lifecycle allowlist contains exactly the six canonical tables", () => {
  for (const t of LIFECYCLE_FOUNDATION_TABLES_FOR_TEST) {
    assert.equal(isContentLifecycleTable(t), true);
  }
  assert.equal(isContentLifecycleTable("appointments"), false);
});

// ---------------------------------------------------------------------------
// Cache keys (requirement 10)
// ---------------------------------------------------------------------------

test("cache tags use content:<domain> and content:<domain>:<safe-key>", () => {
  assert.equal(contentCacheTag("blog_posts"), "content:blog_posts");
  assert.equal(contentCacheKeyTag("blog_posts", "b1"), "content:blog_posts:b1");
  assert.equal(isValidCacheKey("b1"), true);
  assert.throws(() => contentCacheKeyTag("blog_posts", "../evil"), /unsafe/);
});

// ---------------------------------------------------------------------------
// PRAGMA schema-capability detection (requirement 11)
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

// ---------------------------------------------------------------------------
// Orchestrator (pure DI)
// ---------------------------------------------------------------------------

const LIFECYCLE_FOUNDATION_TABLES_FOR_TEST = [
  "department_timings",
  "doctor_profiles",
  "blog_posts",
  "career_jobs",
  "patient_videos",
  "media_assets",
];

function applyMigrationOnly(db) {
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
}

// A real-D1-shaped backend bound to an in-memory blog_posts table.
function makeBlogBackend(db) {
  const backend = {
    async loadRow(id) {
      const row = db
        .prepare("SELECT version, lifecycle_status FROM blog_posts WHERE id = ?")
        .get(id);
      if (!row) return null;
      return { version: row.version, lifecycleStatus: row.lifecycle_status };
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

function seedBlog(db, id, version, status) {
  db.exec(
    `INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted, lifecycle_status, version) VALUES ('${id}','${id}','T','e','b','APPROVED',1,0,'${status}',${version})`,
  );
}

test("orchestrator applies on matching expectedVersion and bumps version", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const audits = [];
  const res = await executeOptimisticContentMutation({
    backend,
    domain: "blog_posts",
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

test("orchestrator maps missing/deleted rows to MutationNotFoundError", async () => {
  const db = openMigratedDb();
  const backend = makeBlogBackend(db);

  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "blog_posts",
        id: "ghost",
        expectedVersion: 1,
        targetLifecycle: "HIDDEN",
      }),
    MutationNotFoundError,
  );

  // Logically-deleted (ARCHIVED) rows are reported as missing by the backend.
  seedBlog(db, "del", 1, "ARCHIVED");
  const deletedBackend = {
    async loadRow() {
      return null;
    },
    async applyMutation() {
      return 0;
    },
  };
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend: deletedBackend,
        domain: "blog_posts",
        id: "del",
        expectedVersion: 1,
        targetLifecycle: "DRAFT",
      }),
    MutationNotFoundError,
  );
});

test("orchestrator maps stale expectedVersion to CONFLICT (initial mismatch)", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 3, "PUBLISHED");
  const backend = makeBlogBackend(db);
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "blog_posts",
        id: "b1",
        expectedVersion: 1,
        targetLifecycle: "HIDDEN",
      }),
    ContentVersionConflictError,
  );
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blog_posts",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
    }),
  );
  assert.equal(err.code, "CONFLICT");
  assert.equal(err.expectedVersion, 1);
  assert.equal(err.actualVersion, 3);
  // Row must be untouched on conflict.
  const row = db.prepare("SELECT version, lifecycle_status FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.version, 3);
  assert.equal(row.lifecycle_status, "PUBLISHED");
});

test("orchestrator maps post-zero-change (lost race) to CONFLICT", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  // Backend claims success but reports 0 changes (row vanished/changed).
  const zeroBackend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "PUBLISHED" };
    },
    async applyMutation() {
      return 0;
    },
  };
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend: zeroBackend,
      domain: "blog_posts",
      id: "b1",
      expectedVersion: 1,
      targetLifecycle: "HIDDEN",
    }),
  );
  assert.ok(err instanceof ContentVersionConflictError);
  assert.equal(err.code, "CONFLICT");
});

test("orchestrator throws FAILED at AUDIT stage and never returns APPLIED", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const err = await captureReject(() =>
    executeOptimisticContentMutation({
      backend,
      domain: "blog_posts",
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
      domain: "blog_posts",
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
  assert.deepEqual(invalidated[0], ["content:blog_posts", "content:blog_posts:b1"]);
});

test("orchestrator invalidates content:<domain> and content:<domain>:<key> on success", async () => {
  const db = openMigratedDb();
  seedBlog(db, "b1", 1, "PUBLISHED");
  const backend = makeBlogBackend(db);
  const invalidated = [];
  await executeOptimisticContentMutation({
    backend,
    domain: "blog_posts",
    id: "b1",
    expectedVersion: 1,
    targetLifecycle: "HIDDEN",
    cacheInvalidator: { invalidate: (tags) => invalidated.push(tags) },
  });
  assert.equal(invalidated.length, 1);
  assert.deepEqual(invalidated[0], ["content:blog_posts", "content:blog_posts:b1"]);
});

test("orchestrator rejects invalid lifecycle transition with INVALID_TRANSITION", async () => {
  const backend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "DRAFT" };
    },
    async applyMutation() {
      return 1;
    },
  };
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "blog_posts",
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
      return { version: 1, lifecycleStatus: "PUBLISHED" };
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
    /not a recognised content lifecycle table/,
  );
});

test("orchestrator requires a positive integer expectedVersion", async () => {
  const backend = {
    async loadRow() {
      return { version: 1, lifecycleStatus: "PUBLISHED" };
    },
    async applyMutation() {
      return 1;
    },
  };
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        backend,
        domain: "blog_posts",
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
