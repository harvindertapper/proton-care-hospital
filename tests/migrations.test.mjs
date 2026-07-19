import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  validateMigrationFiles,
  stripComments,
  checkDestructiveStatement,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
} from "../scripts/check-migrations.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const realMigrationsDir = path.join(rootDir, "migrations");
const realServerTsPath = path.join(rootDir, "app", "lib", "server.ts");

test("0000_baseline.sql exists and is non-empty", () => {
  const baselinePath = path.join(realMigrationsDir, "0000_baseline.sql");
  assert.equal(fs.existsSync(baselinePath), true, "Baseline migration 0000_baseline.sql must exist");
  const content = fs.readFileSync(baselinePath, "utf8");
  assert.ok(content.trim().length > 0, "Baseline migration file must not be empty");
});

test("0000_baseline.sql represents all required tables and indexes", () => {
  const baselinePath = path.join(realMigrationsDir, "0000_baseline.sql");
  const content = stripComments(fs.readFileSync(baselinePath, "utf8"));
  for (const table of REQUIRED_TABLES) {
    const tableRegex = new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, "i");
    assert.ok(tableRegex.test(content), `Baseline missing table: ${table}`);
  }
  for (const idx of REQUIRED_INDEXES) {
    assert.ok(content.includes(idx), `Baseline missing index: ${idx}`);
  }
});

test("0000_baseline.sql idempotent_requests.expires_at has no DEFAULT 0", () => {
  const baselinePath = path.join(realMigrationsDir, "0000_baseline.sql");
  const content = fs.readFileSync(baselinePath, "utf8");
  assert.match(content, /expires_at\s+INTEGER\s+NOT\s+NULL(?!\s+DEFAULT)/i);
  assert.doesNotMatch(content, /expires_at\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/i);
});

test("0000_baseline.sql matches normalized current runtime CREATE definitions with zero drift", () => {
  const result = validateMigrationFiles(realMigrationsDir, realServerTsPath);
  assert.equal(result.valid, true, `Schema drift or validation error: ${result.errors?.join(", ")}`);
});

test("checkDestructiveStatement handles conditional vs unconditional DELETE and comments", () => {
  // Unconditional DELETE is rejected
  assert.equal(checkDestructiveStatement("DELETE FROM admin_users;"), "DELETE FROM (unconditional)");
  assert.equal(checkDestructiveStatement("  delete   from   sessions  ;"), "DELETE FROM (unconditional)");

  // Conditional DELETE with WHERE clause is allowed
  assert.equal(checkDestructiveStatement("DELETE FROM sessions WHERE expires_at < 12345;"), null);
  assert.equal(checkDestructiveStatement("DELETE FROM rate_limits WHERE reset_at < CURRENT_TIMESTAMP;"), null);

  // Comment-only destructive words are ignored
  assert.equal(checkDestructiveStatement("-- DROP TABLE admin_users;"), null);
  assert.equal(checkDestructiveStatement("/* TRUNCATE appointments; */"), null);
});

test("Unsorted filesystem input is handled deterministically by validator", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pch-unsorted-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "0001_b.sql"), "CREATE TABLE IF NOT EXISTS b (id TEXT);");
    fs.writeFileSync(path.join(tmpDir, "0000_baseline.sql"), fs.readFileSync(path.join(realMigrationsDir, "0000_baseline.sql"), "utf8"));

    const res = validateMigrationFiles(tmpDir);
    assert.equal(res.valid, true, `Unsorted file handling failed: ${res.errors?.join(", ")}`);
    assert.equal(res.filesCount, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Validator rejects temporary fixtures with duplicate prefix, invalid filename, or destructive SQL", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pch-migration-test-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "0000_baseline.sql"), fs.readFileSync(path.join(realMigrationsDir, "0000_baseline.sql"), "utf8"));

    // Case 1: Invalid filename format
    fs.writeFileSync(path.join(tmpDir, "invalid-name.sql"), "SELECT 1;");
    let res = validateMigrationFiles(tmpDir);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Invalid migration filename format")));
    fs.unlinkSync(path.join(tmpDir, "invalid-name.sql"));

    // Case 2: Duplicate prefix
    fs.writeFileSync(path.join(tmpDir, "0000_dup.sql"), "SELECT 1;");
    res = validateMigrationFiles(tmpDir);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Duplicate migration prefix")));
    fs.unlinkSync(path.join(tmpDir, "0000_dup.sql"));

    // Case 3: Destructive SQL (DROP TABLE)
    fs.writeFileSync(path.join(tmpDir, "0001_destructive.sql"), "DROP TABLE admin_users;");
    res = validateMigrationFiles(tmpDir);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Destructive SQL detected")));
    fs.unlinkSync(path.join(tmpDir, "0001_destructive.sql"));

    // Case 4: Unconditional DELETE
    fs.writeFileSync(path.join(tmpDir, "0002_unconditional_delete.sql"), "DELETE FROM admin_users;");
    res = validateMigrationFiles(tmpDir);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("DELETE FROM (unconditional)")));
    fs.unlinkSync(path.join(tmpDir, "0002_unconditional_delete.sql"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
