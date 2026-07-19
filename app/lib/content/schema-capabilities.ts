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
