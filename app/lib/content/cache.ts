import {
  CONTENT_LIFECYCLE_DOMAINS,
  type ContentLifecycleDomain,
} from "./schema-capabilities.ts";

export type ContentCacheTag = string;

export interface ContentCacheInvalidator {
  invalidate(tags: ContentCacheTag[]): Promise<void> | void;
}

// Safe keys may contain only alphanumerics, underscore, and hyphen. Colon,
// dot, slash, backslash, whitespace, and control characters are rejected so a
// caller can never break out of the content:<domain>:<key> namespace.
const SAFE_KEY = /^[A-Za-z0-9_-]{1,200}$/;

export function isValidCacheKey(key: string): boolean {
  if (typeof key !== "string" || !SAFE_KEY.test(key)) {
    return false;
  }
  // Defensive: reject control characters (covered by the anchors above).
  return !/[\x00-\x1f\x7f]/.test(key);
}

export function isContentCacheDomain(domain: string): domain is ContentLifecycleDomain {
  return (CONTENT_LIFECYCLE_DOMAINS as readonly string[]).includes(domain);
}

export function contentCacheTag(domain: string): ContentCacheTag {
  if (!isContentCacheDomain(domain)) {
    throw new Error(`Unknown content cache domain: ${domain}`);
  }
  return `content:${domain}`;
}

export function contentCacheKeyTag(domain: string, safeKey: string): ContentCacheTag {
  if (!isContentCacheDomain(domain)) {
    throw new Error(`Unknown content cache domain: ${domain}`);
  }
  if (!isValidCacheKey(safeKey)) {
    throw new Error(`Refusing to build unsafe content cache key: ${safeKey}`);
  }
  return `content:${domain}:${safeKey}`;
}
