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

// Canonical cache/domain slugs (replacing raw table names in cache keys).
export const CONTENT_LIFECYCLE_DOMAINS = [
  "doctors",
  "department-timings",
  "blogs",
  "careers",
  "videos",
  "media",
] as const;

export type ContentLifecycleDomain = (typeof CONTENT_LIFECYCLE_DOMAINS)[number];

const DOMAIN_TO_TABLE: Record<ContentLifecycleDomain, ContentLifecycleTable> = {
  doctors: "doctor_profiles",
  "department-timings": "department_timings",
  blogs: "blog_posts",
  careers: "career_jobs",
  videos: "patient_videos",
  media: "media_assets",
};

const TABLE_TO_DOMAIN: Record<ContentLifecycleTable, ContentLifecycleDomain> = {
  doctor_profiles: "doctors",
  department_timings: "department-timings",
  blog_posts: "blogs",
  career_jobs: "careers",
  patient_videos: "videos",
  media_assets: "media",
};

const DOMAIN_SET: ReadonlySet<string> = new Set<string>(CONTENT_LIFECYCLE_DOMAINS);

export function isContentLifecycleDomain(domain: string): domain is ContentLifecycleDomain {
  return DOMAIN_SET.has(domain);
}

export function lifecycleTableForDomain(domain: ContentLifecycleDomain): ContentLifecycleTable {
  return DOMAIN_TO_TABLE[domain];
}

export function domainForLifecycleTable(table: ContentLifecycleTable): ContentLifecycleDomain {
  return TABLE_TO_DOMAIN[table];
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

// Injected, allowlist-first PRAGMA table_info inspector. The allowlist is
// supplied (defaulting to the canonical six tables) so the capability can be
// reused against arbitrary D1/R2-attached databases without trusting the caller.
export interface LifecycleSchemaInspector {
  inspect(pragmaRows: PragmaColumnRow[], table: string): LifecycleColumnReport;
  isAllowedTable(table: string): boolean;
}

export function createLifecycleSchemaInspector(
  allowedTables: ReadonlyArray<string> = CONTENT_LIFECYCLE_TABLES,
): LifecycleSchemaInspector {
  const allow = new Set<string>(allowedTables);
  return {
    isAllowedTable(table: string): boolean {
      return allow.has(table);
    },
    inspect(pragmaRows: PragmaColumnRow[], table: string): LifecycleColumnReport {
      if (!allow.has(table)) {
        throw new Error(`Table ${table} is not in the content lifecycle allowlist`);
      }
      return getLifecycleColumnReport(pragmaRows);
    },
  };
}
