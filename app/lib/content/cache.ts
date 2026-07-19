export type ContentCacheTag = string;

export interface ContentCacheInvalidator {
  invalidate(tags: ContentCacheTag[]): Promise<void> | void;
}

const SAFE_KEY = /^[A-Za-z0-9:_.-]{1,200}$/;

export function isValidCacheKey(key: string): boolean {
  return SAFE_KEY.test(key);
}

export function contentCacheTag(domain: string): ContentCacheTag {
  return `content:${domain}`;
}

export function contentCacheKeyTag(domain: string, safeKey: string): ContentCacheTag {
  if (!isValidCacheKey(safeKey)) {
    throw new Error(`Refusing to build unsafe content cache key: ${safeKey}`);
  }
  return `content:${domain}:${safeKey}`;
}
