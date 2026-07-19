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

export const LIFECYCLE_FOUNDATION_MIGRATION = "0002_add_content_lifecycle_foundation.sql";

export const LIFECYCLE_FOUNDATION_TABLES = [
  "department_timings",
  "doctor_profiles",
  "blog_posts",
  "career_jobs",
  "patient_videos",
  "media_assets",
];

export const LIFECYCLE_FOUNDATION_COLUMNS = [
  "lifecycle_status",
  "version",
  "deleted_at",
];

function findAlterAddColumn(stmt, table, column) {
  const addColRegex = new RegExp(
    `^ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+${column}\\b`,
    "i",
  );
  return addColRegex.test(stmt);
}

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

  const lifecyclePath = path.join(migrationsDir, LIFECYCLE_FOUNDATION_MIGRATION);
  if (fs.existsSync(lifecyclePath)) {
    const lifecycleContent = fs.readFileSync(lifecyclePath, "utf8");
    const stripped = stripComments(lifecycleContent);
    const statements = parseSqlStatements(lifecycleContent);

    // Tables whose legacy schema carries is_deleted (must be handled in backfill).
    const TABLES_WITH_IS_DELETED = new Set([
      "doctor_profiles",
      "blog_posts",
      "career_jobs",
      "patient_videos",
    ]);
    const EXPECTED_ENUM = "'DRAFT','IN_REVIEW','PUBLISHED','HIDDEN','ARCHIVED'";
    const enumRegex = new RegExp(
      `lifecycle_status\\s+IN\\s*\\(\\s*${EXPECTED_ENUM.replace(/'/g, "\\'")}\\s*\\)`,
      "i",
    );
    const renameRegex = /\bALTER\s+TABLE\s+[\s\S]*?\bRENAME\b/i;

    let alterCount = 0;
    const seenAlterColumns = new Set();
    for (const stmt of statements) {
      const alterMatch = stmt.match(/^ALTER\s+TABLE\s+(\S+)\s+ADD\s+COLUMN\s+(\S+)/i);
      if (alterMatch) {
        alterCount += 1;
        const tableName = alterMatch[1].replace(/;$/, "");
        const columnName = alterMatch[2].replace(/;$/, "");
        const key = `${tableName}.${columnName}`;
        if (seenAlterColumns.has(key)) {
          errors.push(`Migration 0002 has a duplicate ALTER ADD COLUMN for ${key}.`);
        }
        seenAlterColumns.add(key);
        if (!LIFECYCLE_FOUNDATION_TABLES.includes(tableName)) {
          errors.push(`Migration 0002 adds lifecycle columns to non-canonical table ${tableName}.`);
        }
        if (!LIFECYCLE_FOUNDATION_COLUMNS.includes(columnName)) {
          errors.push(`Migration 0002 adds an unexpected column ${key}; only lifecycle_status, version, deleted_at are permitted.`);
        }
      }
    }

    // Exactly 18 additive ALTERs: 6 tables x 3 columns. No more, no less.
    if (alterCount !== LIFECYCLE_FOUNDATION_TABLES.length * LIFECYCLE_FOUNDATION_COLUMNS.length) {
      errors.push(
        `Migration 0002 must contain exactly ${LIFECYCLE_FOUNDATION_TABLES.length * LIFECYCLE_FOUNDATION_COLUMNS.length} additive ALTER ADD COLUMN statements, found ${alterCount}.`,
      );
    }

    for (const table of LIFECYCLE_FOUNDATION_TABLES) {
      for (const column of LIFECYCLE_FOUNDATION_COLUMNS) {
        if (!statements.some((stmt) => findAlterAddColumn(stmt, table, column))) {
          errors.push(`Migration 0002 missing additive ALTER for ${table}.${column}.`);
        }
      }

      // lifecycle_status must default to PUBLISHED and carry the canonical CHECK enum.
      const addStatusRegex = new RegExp(
        `ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+lifecycle_status\\s+TEXT\\s+NOT\\s+NULL\\s+DEFAULT\\s+'PUBLISHED'\\s+CHECK`,
        "i",
      );
      if (!addStatusRegex.test(stripped)) {
        errors.push(`Migration 0002 lifecycle_status for ${table} must default to PUBLISHED with a CHECK clause.`);
      }
      if (!enumRegex.test(stripped)) {
        errors.push(`Migration 0002 lifecycle_status for ${table} must use the canonical CHECK enum ${EXPECTED_ENUM}.`);
      }

      // version must be a positive-integer column guarded by CHECK (version >= 1).
      const addVersionRegex = new RegExp(
        `ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+version\\s+INTEGER\\s+NOT\\s+NULL\\s+DEFAULT\\s+1\\s+CHECK\\s*\\(\\s*version\\s*>=\\s*1`,
        "i",
      );
      if (!addVersionRegex.test(stripped)) {
        errors.push(`Migration 0002 version for ${table} must be INTEGER NOT NULL DEFAULT 1 with CHECK (version >= 1).`);
      }

      // deleted_at must be a nullable TEXT column (no NOT NULL, no DEFAULT).
      const addDeletedRegex = new RegExp(
        `ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+deleted_at\\s+TEXT`,
        "i",
      );
      if (!addDeletedRegex.test(stripped)) {
        errors.push(`Migration 0002 deleted_at for ${table} must be a nullable TEXT column.`);
      }
    }

    // Backfill UPDATEs: one per table, with the canonical WHERE guard, and the
    // is_deleted -> ARCHIVED branch only where the legacy table has is_deleted.
    for (const table of LIFECYCLE_FOUNDATION_TABLES) {
      const backfill = statements.find((stmt) => new RegExp(`^UPDATE\\s+${table}\\s+SET`, "i").test(stmt));
      if (!backfill) {
        errors.push(`Migration 0002 is missing a backfill UPDATE for ${table}.`);
        continue;
      }
      if (!/\bWHERE\s+lifecycle_status\s*=\s*'PUBLISHED'/i.test(backfill)) {
        errors.push(`Migration 0002 backfill for ${table} must only target rows still at lifecycle_status = 'PUBLISHED'.`);
      }
      if (!/SET\s+lifecycle_status\s*=\s*CASE/i.test(backfill)) {
        errors.push(`Migration 0002 backfill for ${table} must assign lifecycle_status via a CASE expression.`);
      }
      if (/\bSET\b[\s\S]*is_deleted[\s\S]*THEN\s*'ARCHIVED'/i.test(backfill) !== TABLES_WITH_IS_DELETED.has(table)) {
        errors.push(
          `Migration 0002 backfill for ${table} ${TABLES_WITH_IS_DELETED.has(table) ? "must" : "must not"} map is_deleted = 1 to ARCHIVED.`,
        );
      }
      if (TABLES_WITH_IS_DELETED.has(table) && !/is_deleted\s*=\s*1\s+AND\s+deleted_at\s+IS\s+NULL\s+THEN\s+CURRENT_TIMESTAMP/i.test(backfill)) {
        errors.push(`Migration 0002 backfill for ${table} must stamp deleted_at = CURRENT_TIMESTAMP when is_deleted = 1 and deleted_at IS NULL.`);
      }
    }

    // Destructive / structural guards.
    for (const stmt of statements) {
      if (/\bALTER\s+TABLE\s+[\s\S]*?\bDROP\b/i.test(stmt)) {
        errors.push("Migration 0002 must not drop any legacy columns.");
      }
      if (renameRegex.test(stmt)) {
        errors.push("Migration 0002 must not rename any table or column.");
      }
      if (/\bDROP\s+TABLE\b/i.test(stmt)) {
        errors.push("Migration 0002 must not drop any table.");
      }
      if (/\bTRUNCATE\b/i.test(stmt)) {
        errors.push("Migration 0002 must not truncate any table.");
      }
      // Unconditional DELETE (no WHERE) is destructive; conditional DELETE is also disallowed here.
      if (/\bDELETE\s+FROM\b/i.test(stmt)) {
        errors.push("Migration 0002 must not DELETE from any table.");
      }
    }

    if (enumRegex.test(stripped) === false) {
      errors.push("Migration 0002 must introduce the canonical lifecycle_status CHECK enum.");
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
