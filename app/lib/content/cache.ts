export type ContentCacheTag =
  | "department_timings"
  | "doctor_profiles"
  | "blog_posts"
  | "career_jobs"
  | "patient_videos"
  | "media_assets"
  | "content:all";

export interface ContentCacheInvalidator {
  invalidate(tags: ContentCacheTag[]): Promise<void> | void;
}

const SAFE_KEY = /^[A-Za-z0-9:_-]{1,200}$/;

export function isValidCacheKey(key: string): boolean {
  return SAFE_KEY.test(key);
}

export function buildContentCacheKey(table: string, id: string): string {
  const key = `${table}:${id}`;
  if (!isValidCacheKey(key)) {
    throw new Error(`Refusing to build unsafe content cache key: ${key}`);
  }
  return key;
}

export function tagsForTable(table: string): ContentCacheTag[] {
  return [table as ContentCacheTag, "content:all"];
}
