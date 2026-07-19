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

export function stripComments(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

export function validateMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    return { valid: false, errors: [`Migrations directory not found: ${migrationsDir}`] };
  }

  const entries = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
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

    const stripped = stripComments(content);

    const destructivePatterns = [
      { pattern: /\bDROP\s+TABLE\b/i, desc: "DROP TABLE" },
      { pattern: /\bDROP\s+INDEX\b/i, desc: "DROP INDEX" },
      { pattern: /\bTRUNCATE\b/i, desc: "TRUNCATE" },
      { pattern: /\bDELETE\s+FROM\b/i, desc: "DELETE FROM (unconditional)" },
      { pattern: /\bALTER\s+TABLE\s+[\s\S]*?\bDROP\b/i, desc: "ALTER TABLE ... DROP" },
    ];

    for (const { pattern, desc } of destructivePatterns) {
      if (pattern.test(stripped)) {
        errors.push(`Destructive SQL detected in "${file}": ${desc}`);
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
    const baselineContent = stripComments(fs.readFileSync(baselinePath, "utf8"));
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
  } else {
    errors.push("Baseline migration 0000_baseline.sql is missing.");
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
  const result = validateMigrationFiles(migrationsDir);

  if (!result.valid) {
    console.error("❌ Migration Check Failed:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  } else {
    console.log(`✅ Migration Check Passed: Verified ${result.filesCount} migration file(s) successfully.`);
    process.exit(0);
  }
}
