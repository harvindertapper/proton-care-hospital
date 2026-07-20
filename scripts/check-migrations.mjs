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

export const PROTECTED_MIGRATION_HASHES = {
  "0000_baseline.sql": "F72C5CBA5D08DB5F46A178EF7792192D847B6EB8AD67AB2A008473A57ED01530",
  "0001_enforce_department_slot_exclusivity.sql": "95CC50AAC38ED9A4EC2F298EE67E652FF4DFA40DD23920DFB4D0D54A59F87BFB",
  "0002_add_content_lifecycle_foundation.sql": "69456A06436FAFCC8EF3C003FCC1E01E453B2B9D3410240940FED2ABEA7E5971",
};

export const M1_MIGRATION_FILE = "0003_add_media_library_and_gallery.sql";

export const M1_EXPECTED_MEDIA_COLUMNS = [
  "storage_type",
  "public_path",
  "display_r2_key",
  "display_public_path",
  "display_content_type",
  "display_size_bytes",
  "thumbnail_r2_key",
  "thumbnail_public_path",
  "thumbnail_content_type",
  "thumbnail_size_bytes",
  "title",
  "alt_text",
  "caption",
  "width",
  "height",
  "checksum_sha256",
  "category",
  "rights_status",
  "rights_source",
  "source_url",
  "updated_at",
  "published_at",
  "cleanup_candidate_at",
  "purge_after",
  "purge_status",
  "purge_error",
];

export const M1_EXPECTED_TABLES = ["gallery_sections", "gallery_items"];

export const M1_EXPECTED_INDEXES = [
  "idx_media_lifecycle_category_created",
  "idx_media_active_public_path",
  "idx_media_active_checksum",
  "idx_gallery_sections_lifecycle_order",
  "idx_gallery_items_section_lifecycle_order",
  "idx_gallery_items_media_deleted",
  "idx_gallery_items_active_slot",
];

export const M1_PUBLIC_SEED_IDS = [
  "media-public-gallery-front-exterior-hero",
  "media-public-gallery-front-exterior-wide",
  "media-public-gallery-reception",
  "media-public-gallery-corridor",
  "media-public-gallery-ward-bed-01",
  "media-public-gallery-patient-room-twin",
  "media-public-gallery-patient-room-single",
];

export const M1_GALLERY_SECTION_ID = "gallery-section-facilities";

export const M1_GALLERY_ITEM_IDS = [
  "gallery-item-hero",
  "gallery-item-wide",
  "gallery-item-reception",
  "gallery-item-corridor",
  "gallery-item-ward",
  "gallery-item-twin",
  "gallery-item-single",
];

export async function computeFileSha256(filePath) {
  const crypto = await import("node:crypto");
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

export async function verifyProtectedHashes(migrationsDir) {
  const errors = [];
  const crypto = await import("node:crypto");
  for (const [file, expectedHash] of Object.entries(PROTECTED_MIGRATION_HASHES)) {
    const fullPath = path.join(migrationsDir, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Protected migration file missing: ${file}`);
      continue;
    }
    const content = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
    if (actualHash !== expectedHash) {
      errors.push(`Protected hash mismatch for ${file}: expected ${expectedHash}, got ${actualHash}`);
    }
  }
  return errors;
}

export function validateM1Migration(migrationsDir) {
  const errors = [];
  const m1Path = path.join(migrationsDir, M1_MIGRATION_FILE);

  if (!fs.existsSync(m1Path)) {
    errors.push(`Migration 0003 file missing: ${M1_MIGRATION_FILE}`);
    return errors;
  }

  const content = fs.readFileSync(m1Path, "utf8");
  const stripped = stripComments(content);
  const statements = parseSqlStatements(content).map(normalizeSql);

  // Check no destructive SQL
  for (const stmt of statements) {
    const destructiveReason = checkDestructiveStatement(stmt);
    if (destructiveReason) {
      errors.push(`Migration 0003 contains destructive SQL: ${destructiveReason}`);
    }
  }

  // Verify ALTER TABLE media_assets ADD COLUMN statements for all expected columns
  for (const col of M1_EXPECTED_MEDIA_COLUMNS) {
    const alterRegex = new RegExp(
      `ALTER\\s+TABLE\\s+media_assets\\s+ADD\\s+COLUMN\\s+${col}\\b`,
      "i"
    );
    if (!alterRegex.test(stripped)) {
      errors.push(`Migration 0003 missing ALTER TABLE media_assets ADD COLUMN ${col}`);
    }
  }

  // Verify gallery_sections CREATE TABLE
  if (!/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?gallery_sections\b/i.test(stripped)) {
    errors.push("Migration 0003 missing CREATE TABLE gallery_sections");
  }

  // Verify gallery_items CREATE TABLE
  if (!/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?gallery_items\b/i.test(stripped)) {
    errors.push("Migration 0003 missing CREATE TABLE gallery_items");
  }

  // Verify gallery_items has FOREIGN KEY references
  if (!/FOREIGN\s+KEY\s*\(\s*section_id\s*\)\s*REFERENCES\s+gallery_sections/i.test(stripped)) {
    errors.push("Migration 0003 gallery_items missing FOREIGN KEY to gallery_sections");
  }
  if (!/FOREIGN\s+KEY\s*\(\s*media_id\s*\)\s*REFERENCES\s+media_assets/i.test(stripped)) {
    errors.push("Migration 0003 gallery_items missing FOREIGN KEY to media_assets");
  }

  // Verify indexes
  for (const idx of M1_EXPECTED_INDEXES) {
    const idxRegex = new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX.*\\b${idx}\\b`, "i");
    if (!idxRegex.test(stripped)) {
      errors.push(`Migration 0003 missing index: ${idx}`);
    }
  }

  // Verify PUBLIC seed INSERTs exist
  for (const seedId of M1_PUBLIC_SEED_IDS) {
    if (!stripped.includes(`'${seedId}'`)) {
      errors.push(`Migration 0003 missing PUBLIC seed: ${seedId}`);
    }
  }

  // Verify the INSERT column list includes storage_type
  if (!/INSERT\s+OR\s+IGNORE\s+INTO\s+media_assets\s*\([^)]*\bstorage_type\b/i.test(stripped)) {
    errors.push("Migration 0003 media_assets INSERT missing storage_type in column list");
  }

  // Verify each seed row is dormant via positional values:
  // status='HIDDEN', is_visible=0, lifecycle_status='DRAFT', storage_type='PUBLIC'
  const DORMANT_POSITIONAL = /'HIDDEN',\s*0,\s*'DRAFT',\s*'PUBLIC'/g;
  const dormantMatches = stripped.match(DORMANT_POSITIONAL);
  const expectedDormantCount = M1_PUBLIC_SEED_IDS.length;
  if (!dormantMatches || dormantMatches.length < expectedDormantCount) {
    errors.push(`Migration 0003 PUBLIC seeds must have dormant positional pattern 'HIDDEN', 0, 'DRAFT', 'PUBLIC' for all ${expectedDormantCount} seeds`);
  }

  // Verify gallery section seed
  if (!stripped.includes(`'${M1_GALLERY_SECTION_ID}'`)) {
    errors.push(`Migration 0003 missing gallery section seed: ${M1_GALLERY_SECTION_ID}`);
  }

  // Verify gallery item seeds
  for (const itemId of M1_GALLERY_ITEM_IDS) {
    if (!stripped.includes(`'${itemId}'`)) {
      errors.push(`Migration 0003 missing gallery item seed: ${itemId}`);
    }
  }

  // Verify gallery_v2_initialized=0 marker
  if (!/gallery_v2_initialized['"]\s*,\s*['"]0['"]/i.test(stripped)) {
    errors.push("Migration 0003 missing gallery_v2_initialized=0 marker");
  }

  // Verify backfill UPDATE exists
  if (!/UPDATE\s+media_assets\s+SET/i.test(stripped)) {
    errors.push("Migration 0003 missing backfill UPDATE for media_assets");
  }

  return errors;
}

export function validateMediaLifecycleColumns(migrationsDir) {
  const errors = [];
  const m1Path = path.join(migrationsDir, M1_MIGRATION_FILE);
  if (!fs.existsSync(m1Path)) return errors;

  const content = fs.readFileSync(m1Path, "utf8");
  const stripped = stripComments(content);

  // gallery_sections and gallery_items are CREATE TABLE (not ALTER), so verify
  // their definitions include lifecycle_status, version, deleted_at columns.
  const tablesToCheck = ["gallery_sections", "gallery_items"];
  for (const table of tablesToCheck) {
    for (const col of ["lifecycle_status", "version", "deleted_at"]) {
      const inCreateTable = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}[\\s\\S]*?\\b${col}\\b`,
        "i"
      );
      if (!inCreateTable.test(stripped)) {
        errors.push(`Migration 0003 ${table} missing lifecycle column: ${col}`);
      }
    }
  }

  return errors;
}

function findAlterAddColumn(stmt, table, column) {
  const addColRegex = new RegExp(
    `^ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+${column}\\b`,
    "i",
  );
  return addColRegex.test(stmt);
}

// Map an unauthorized statement to a human-readable kind for validator errors.
function classifyUnauthorized(stmt) {
  if (/^\s*UPDATE\b/i.test(stmt)) return "UPDATE";
  if (/^\s*CREATE\s+TABLE\b/i.test(stmt)) return "CREATE TABLE";
  if (/^\s*CREATE\s+INDEX\b/i.test(stmt)) return "CREATE INDEX";
  if (/^\s*INSERT\b/i.test(stmt)) return "INSERT";
  if (/^\s*REPLACE\b/i.test(stmt)) return "REPLACE";
  if (/^\s*DELETE\b/i.test(stmt)) return "DELETE";
  if (/^\s*DROP\b/i.test(stmt)) return "DROP";
  if (/^\s*TRUNCATE\b/i.test(stmt)) return "TRUNCATE";
  if (/^\s*ALTER\b[\s\S]*\bRENAME\b/i.test(stmt)) return "RENAME";
  if (/^\s*ALTER\b/i.test(stmt)) return "ALTER";
  if (/^\s*CREATE\b/i.test(stmt)) return "CREATE";
  return "statement";
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
  if (!fs.existsSync(lifecyclePath)) {
    errors.push("Migration 0002 (content lifecycle foundation) is missing.");
  } else {
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

    // Classify every statement. Only approved ALTER ADD COLUMN and approved
    // backfill UPDATE statements are permitted; everything else is unauthorized.
    let approvedAlterCount = 0;
    let approvedUpdateCount = 0;
    const seenAlterColumns = new Set();
    const seenBackfillTables = new Set();

    for (const stmt of statements) {
      const alterMatch = stmt.match(/^ALTER\s+TABLE\s+(\S+)\s+ADD\s+COLUMN\s+(\S+)/i);
      if (alterMatch) {
        const tableName = alterMatch[1].replace(/;$/, "");
        const columnName = alterMatch[2].replace(/;$/, "");
        const key = `${tableName}.${columnName}`;
        if (seenAlterColumns.has(key)) {
          errors.push(`Migration 0002 has a duplicate ALTER ADD COLUMN for ${key}.`);
        }
        seenAlterColumns.add(key);
        if (!LIFECYCLE_FOUNDATION_TABLES.includes(tableName)) {
          errors.push(`Migration 0002 adds lifecycle columns to non-canonical table ${tableName}.`);
          continue;
        }
        if (!LIFECYCLE_FOUNDATION_COLUMNS.includes(columnName)) {
          errors.push(`Migration 0002 adds an unexpected column ${key}; only lifecycle_status, version, deleted_at are permitted.`);
          continue;
        }
        approvedAlterCount += 1;
        continue;
      }

      const backfillMatch = stmt.match(/^UPDATE\s+(\S+)\s+SET/i);
      if (backfillMatch) {
        const tableName = backfillMatch[1].replace(/;$/, "");
        if (!LIFECYCLE_FOUNDATION_TABLES.includes(tableName)) {
          errors.push(`Migration 0002 backfill targets non-canonical table ${tableName}.`);
          continue;
        }
        if (seenBackfillTables.has(tableName)) {
          errors.push(`Migration 0002 has a duplicate backfill UPDATE for ${tableName}.`);
          continue;
        }
        seenBackfillTables.add(tableName);
        if (!/SET\s+lifecycle_status\s*=\s*CASE/i.test(stmt)) {
          errors.push(`Migration 0002 backfill for ${tableName} must assign lifecycle_status via a CASE expression.`);
          continue;
        }
        if (!/\bWHERE\s+lifecycle_status\s*=\s*'PUBLISHED'/i.test(stmt)) {
          errors.push(`Migration 0002 backfill for ${tableName} must only target rows still at lifecycle_status = 'PUBLISHED'.`);
          continue;
        }
        if (/\bSET\b[\s\S]*is_deleted[\s\S]*THEN\s*'ARCHIVED'/i.test(stmt) !== TABLES_WITH_IS_DELETED.has(tableName)) {
          errors.push(
            `Migration 0002 backfill for ${tableName} ${TABLES_WITH_IS_DELETED.has(tableName) ? "must" : "must not"} map is_deleted = 1 to ARCHIVED.`,
          );
          continue;
        }
        if (TABLES_WITH_IS_DELETED.has(tableName) && !/is_deleted\s*=\s*1\s+AND\s+deleted_at\s+IS\s+NULL\s+THEN\s+CURRENT_TIMESTAMP/i.test(stmt)) {
          errors.push(`Migration 0002 backfill for ${tableName} must stamp deleted_at = CURRENT_TIMESTAMP when is_deleted = 1 and deleted_at IS NULL.`);
          continue;
        }
        approvedUpdateCount += 1;
        continue;
      }

      // Anything else is an unauthorized statement type.
      const kind = classifyUnauthorized(stmt);
      errors.push(`Migration 0002 contains an unauthorized ${kind} statement: ${stmt.slice(0, 80)}`);
    }

    // Req 8: exactly 18 approved ALTERs and exactly six approved UPDATEs.
    const expectedAlter = LIFECYCLE_FOUNDATION_TABLES.length * LIFECYCLE_FOUNDATION_COLUMNS.length;
    if (approvedAlterCount !== expectedAlter) {
      errors.push(`Migration 0002 must contain exactly ${expectedAlter} approved ALTER ADD COLUMN statements, found ${approvedAlterCount}.`);
    }
    if (approvedUpdateCount !== LIFECYCLE_FOUNDATION_TABLES.length) {
      errors.push(`Migration 0002 must contain exactly ${LIFECYCLE_FOUNDATION_TABLES.length} approved backfill UPDATE statements, found ${approvedUpdateCount}.`);
    }
    for (const table of LIFECYCLE_FOUNDATION_TABLES) {
      if (!seenBackfillTables.has(table)) {
        errors.push(`Migration 0002 is missing a backfill UPDATE for ${table}.`);
      }
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
  }

  const protectedErrors = await verifyProtectedHashes(migrationsDir);
  if (protectedErrors.length > 0) {
    console.error("❌ Protected Hash Verification Failed:");
    for (const err of protectedErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const m1Errors = validateM1Migration(migrationsDir);
  if (m1Errors.length > 0) {
    console.error("❌ Migration 0003 Validation Failed:");
    for (const err of m1Errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  const mediaLifecycleErrors = validateMediaLifecycleColumns(migrationsDir);
  if (mediaLifecycleErrors.length > 0) {
    console.error("❌ Media Lifecycle Column Validation Failed:");
    for (const err of mediaLifecycleErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`✅ Migration Check Passed: Verified ${result.filesCount} migration file(s) with zero schema drift.`);
  console.log("✅ Protected hashes verified for 0000-0002.");
  console.log("✅ Migration 0003 validated: additive media library + gallery foundation.");
  process.exit(0);
}
