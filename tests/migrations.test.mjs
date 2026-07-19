import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  validateMigrationFiles,
  stripComments,
  REQUIRED_TABLES,
  REQUIRED_INDEXES,
} from "../scripts/check-migrations.mjs";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const realMigrationsDir = path.join(rootDir, "migrations");

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

test("0000_baseline.sql contains no destructive SQL", () => {
  const baselinePath = path.join(realMigrationsDir, "0000_baseline.sql");
  const stripped = stripComments(fs.readFileSync(baselinePath, "utf8"));
  assert.doesNotMatch(stripped, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(stripped, /\bDROP\s+INDEX\b/i);
  assert.doesNotMatch(stripped, /\bTRUNCATE\b/i);
  assert.doesNotMatch(stripped, /\bDELETE\s+FROM\b/i);
});

test("Static migration validator passes on real committed migrations directory", () => {
  const result = validateMigrationFiles(realMigrationsDir);
  assert.equal(result.valid, true, `Validation failed: ${result.errors?.join(", ")}`);
  assert.ok(result.filesCount >= 1);
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

    // Case 3: Destructive SQL
    fs.writeFileSync(path.join(tmpDir, "0001_destructive.sql"), "DROP TABLE admin_users;");
    res = validateMigrationFiles(tmpDir);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Destructive SQL detected")));
    fs.unlinkSync(path.join(tmpDir, "0001_destructive.sql"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
