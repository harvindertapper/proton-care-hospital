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

test("checkDestructiveStatement handles DROP INDEX, TRUNCATE, ALTER DROP, and DELETE clauses", () => {
  // Destructive operations fail outside comments
  assert.equal(checkDestructiveStatement("DROP INDEX idx_test;"), "DROP INDEX");
  assert.equal(checkDestructiveStatement("TRUNCATE appointments;"), "TRUNCATE");
  assert.equal(checkDestructiveStatement("ALTER TABLE admin_users DROP COLUMN is_active;"), "ALTER TABLE ... DROP");
  assert.equal(checkDestructiveStatement("DELETE FROM admin_users;"), "DELETE FROM (unconditional)");

  // Conditional DELETE with WHERE is allowed
  assert.equal(checkDestructiveStatement("DELETE FROM sessions WHERE expires_at < 1234;"), null);

  // Commented destructive operations are ignored
  assert.equal(checkDestructiveStatement("-- DROP INDEX idx_test;"), null);
  assert.equal(checkDestructiveStatement("/* TRUNCATE appointments; */"), null);
});

test("Bidirectional source-drift: extra baseline-only CREATE statement fails validation", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pch-extra-baseline-"));
  const tmpServerTs = path.join(tmpDir, "server.ts");
  try {
    const validBaseline = fs.readFileSync(path.join(realMigrationsDir, "0000_baseline.sql"), "utf8");
    const extraBaseline = validBaseline + "\nCREATE TABLE IF NOT EXISTS extra_table (id TEXT PRIMARY KEY);";
    fs.writeFileSync(path.join(tmpDir, "0000_baseline.sql"), extraBaseline);
    fs.writeFileSync(tmpServerTs, fs.readFileSync(realServerTsPath, "utf8"));

    const res = validateMigrationFiles(tmpDir, tmpServerTs);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Schema drift") || e.includes("mismatch")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Bidirectional source-drift: runtime-only CREATE statement fails validation", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pch-extra-runtime-"));
  const tmpServerTs = path.join(tmpDir, "server.ts");
  try {
    fs.writeFileSync(path.join(tmpDir, "0000_baseline.sql"), fs.readFileSync(path.join(realMigrationsDir, "0000_baseline.sql"), "utf8"));
    const serverCode = fs.readFileSync(realServerTsPath, "utf8");
    const modifiedServerCode = serverCode.replace(
      "const tableStatements = [",
      "const tableStatements = [\n  `CREATE TABLE IF NOT EXISTS extra_runtime (id TEXT PRIMARY KEY)`,",
    );
    fs.writeFileSync(tmpServerTs, modifiedServerCode);

    const res = validateMigrationFiles(tmpDir, tmpServerTs);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Schema drift") || e.includes("mismatch")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Bidirectional source-drift: duplicate normalized CREATE statement fails validation", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pch-dup-statement-"));
  try {
    const validBaseline = fs.readFileSync(path.join(realMigrationsDir, "0000_baseline.sql"), "utf8");
    const dupBaseline = validBaseline + "\nCREATE TABLE IF NOT EXISTS site_configs (\n  key TEXT PRIMARY KEY,\n  value TEXT NOT NULL\n);";
    fs.writeFileSync(path.join(tmpDir, "0000_baseline.sql"), dupBaseline);

    const res = validateMigrationFiles(tmpDir, realServerTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Duplicate normalized CREATE statement")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Empty migration file fails validation", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pch-empty-migration-"));
  try {
    fs.writeFileSync(path.join(tmpDir, "0000_baseline.sql"), "");

    const res = validateMigrationFiles(tmpDir, realServerTsPath);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("empty")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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

test("Validator rejects temporary fixtures with duplicate prefix or invalid filename", () => {
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
