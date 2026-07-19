import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_TABLES = [
  "admin_users",
  "sessions",
  "appointments",
  "feedback",
  "contact_messages",
  "department_timings",
  "doctor_profiles",
  "content_revisions",
  "blog_posts",
  "career_jobs",
  "patient_videos",
  "media_assets",
  "audit_logs",
  "rate_limits",
  "idempotent_requests",
  "admin_email_otps",
  "department_closures",
  "site_analytics",
  "admin_webhooks",
  "site_configs",
];

export const REQUIRED_INDEXES = [
  "appointments_status_created_idx",
  "revisions_status_idx",
  "doctors_department_idx",
  "rate_limits_action_identifier_idx",
  "admin_users_email_idx",
  "sessions_id_idx",
  "sessions_expires_idx",
  "idx_appointments_slot",
  "admin_email_otps_email_idx",
  "idx_analytics_event",
];

export const IMMUTABLE_BASELINE_APPOINTMENT_INDEX =
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot ON appointments(department_slug, requested_date, requested_time, phone) WHERE status != 'CANCELLED'";

export const REQUIRED_INCREMENTAL_MIGRATIONS = {
  "0001_enforce_department_slot_exclusivity.sql":
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_department_slot ON appointments(department_slug, requested_date, requested_time) WHERE status != 'CANCELLED'",
};

export function stripComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

export function normalizeSql(sql) {
  const stripped = stripComments(sql);
  return stripped.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

export function parseSqlStatements(sql) {
  const stripped = stripComments(sql);
  return stripped
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function checkDestructiveStatement(stmt) {
  const stripped = stripComments(stmt).trim();
  if (!stripped) return null;

  if (/\bDROP\s+TABLE\b/i.test(stripped)) return "DROP TABLE";
  if (/\bDROP\s+INDEX\b/i.test(stripped)) return "DROP INDEX";
  if (/\bTRUNCATE\b/i.test(stripped)) return "TRUNCATE";
  if (/\bALTER\s+TABLE\s+[\s\S]*?\bDROP\b/i.test(stripped)) return "ALTER TABLE ... DROP";

  if (/\bDELETE\s+FROM\b/i.test(stripped)) {
    if (!/\bWHERE\b/i.test(stripped)) {
      return "DELETE FROM (unconditional)";
    }
  }

  return null;
}

export function extractServerTableStatements(serverTsPath) {
  if (!fs.existsSync(serverTsPath)) return [];
  const code = fs.readFileSync(serverTsPath, "utf8");
  const startIdx = code.indexOf("const tableStatements = [");
  if (startIdx === -1) return [];
  const endIdx = code.indexOf("];", startIdx);
  if (endIdx === -1) return [];
  const block = code.slice(startIdx, endIdx);

  const statements = [];
  const regex = /`([^`]+)`/g;
  let m;
  while ((m = regex.exec(block)) !== null) {
    if (m[1].trim()) {
      statements.push(m[1].trim());
    }
  }
  return statements;
}

export function validateMigrationFiles(migrationsDir, serverTsPath = null) {
  if (!fs.existsSync(migrationsDir)) {
    return { valid: false, errors: [`Migrations directory not found: ${migrationsDir}`] };
  }

  const entries = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  if (entries.length === 0) {
    return { valid: false, errors: ["No .sql migration files found in migrations directory."] };
  }

  const errors = [];
  const prefixes = [];

  for (const file of entries) {
    const match = file.match(/^(\d{4})_[a-zA-Z0-9_-]+\.sql$/);
    if (!match) {
      errors.push(`Invalid migration filename format: "${file}". Must match 0000_name.sql format.`);
      continue;
    }
    const prefix = match[1];
    if (prefixes.includes(prefix)) {
      errors.push(`Duplicate migration prefix found: "${prefix}" in file "${file}".`);
    }
    prefixes.push(prefix);

    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    if (content.trim().length === 0) {
      errors.push(`Migration file is empty: "${file}".`);
      continue;
    }

    const statements = parseSqlStatements(content);
    for (const stmt of statements) {
      const destructiveReason = checkDestructiveStatement(stmt);
      if (destructiveReason) {
        errors.push(`Destructive SQL detected in "${file}": ${destructiveReason}`);
      }
    }
  }

  const sortedPrefixes = [...prefixes].sort();
  for (let i = 0; i < prefixes.length; i++) {
    if (prefixes[i] !== sortedPrefixes[i]) {
      errors.push(`Migration files are not in ascending prefix order: "${entries[i]}".`);
      break;
    }
  }

  const baselinePath = path.join(migrationsDir, "0000_baseline.sql");
  if (fs.existsSync(baselinePath)) {
    const baselineContent = fs.readFileSync(baselinePath, "utf8");
    const baselineStatements = parseSqlStatements(baselineContent).map(normalizeSql);

    for (const table of REQUIRED_TABLES) {
      const tableRegex = new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\b`, "i");
      if (!tableRegex.test(baselineContent)) {
        errors.push(`Baseline 0000_baseline.sql missing table definition for "${table}".`);
      }
    }
    for (const idx of REQUIRED_INDEXES) {
      const indexRegex = new RegExp(`\\b${idx}\\b`, "i");
      if (!indexRegex.test(baselineContent)) {
        errors.push(`Baseline 0000_baseline.sql missing index definition for "${idx}".`);
      }
    }

    const immutableIndex = normalizeSql(IMMUTABLE_BASELINE_APPOINTMENT_INDEX);
    const accidentalThreeColumnLegacyIndex = normalizeSql(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_slot ON appointments(department_slug, requested_date, requested_time) WHERE status != 'CANCELLED'",
    );
    if (!baselineStatements.includes(immutableIndex)) {
      errors.push("Immutable baseline index idx_appointments_slot does not match the B0 definition.");
    }
    if (baselineStatements.includes(accidentalThreeColumnLegacyIndex)) {
      errors.push("Immutable baseline index idx_appointments_slot incorrectly omits phone.");
    }

    if (serverTsPath && fs.existsSync(serverTsPath)) {
      const serverStatements = extractServerTableStatements(serverTsPath).map(normalizeSql);
      if (serverStatements.length === 0) {
        errors.push("Failed to extract tableStatements from app/lib/server.ts.");
      } else {
        const seenServer = new Set();
        for (const sStmt of serverStatements) {
          if (seenServer.has(sStmt)) {
            errors.push(`Duplicate normalized CREATE statement in app/lib/server.ts: "${sStmt.slice(0, 60)}..."`);
          }
          seenServer.add(sStmt);
        }

        const seenBaseline = new Set();
        for (const bStmt of baselineStatements) {
          if (seenBaseline.has(bStmt)) {
            errors.push(`Duplicate normalized CREATE statement in 0000_baseline.sql: "${bStmt.slice(0, 60)}..."`);
          }
          seenBaseline.add(bStmt);
        }

        if (serverStatements.length !== baselineStatements.length) {
          errors.push(`Statement count mismatch: app/lib/server.ts declared ${serverStatements.length} CREATE statements but 0000_baseline.sql declared ${baselineStatements.length} CREATE statements.`);
        }

        for (const sStmt of serverStatements) {
          if (!baselineStatements.includes(sStmt)) {
            errors.push(`Schema drift (runtime statement missing from baseline): "${sStmt.slice(0, 60)}..."`);
          }
        }

        for (const bStmt of baselineStatements) {
          if (!serverStatements.includes(bStmt)) {
            errors.push(`Schema drift (baseline statement missing from runtime): "${bStmt.slice(0, 60)}..."`);
          }
        }
      }
    }
  } else {
    errors.push("Baseline migration 0000_baseline.sql is missing.");
  }

  for (const [file, expectedStatement] of Object.entries(REQUIRED_INCREMENTAL_MIGRATIONS)) {
    const migrationPath = path.join(migrationsDir, file);
    if (!fs.existsSync(migrationPath)) {
      errors.push("Migration 0001 is missing idx_appointments_department_slot.");
      continue;
    }

    const migrationContent = fs.readFileSync(migrationPath, "utf8");
    const statements = parseSqlStatements(migrationContent).map(normalizeSql);
    if (!statements.includes(normalizeSql(expectedStatement))) {
      errors.push("Migration 0001 is missing idx_appointments_department_slot.");
    }
    if (/idx_appointments_department_slot[\s\S]*requested_time\s*,\s*phone/i.test(stripComments(migrationContent))) {
      errors.push("Migration 0001 incorrectly includes phone in the department-slot invariant.");
    }
    if (/\b(?:DROP|DELETE|UPDATE|INSERT|REPLACE|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(stripComments(migrationContent))) {
      errors.push("Migration 0001 must remain additive and may only create the new index.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    filesCount: entries.length,
  };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const rootDir = path.resolve(path.dirname(__filename), "..");
  const migrationsDir = path.join(rootDir, "migrations");
  const serverTsPath = path.join(rootDir, "app", "lib", "server.ts");
  const result = validateMigrationFiles(migrationsDir, serverTsPath);

  if (!result.valid) {
    console.error("❌ Migration Check Failed:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  } else {
    console.log(`✅ Migration Check Passed: Verified ${result.filesCount} migration file(s) with zero schema drift.`);
    process.exit(0);
  }
}
