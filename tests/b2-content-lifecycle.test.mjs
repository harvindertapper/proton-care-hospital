import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMigrationFiles, LIFECYCLE_FOUNDATION_MIGRATION } from "../scripts/check-migrations.mjs";
import {
  mapLegacyLifecycle,
  canTransition,
  assertValidTransition,
  CONTENT_LIFECYCLE_STATES,
} from "../app/lib/content/lifecycle.ts";
import { ContentVersionConflictError } from "../app/lib/content/errors.ts";
import { isContentLifecycleTable } from "../app/lib/content/schema-capabilities.ts";
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

// Minimal D1-compatible shim over node:sqlite for offline validation.
function makeD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...params) {
          return {
            async first() {
              try {
                return stmt.get(...params);
              } catch {
                return null;
              }
            },
            async run() {
              try {
                const info = stmt.run(...params);
                return { success: true, changes: info?.changes ?? 0 };
              } catch (e) {
                return { success: false, error: String(e) };
              }
            },
          };
        },
      };
    },
  };
}

test("migration 0002 passes the repository validator", () => {
  const result = validateMigrationFiles(migrationsDir, serverTsPath);
  assert.equal(result.valid, true, `Validator errors: ${result.errors.join(", ")}`);
});

test("migration 0002 is additive and non-destructive per the validator", () => {
  const result = validateMigrationFiles(migrationsDir, serverTsPath);
  assert.equal(result.valid, true);
  assert.ok(result.errors.length === 0);
});

test("0000 + 0002 apply cleanly to an isolated in-memory SQLite DB", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));

  for (const table of [
    "department_timings",
    "doctor_profiles",
    "blog_posts",
    "career_jobs",
    "patient_videos",
    "media_assets",
  ]) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    for (const expected of ["lifecycle_status", "version", "deleted_at"]) {
      assert.ok(cols.includes(expected), `${table} missing column ${expected}`);
    }
  }
});

test("legacy backfill maps is_deleted -> ARCHIVED with deleted_at", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(
    "INSERT INTO doctor_profiles (id, slug, name, speciality, department_slug, status, is_visible, is_deleted) VALUES ('d1','dr-a','Dr A','heart','cardiology','APPROVED',1,1)",
  );
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));

  const row = db.prepare("SELECT lifecycle_status, deleted_at FROM doctor_profiles WHERE id='d1'").get();
  assert.equal(row.lifecycle_status, "ARCHIVED");
  assert.ok(row.deleted_at !== null);
});

test("legacy backfill maps NEEDS_REVIEW -> IN_REVIEW", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted) VALUES ('b1','x','Y','e','b','NEEDS_REVIEW',0,0)",
  );
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));

  const row = db.prepare("SELECT lifecycle_status FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.lifecycle_status, "IN_REVIEW");
});

test("legacy backfill maps is_visible=0 -> HIDDEN", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(
    "INSERT INTO department_timings (id, department_slug, department_name, start_time, end_time, status, is_visible) VALUES ('t1','cardiology','Cardiology','09:00','17:00','APPROVED',0)",
  );
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));

  const row = db.prepare("SELECT lifecycle_status FROM department_timings WHERE id='t1'").get();
  assert.equal(row.lifecycle_status, "HIDDEN");
});

test("legacy backfill keeps visible APPROVED rows as PUBLISHED", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(
    "INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, uploaded_by, status, is_visible) VALUES ('m1','key/a.png','a.png','image/png',10,'staff','APPROVED',1)",
  );
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));

  const row = db.prepare("SELECT lifecycle_status FROM media_assets WHERE id='m1'").get();
  assert.equal(row.lifecycle_status, "PUBLISHED");
});

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

test("assertValidTransition throws on illegal transition", () => {
  assert.throws(() => assertValidTransition("DRAFT", "PUBLISHED"), /Invalid content lifecycle transition/);
});

test("content lifecycle allowlist contains exactly the six canonical tables", () => {
  for (const t of [
    "department_timings",
    "doctor_profiles",
    "blog_posts",
    "career_jobs",
    "patient_videos",
    "media_assets",
  ]) {
    assert.equal(isContentLifecycleTable(t), true);
  }
  assert.equal(isContentLifecycleTable("appointments"), false);
});

test("optimistic mutation returns NOT_FOUND for missing record", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
  const d1 = makeD1(db);
  const res = await executeOptimisticContentMutation({
    d1,
    table: "blog_posts",
    id: "missing",
    expectedVersion: 1,
  });
  assert.equal(res.outcome, "NOT_FOUND");
});

test("optimistic mutation bumps version and applies on matching expectedVersion", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
  db.exec(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted, lifecycle_status, version) VALUES ('b1','x','Y','e','b','APPROVED',1,0,'PUBLISHED',1)",
  );
  const d1 = makeD1(db);
  const audits = [];
  const res = await executeOptimisticContentMutation({
    d1,
    table: "blog_posts",
    id: "b1",
    expectedVersion: 1,
    fields: { title: "Z" },
    targetLifecycle: "HIDDEN",
    audit: (e) => audits.push(e),
  });
  assert.equal(res.outcome, "APPLIED");
  assert.equal(res.version, 2);
  assert.equal(res.lifecycleStatus, "HIDDEN");
  const row = db.prepare("SELECT title, version, lifecycle_status FROM blog_posts WHERE id='b1'").get();
  assert.equal(row.title, "Z");
  assert.equal(row.version, 2);
  assert.equal(row.lifecycle_status, "HIDDEN");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, "APPLIED");
});

test("optimistic mutation throws version conflict on stale expectedVersion", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
  db.exec(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted, lifecycle_status, version) VALUES ('b1','x','Y','e','b','APPROVED',1,0,'PUBLISHED',3)",
  );
  const d1 = makeD1(db);
  await assert.rejects(
    () =>
      executeOptimisticContentMutation({
        d1,
        table: "blog_posts",
        id: "b1",
        expectedVersion: 1,
      }),
    ContentVersionConflictError,
  );
});

test("optimistic mutation runs cache invalidator via injected dependency", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration(LIFECYCLE_FOUNDATION_MIGRATION));
  db.exec(
    "INSERT INTO blog_posts (id, slug, title, excerpt, body, status, is_visible, is_deleted, lifecycle_status, version) VALUES ('b1','x','Y','e','b','APPROVED',1,0,'PUBLISHED',1)",
  );
  const d1 = makeD1(db);
  const invalidated = [];
  await executeOptimisticContentMutation({
    d1,
    table: "blog_posts",
    id: "b1",
    expectedVersion: 1,
    cacheInvalidator: { invalidate: (tags) => invalidated.push(tags) },
  });
  assert.equal(invalidated.length, 1);
  assert.deepEqual(invalidated[0].sort(), ["blog_posts", "content:all"]);
});
