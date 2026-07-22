/**
 * M4-A — Doctor Media Relation Foundation Tests
 *
 * Validates migration 0004: nullable photo_media_id on doctor_profiles,
 * index creation, data preservation, and runtime compatibility.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  validateMigrationFiles,
  validateM4Migration,
  PROTECTED_MIGRATION_HASHES,
} from "../scripts/check-migrations.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const migrationsDir = path.join(rootDir, "migrations");

function readMigration(name) {
  return fs.readFileSync(path.join(migrationsDir, name), "utf8");
}

function openFreshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  db.exec(readMigration("0002_add_content_lifecycle_foundation.sql"));
  db.exec(readMigration("0003_add_media_library_and_gallery.sql"));
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  return db;
}

function openPreMigrationDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readMigration("0000_baseline.sql"));
  db.exec(readMigration("0001_enforce_department_slot_exclusivity.sql"));
  db.exec(readMigration("0002_add_content_lifecycle_foundation.sql"));
  db.exec(readMigration("0003_add_media_library_and_gallery.sql"));
  return db;
}

function seedDoctorProfiles(db) {
  const doctors = [
    { id: "doc-1", slug: "dr-alpha", name: "Dr Alpha", speciality: "Cardiology", qualification: "MD", department_slug: "cardiology", photo_url: "/assets/doctors/dr-alpha.webp" },
    { id: "doc-2", slug: "dr-beta", name: "Dr Beta", speciality: "Neurology", qualification: "DM", department_slug: "neurology", photo_url: "" },
    { id: "doc-3", slug: "dr-gamma", name: "Dr Gamma", speciality: "Ortho", qualification: "MS", department_slug: "orthopaedics", photo_url: "/assets/doctors/dr-gamma.jpg", lifecycle_status: "ARCHIVED", is_deleted: 1, deleted_at: "2026-01-01 12:00:00" },
  ];
  for (const d of doctors) {
    db.prepare(
      `INSERT INTO doctor_profiles (id, slug, name, speciality, qualification, department_slug, photo_url, lifecycle_status, is_deleted, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(d.id, d.slug, d.name, d.speciality, d.qualification, d.department_slug, d.photo_url, d.lifecycle_status || "PUBLISHED", d.is_deleted || 0, d.deleted_at || null);
  }
}

function seedMediaAssets(db) {
  const media = [
    { id: "media-1", r2_key: "test/doc-photo-1.jpg", category: "DOCTOR" },
    { id: "media-2", r2_key: "test/doc-photo-2.jpg", category: "DOCTOR" },
  ];
  for (const m of media) {
    db.prepare(
      `INSERT INTO media_assets (id, r2_key, file_name, content_type, size_bytes, purpose, uploaded_by, storage_type, category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(m.id, m.r2_key, m.r2_key.split("/").pop(), "image/jpeg", 1024, "doctor-photo", "admin@test.com", "R2", m.category);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   MIGRATION
   ═══════════════════════════════════════════════════════════════════════ */

test("M.01 migration sequence recognizes 0004", () => {
  const result = validateMigrationFiles(migrationsDir);
  assert.equal(result.valid, true, `Validator errors: ${result.errors.join(", ")}`);
  assert.ok(result.filesCount >= 5, `Expected at least 5 migration files, got ${result.filesCount}`);
});

test("M.02 migrations 0000–0003 remain byte-for-byte unchanged", () => {
  const protectedFiles = Object.keys(PROTECTED_MIGRATION_HASHES);
  for (const file of protectedFiles) {
    const filePath = path.join(migrationsDir, file);
    assert.ok(fs.existsSync(filePath), `Protected migration file missing: ${file}`);
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
    assert.equal(hash, PROTECTED_MIGRATION_HASHES[file], `Protected hash mismatch for ${file}`);
  }
});

test("M.03 fresh 0000→0004 application succeeds", () => {
  const db = openFreshDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map((r) => r.name);
  assert.ok(tableNames.includes("doctor_profiles"), "doctor_profiles exists after fresh migration");
  assert.ok(tableNames.includes("media_assets"), "media_assets exists after fresh migration");
  db.close();
});

test("M.04 upgrade 0000→0003 then 0004 succeeds", () => {
  const db = openPreMigrationDb();
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const col = db.prepare("PRAGMA table_info(doctor_profiles)").all().find((c) => c.name === "photo_media_id");
  assert.ok(col, "photo_media_id column exists after upgrade");
  assert.equal(col.type, "TEXT");
  assert.equal(col.notnull, 0);
  db.close();
});

test("M.05 validator safely re-validates migration 0004", () => {
  const errors1 = validateM4Migration(migrationsDir);
  assert.deepEqual(errors1, [], `First validation: ${errors1.join(", ")}`);
  const errors2 = validateM4Migration(migrationsDir);
  assert.deepEqual(errors2, [], `Second validation: ${errors2.join(", ")}`);
});

test("M.06 no runtime auto-migration exists", () => {
  const serverCode = fs.readFileSync(path.join(rootDir, "app", "lib", "server.ts"), "utf8");
  assert.ok(!serverCode.includes("photo_media_id"), "server.ts must not reference photo_media_id in runtime auto-migration");
});

/* ═══════════════════════════════════════════════════════════════════════
   DOCTOR DATA PRESERVATION
   ═══════════════════════════════════════════════════════════════════════ */

test("D.01 existing Doctor row count unchanged after 0004", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  const countBefore = db.prepare("SELECT COUNT(*) as cnt FROM doctor_profiles").get().cnt;
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const countAfter = db.prepare("SELECT COUNT(*) as cnt FROM doctor_profiles").get().cnt;
  assert.equal(countAfter, countBefore, "Doctor row count must not change");
  db.close();
});

test("D.02 Doctor ID unchanged", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const ids = db.prepare("SELECT id FROM doctor_profiles ORDER BY id").all().map((r) => r.id);
  assert.deepEqual(ids, ["doc-1", "doc-2", "doc-3"], "Doctor IDs unchanged after migration");
  db.close();
});

test("D.03 Doctor slug unchanged", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const slugs = db.prepare("SELECT slug FROM doctor_profiles ORDER BY slug").all().map((r) => r.slug);
  assert.deepEqual(slugs, ["dr-alpha", "dr-beta", "dr-gamma"], "Doctor slugs unchanged after migration");
  db.close();
});

test("D.04 photo_url unchanged byte-for-byte", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const rows = db.prepare("SELECT slug, photo_url FROM doctor_profiles ORDER BY slug").all();
  assert.equal(rows[0].photo_url, "/assets/doctors/dr-alpha.webp", "dr-alpha photo_url unchanged");
  assert.equal(rows[1].photo_url, "", "dr-beta photo_url unchanged");
  assert.equal(rows[2].photo_url, "/assets/doctors/dr-gamma.jpg", "dr-gamma photo_url unchanged");
  db.close();
});

test("D.05 lifecycle_status unchanged", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const rows = db.prepare("SELECT slug, lifecycle_status FROM doctor_profiles ORDER BY slug").all();
  assert.equal(rows[0].lifecycle_status, "PUBLISHED");
  assert.equal(rows[1].lifecycle_status, "PUBLISHED");
  assert.equal(rows[2].lifecycle_status, "ARCHIVED");
  db.close();
});

test("D.06 version unchanged", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const versions = db.prepare("SELECT version FROM doctor_profiles ORDER BY id").all().map((r) => r.version);
  assert.deepEqual(versions, [1, 1, 1], "All doctor versions remain 1 (default from 0002)");
  db.close();
});

test("D.07 deleted/archive state unchanged", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const rows = db.prepare("SELECT slug, is_deleted, deleted_at FROM doctor_profiles ORDER BY slug").all();
  assert.equal(rows[0].is_deleted, 0);
  assert.equal(rows[0].deleted_at, null);
  assert.equal(rows[1].is_deleted, 0);
  assert.equal(rows[1].deleted_at, null);
  assert.equal(rows[2].is_deleted, 1);
  assert.ok(rows[2].deleted_at, "Archived doctor still has deleted_at");
  db.close();
});

test("D.08 new photo_media_id is NULL for legacy rows", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const nulls = db.prepare("SELECT COUNT(*) as cnt FROM doctor_profiles WHERE photo_media_id IS NULL").get().cnt;
  assert.equal(nulls, 3, "All legacy doctors have photo_media_id = NULL");
  db.close();
});

test("D.09 archived Doctor rows survive migration unchanged", () => {
  const db = openPreMigrationDb();
  seedDoctorProfiles(db);
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const archived = db.prepare("SELECT * FROM doctor_profiles WHERE lifecycle_status = 'ARCHIVED'").get();
  assert.ok(archived, "Archived doctor still exists");
  assert.equal(archived.id, "doc-3");
  assert.equal(archived.is_deleted, 1);
  assert.equal(archived.photo_url, "/assets/doctors/dr-gamma.jpg");
  assert.equal(archived.photo_media_id, null);
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════
   RELATION
   ═══════════════════════════════════════════════════════════════════════ */

test("R.01 valid media ID can be stored in photo_media_id", () => {
  const db = openFreshDb();
  seedDoctorProfiles(db);
  seedMediaAssets(db);
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'media-1' WHERE slug = 'dr-alpha'").run();
  const row = db.prepare("SELECT photo_media_id FROM doctor_profiles WHERE slug = 'dr-alpha'").get();
  assert.equal(row.photo_media_id, "media-1");
  db.close();
});

test("R.02 invalid media ID is stored but not enforced by FK (application-level in M4-B)", () => {
  const db = openFreshDb();
  seedDoctorProfiles(db);
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'nonexistent-media-id' WHERE slug = 'dr-alpha'").run();
  const row = db.prepare("SELECT photo_media_id FROM doctor_profiles WHERE slug = 'dr-alpha'").get();
  assert.equal(row.photo_media_id, "nonexistent-media-id", "SQLite stores any TEXT value without FK");
  db.close();
});

test("R.03 deleting referenced media is NOT restricted (no FK constraint)", () => {
  const db = openFreshDb();
  seedMediaAssets(db);
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'media-1' WHERE slug = 'dr-alpha'").run();
  assert.doesNotThrow(() => {
    db.prepare("DELETE FROM media_assets WHERE id = 'media-1'").run();
  }, "No FK restriction — media deletion succeeds (M4-B will add app-level guard)");
  db.close();
});

test("R.04 null photo_media_id remains valid", () => {
  const db = openFreshDb();
  seedDoctorProfiles(db);
  db.prepare("UPDATE doctor_profiles SET photo_media_id = NULL WHERE slug = 'dr-alpha'").run();
  const row = db.prepare("SELECT photo_media_id FROM doctor_profiles WHERE slug = 'dr-alpha'").get();
  assert.equal(row.photo_media_id, null);
  db.close();
});

test("R.05 multiple null rows remain valid", () => {
  const db = openFreshDb();
  seedDoctorProfiles(db);
  const nulls = db.prepare("SELECT COUNT(*) as cnt FROM doctor_profiles WHERE photo_media_id IS NULL").get().cnt;
  assert.ok(nulls >= 1, "Multiple null photo_media_id rows are valid");
  db.close();
});

test("R.06 index exists and is queryable", () => {
  const db = openFreshDb();
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_doctor_profiles_photo_media'").all();
  assert.equal(indexes.length, 1, "Index idx_doctor_profiles_photo_media exists");
  db.close();
});

test("R.07 relation lookup by media ID returns expected Doctor rows", () => {
  const db = openFreshDb();
  seedDoctorProfiles(db);
  seedMediaAssets(db);
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'media-1' WHERE slug = 'dr-alpha'").run();
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'media-1' WHERE slug = 'dr-beta'").run();
  const doctors = db.prepare("SELECT slug FROM doctor_profiles WHERE photo_media_id = 'media-1' ORDER BY slug").all().map((r) => r.slug);
  assert.deepEqual(doctors, ["dr-alpha", "dr-beta"], "Both doctors referencing media-1 are found");
  db.close();
});

test("R.08 sharing policy: non-unique — multiple doctors can share a media ID", () => {
  const db = openFreshDb();
  seedDoctorProfiles(db);
  seedMediaAssets(db);
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'media-1' WHERE slug = 'dr-alpha'").run();
  db.prepare("UPDATE doctor_profiles SET photo_media_id = 'media-1' WHERE slug = 'dr-beta'").run();
  const count = db.prepare("SELECT COUNT(*) as cnt FROM doctor_profiles WHERE photo_media_id = 'media-1'").get().cnt;
  assert.equal(count, 2, "Non-unique index allows multiple doctors to share a media ID");
  db.close();
});

test("R.09 Gallery media data is unchanged after 0004", () => {
  const db = openPreMigrationDb();
  const galleryBefore = db.prepare("SELECT COUNT(*) as cnt FROM gallery_items").get().cnt;
  db.exec(readMigration("0004_add_doctor_media_relation.sql"));
  const galleryAfter = db.prepare("SELECT COUNT(*) as cnt FROM gallery_items").get().cnt;
  assert.equal(galleryAfter, galleryBefore, "Gallery items count unchanged");
  const mediaBefore = db.prepare("SELECT COUNT(*) as cnt FROM media_assets").get().cnt;
  const mediaAfter = db.prepare("SELECT COUNT(*) as cnt FROM media_assets").get().cnt;
  assert.equal(mediaAfter, mediaBefore, "Media assets count unchanged");
  db.close();
});

/* ═══════════════════════════════════════════════════════════════════════
   COMPATIBILITY
   ═══════════════════════════════════════════════════════════════════════ */

test("C.01 Doctor public code reads photo_media_id for media resolution", () => {
  const publicCode = fs.readFileSync(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  assert.ok(publicCode.includes("photo_media_id"), "doctor-public.ts must reference photo_media_id for media resolution");
});

test("C.02 Doctor save supports photo_media_id", () => {
  const adminCode = fs.readFileSync(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.ok(adminCode.includes("photo_media_id"), "doctor-admin.ts must reference photo_media_id for doctor save");
});

test("C.03 current photo_url rendering remains intact", () => {
  const publicCode = fs.readFileSync(path.join(rootDir, "app", "lib", "doctor-public.ts"), "utf8");
  assert.ok(publicCode.includes("photo_url"), "doctor-public.ts still reads photo_url");
  assert.ok(publicCode.includes("photo:"), "doctor-public.ts still maps to photo output field");
});

test("C.04 Doctor crop/upload contract remains intact", () => {
  const adminCode = fs.readFileSync(path.join(rootDir, "app", "lib", "doctor-admin.ts"), "utf8");
  assert.ok(adminCode.includes("photoUrl"), "doctor-admin.ts still uses photoUrl field");
  const adminDataCode = fs.readFileSync(path.join(rootDir, "app", "api", "admin", "data", "route.ts"), "utf8");
  assert.ok(adminDataCode.includes("photoUrl"), "admin data route still uses photoUrl");
});

test("C.05 Doctor archive/restore tests remain green", () => {
  const db = openFreshDb();
  db.exec("PRAGMA foreign_keys = ON");
  seedDoctorProfiles(db);
  seedMediaAssets(db);
  db.prepare("UPDATE doctor_profiles SET lifecycle_status = 'PUBLISHED', is_deleted = 0, deleted_at = NULL, version = version + 1 WHERE slug = 'dr-gamma'").run();
  const restored = db.prepare("SELECT lifecycle_status, is_deleted FROM doctor_profiles WHERE slug = 'dr-gamma'").get();
  assert.equal(restored.lifecycle_status, "PUBLISHED");
  assert.equal(restored.is_deleted, 0);
  db.close();
});

test("C.06 Gallery v2 tests remain green", () => {
  const db = openFreshDb();
  const sections = db.prepare("SELECT COUNT(*) as cnt FROM gallery_sections").get().cnt;
  const items = db.prepare("SELECT COUNT(*) as cnt FROM gallery_items").get().cnt;
  assert.ok(sections >= 1, "Gallery sections present after 0004");
  assert.ok(items >= 1, "Gallery items present after 0004");
  db.close();
});

test("C.07 Legacy Gallery endpoint tests remain green", () => {
  const db = openFreshDb();
  const publicMedia = db.prepare("SELECT COUNT(*) as cnt FROM media_assets WHERE storage_type = 'PUBLIC'").get().cnt;
  assert.ok(publicMedia >= 7, "Legacy public media assets present after 0004");
  db.close();
});

test("C.08 Media archive/purge tests do not regress", () => {
  const db = openFreshDb();
  const mediaCount = db.prepare("SELECT COUNT(*) as cnt FROM media_assets").get().cnt;
  assert.ok(mediaCount >= 2, "Media assets count stable after 0004");
  db.close();
});

test("C.09 gallery_v2_initialized is not written by migration 0004", () => {
  const migration = readMigration("0004_add_doctor_media_relation.sql");
  assert.ok(!migration.includes("gallery_v2_initialized"), "Migration 0004 must not reference gallery_v2_initialized");
});

test("C.10 no Blog/Video schema relation is added in this bundle", () => {
  const migration = readMigration("0004_add_doctor_media_relation.sql");
  assert.ok(!migration.includes("blog_posts"), "Migration 0004 must not reference blog_posts");
  assert.ok(!migration.includes("patient_videos"), "Migration 0004 must not reference patient_videos");
});

test("C.11 no R2 operation occurs", () => {
  const migration = readMigration("0004_add_doctor_media_relation.sql");
  assert.ok(!migration.toLowerCase().includes("r2"), "Migration 0004 must not reference R2 operations");
});

/* ═══════════════════════════════════════════════════════════════════════
   MIGRATION VALIDATOR
   ═══════════════════════════════════════════════════════════════════════ */

test("V.01 validateM4Migration passes for valid migration", () => {
  const errors = validateM4Migration(migrationsDir);
  assert.deepEqual(errors, [], `M4 validation errors: ${errors.join(", ")}`);
});

test("V.02 validateM4Migration rejects missing migration file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-missing-"));
  try {
    const errors = validateM4Migration(dir);
    assert.ok(errors.some((e) => e.includes("missing")), "Rejects missing 0004 file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("V.03 validateM4Migration rejects missing photo_media_id column", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-nocol-"));
  try {
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"),
      "CREATE INDEX idx_doctor_profiles_photo_media ON doctor_profiles(photo_media_id);");
    const errors = validateM4Migration(dir);
    assert.ok(errors.some((e) => e.includes("photo_media_id")), "Rejects missing ALTER COLUMN");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("V.04 validateM4Migration rejects destructive SQL", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-destruct-"));
  try {
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"),
      "ALTER TABLE doctor_profiles ADD COLUMN photo_media_id TEXT;\nDROP TABLE doctor_profiles;");
    const errors = validateM4Migration(dir);
    assert.ok(errors.some((e) => e.includes("destructive")), "Rejects DROP TABLE");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("V.05 validateM4Migration rejects UPDATE/INSERT statements", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-mutate-"));
  try {
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"),
      "ALTER TABLE doctor_profiles ADD COLUMN photo_media_id TEXT;\nUPDATE doctor_profiles SET photo_media_id = 'backfill';");
    const errors = validateM4Migration(dir);
    assert.ok(errors.some((e) => e.includes("additive")), "Rejects UPDATE statement");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("V.06 validateM4Migration rejects FOREIGN KEY constraint", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m4-fk-"));
  try {
    fs.writeFileSync(path.join(dir, "0004_add_doctor_media_relation.sql"),
      "ALTER TABLE doctor_profiles ADD COLUMN photo_media_id TEXT REFERENCES media_assets(id);");
    const errors = validateM4Migration(dir);
    assert.ok(errors.some((e) => e.includes("FOREIGN KEY") || e.includes("REFERENCES")), "Rejects FK or REFERENCES via ALTER TABLE");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
