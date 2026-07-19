export const CONTENT_LIFECYCLE_TABLES = [
  "department_timings",
  "doctor_profiles",
  "blog_posts",
  "career_jobs",
  "patient_videos",
  "media_assets",
] as const;

export type ContentLifecycleTable = (typeof CONTENT_LIFECYCLE_TABLES)[number];

const TABLE_SET: ReadonlySet<string> = new Set<string>(CONTENT_LIFECYCLE_TABLES);

export function isContentLifecycleTable(table: string): table is ContentLifecycleTable {
  return TABLE_SET.has(table);
}

export const LIFECYCLE_COLUMNS = {
  lifecycleStatus: "lifecycle_status",
  version: "version",
  deletedAt: "deleted_at",
} as const;

const RESERVED_LIFECYCLE_COLUMNS: ReadonlySet<string> = new Set<string>([
  LIFECYCLE_COLUMNS.lifecycleStatus,
  LIFECYCLE_COLUMNS.version,
  LIFECYCLE_COLUMNS.deletedAt,
]);

export function isLifecycleManagedColumn(column: string): boolean {
  return RESERVED_LIFECYCLE_COLUMNS.has(column);
}

export interface PragmaColumnRow {
  name: string;
  notnull?: number;
  dflt_value?: string | null;
  type?: string | null;
}

export interface LifecycleColumnReport {
  hasLifecycleStatus: boolean;
  hasVersion: boolean;
  hasDeletedAt: boolean;
  lifecycleStatusDefault?: string | null;
  versionCheckEnforced: boolean;
}

// Consumes REAL PRAGMA table_info output so runtime wiring can prove the
// schema actually carries the canonical content lifecycle columns.
export function getLifecycleColumnReport(rows: PragmaColumnRow[]): LifecycleColumnReport {
  const byName = new Map<string, PragmaColumnRow>();
  for (const row of rows) {
    byName.set(row.name, row);
  }
  const status = byName.get(LIFECYCLE_COLUMNS.lifecycleStatus);
  const version = byName.get(LIFECYCLE_COLUMNS.version);
  const deleted = byName.get(LIFECYCLE_COLUMNS.deletedAt);

  const statusDefault = status?.dflt_value ?? null;
  const versionType = (version?.type ?? "").toUpperCase();
  const versionCheckEnforced = versionType.includes("CHECK") || /version\s*>=\s*1/i.test(version?.dflt_value ?? "");

  return {
    hasLifecycleStatus: Boolean(status),
    hasVersion: Boolean(version),
    hasDeletedAt: Boolean(deleted),
    lifecycleStatusDefault: statusDefault,
    versionCheckEnforced,
  };
}

export function assertSchemaSupportsLifecycle(rows: PragmaColumnRow[], table: string): void {
  if (!isContentLifecycleTable(table)) {
    throw new Error(`Table ${table} is not part of the content lifecycle allowlist`);
  }
  const report = getLifecycleColumnReport(rows);
  if (!report.hasLifecycleStatus) {
    throw new Error(`Table ${table} is missing column ${LIFECYCLE_COLUMNS.lifecycleStatus}`);
  }
  if (!report.hasVersion) {
    throw new Error(`Table ${table} is missing column ${LIFECYCLE_COLUMNS.version}`);
  }
  if (!report.hasDeletedAt) {
    throw new Error(`Table ${table} is missing column ${LIFECYCLE_COLUMNS.deletedAt}`);
  }
}
