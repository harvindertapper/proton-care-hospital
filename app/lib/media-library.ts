/**
 * Storage-aware Media Library domain module.
 *
 * Pure runtime-safe TypeScript — no Node-only, React, or test imports.
 */

import {
  MEDIA_CATEGORIES,
  MEDIA_RIGHTS_STATUSES,
  GALLERY_LIFECYCLE_STATUSES,
  isPublicStorage,
} from "./media-schema";

/* ───────────────────────────────────────────────────────────────────────────
   Constants
   ─────────────────────────────────────────────────────────────────────────── */

export type StorageType = string;
export type MediaCategory = string;
export type RightsStatus = string;
export type PurgeStatus = string;
export type LifecycleStatus = string;

export const EDITABLE_FIELDS = [
  "title",
  "altText",
  "caption",
  "category",
  "rightsStatus",
  "rightsSource",
  "sourceUrl",
  "status",
  "isVisible",
  "lifecycleStatus",
] as const;

export const FIELD_LENGTHS: Record<string, number> = {
  title: 200,
  altText: 300,
  caption: 1000,
  rightsSource: 600,
  sourceUrl: 1000,
};

export const VALID_STATUSES = ["NEW", "NEEDS_REVIEW", "APPROVED", "HIDDEN"] as const;
export type MediaStatus = (typeof VALID_STATUSES)[number];

/* ───────────────────────────────────────────────────────────────────────────
   PUBLIC path validation
   ─────────────────────────────────────────────────────────────────────────── */

export type PathValidationResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Validate a PUBLIC storage path. Must be an absolute site-local asset path.
 * The `public:` r2_key locator is never a browser URL.
 */
export function validatePublicPath(raw: unknown): PathValidationResult {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: "Public path is required." };
  }

  if (raw.includes("\\")) {
    return { ok: false, error: "Public path must not contain backslashes." };
  }

  if (raw.startsWith("//")) {
    return { ok: false, error: "Public path must not be protocol-relative." };
  }

  if (!raw.startsWith("/assets/")) {
    return { ok: false, error: "Public path must start with /assets/." };
  }

  const segments = raw.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      return { ok: false, error: "Public path must not contain .. segments." };
    }
  }

  // Reject URL protocols embedded anywhere
  if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return { ok: false, error: "Public path must not contain a URL protocol." };
  }

  // Reject query strings and fragments
  if (raw.includes("?") || raw.includes("#")) {
    return { ok: false, error: "Public path must not contain query or fragment." };
  }

  return { ok: true, path: raw };
}

/* ───────────────────────────────────────────────────────────────────────────
   R2 URL generation
   ─────────────────────────────────────────────────────────────────────────── */

export type UrlGenerationResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Generate an R2 media gateway URL from an r2_key.
 * Encodes each path segment independently while preserving / separators.
 */
export function generateR2MediaUrl(r2Key: string): UrlGenerationResult {
  if (typeof r2Key !== "string" || r2Key.length === 0) {
    return { ok: false, error: "R2 key is required." };
  }

  // Reject public: locator keys
  if (r2Key.startsWith("public:")) {
    return { ok: false, error: "public: locator keys cannot produce R2 URLs." };
  }

  // Reject absolute/protocol URLs
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(r2Key)) {
    return { ok: false, error: "R2 key must not be an absolute URL." };
  }

  // Reject backslashes
  if (r2Key.includes("\\")) {
    return { ok: false, error: "R2 key must not contain backslashes." };
  }

  const segments = r2Key.split("/");
  const encoded: string[] = [];

  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      return { ok: false, error: "R2 key contains invalid path segments." };
    }
    encoded.push(encodeURIComponent(seg));
  }

  return { ok: true, url: `/api/media/${encoded.join("/")}` };
}

/* ───────────────────────────────────────────────────────────────────────────
   URL fallback resolver
   ─────────────────────────────────────────────────────────────────────────── */

export type ResolvedUrls = {
  originalUrl: string | null;
  displayUrl: string | null;
  thumbnailUrl: string | null;
};

export type UrlResolutionResult =
  | { ok: true; urls: ResolvedUrls }
  | { ok: false; error: string };

/**
 * Resolve media URLs based on storage type.
 * PUBLIC rows never fall back to R2 keys; R2 rows never fall back to public paths.
 */
export function resolveMediaUrls(row: {
  storage_type: string;
  r2_key: string;
  public_path: string | null;
  display_r2_key: string | null;
  display_public_path: string | null;
  thumbnail_r2_key: string | null;
  thumbnail_public_path: string | null;
}): UrlResolutionResult {
  if (isPublicStorage(row.storage_type)) {
    return resolvePublicUrls(row);
  }
  return resolveR2Urls(row);
}

function resolvePublicUrls(row: {
  public_path: string | null;
  display_public_path: string | null;
  thumbnail_public_path: string | null;
}): UrlResolutionResult {
  if (!row.public_path) {
    return { ok: false, error: "PUBLIC asset missing public_path." };
  }

  const originalValidation = validatePublicPath(row.public_path);
  if (!originalValidation.ok) {
    return { ok: false, error: `Invalid public_path: ${originalValidation.error}` };
  }

  const originalUrl = originalValidation.path;

  // Display fallback: display_public_path → public_path
  let displayUrl = originalUrl;
  if (row.display_public_path) {
    const dv = validatePublicPath(row.display_public_path);
    if (dv.ok) displayUrl = dv.path;
  }

  // Thumbnail fallback: thumbnail_public_path → display → original
  let thumbnailUrl = displayUrl;
  if (row.thumbnail_public_path) {
    const tv = validatePublicPath(row.thumbnail_public_path);
    if (tv.ok) thumbnailUrl = tv.path;
  }

  return { ok: true, urls: { originalUrl, displayUrl, thumbnailUrl } };
}

function resolveR2Urls(row: {
  r2_key: string;
  display_r2_key: string | null;
  thumbnail_r2_key: string | null;
}): UrlResolutionResult {
  const originalResult = generateR2MediaUrl(row.r2_key);
  if (!originalResult.ok) return originalResult;
  const originalUrl = originalResult.url;

  // Display fallback: display_r2_key → original
  let displayUrl = originalUrl;
  if (row.display_r2_key) {
    const dv = generateR2MediaUrl(row.display_r2_key);
    if (dv.ok) displayUrl = dv.url;
  }

  // Thumbnail fallback: thumbnail_r2_key → display → original
  let thumbnailUrl = displayUrl;
  if (row.thumbnail_r2_key) {
    const tv = generateR2MediaUrl(row.thumbnail_r2_key);
    if (tv.ok) thumbnailUrl = tv.url;
  }

  return { ok: true, urls: { originalUrl, displayUrl, thumbnailUrl } };
}

/* ───────────────────────────────────────────────────────────────────────────
   Admin DTO
   ─────────────────────────────────────────────────────────────────────────── */

export type AdminMediaDto = {
  id: string;
  storageType: string;
  category: string;
  purpose: string;
  title: string;
  altText: string;
  caption: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  rightsStatus: string;
  rightsSource: string;
  sourceUrl: string | null;
  status: string;
  isVisible: number;
  lifecycleStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  purgeStatus: string;
  originalUrl: string | null;
  displayUrl: string | null;
  thumbnailUrl: string | null;
};

export type AdminDtoResult =
  | { ok: true; dto: AdminMediaDto }
  | { ok: false; error: string };

export function toAdminDto(row: {
  id: string;
  storage_type: string;
  category: string;
  purpose: string;
  title: string;
  alt_text: string;
  caption: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  rights_status: string;
  rights_source: string;
  source_url: string | null;
  status: string;
  is_visible: number;
  lifecycle_status: string;
  version: number;
  created_at: string;
  updated_at: string | null;
  published_at: string | null;
  deleted_at: string | null;
  purge_status: string;
  r2_key: string;
  public_path: string | null;
  display_r2_key: string | null;
  display_public_path: string | null;
  thumbnail_r2_key: string | null;
  thumbnail_public_path: string | null;
}): AdminDtoResult {
  const urlResult = resolveMediaUrls(row);
  if (!urlResult.ok) {
    return { ok: false, error: urlResult.error };
  }

  return {
    ok: true,
    dto: {
      id: row.id,
      storageType: row.storage_type,
      category: row.category,
      purpose: row.purpose,
      title: row.title,
      altText: row.alt_text,
      caption: row.caption,
      fileName: row.file_name,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      width: row.width,
      height: row.height,
      rightsStatus: row.rights_status,
      rightsSource: row.rights_source,
      sourceUrl: row.source_url,
      status: row.status,
      isVisible: row.is_visible,
      lifecycleStatus: row.lifecycle_status,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
      deletedAt: row.deleted_at,
      purgeStatus: row.purge_status,
      originalUrl: urlResult.urls.originalUrl,
      displayUrl: urlResult.urls.displayUrl,
      thumbnailUrl: urlResult.urls.thumbnailUrl,
    },
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   Explicit column list for the Media Library query
   ─────────────────────────────────────────────────────────────────────────── */

export const MEDIA_LIBRARY_COLUMNS = [
  "id",
  "r2_key",
  "file_name",
  "content_type",
  "size_bytes",
  "purpose",
  "uploaded_by",
  "consent_note",
  "status",
  "is_visible",
  "created_at",
  "lifecycle_status",
  "version",
  "deleted_at",
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
] as const;

export const MEDIA_LIBRARY_SELECT = MEDIA_LIBRARY_COLUMNS.join(", ");

/* ───────────────────────────────────────────────────────────────────────────
   Input validation helpers
   ─────────────────────────────────────────────────────────────────────────── */

export function isValidLifecycleStatus(v: string): v is LifecycleStatus {
  return GALLERY_LIFECYCLE_STATUSES.has(v);
}

export function isValidMediaCategory(v: string): v is MediaCategory {
  return MEDIA_CATEGORIES.has(v);
}

export function isValidRightsStatus(v: string): v is RightsStatus {
  return MEDIA_RIGHTS_STATUSES.has(v);
}

export function isValidMediaStatus(v: string): v is MediaStatus {
  return (VALID_STATUSES as readonly string[]).includes(v);
}

/** Source URL: must be null, empty, or valid http/https URL. */
export function validateSourceUrl(raw: unknown): { ok: boolean; error?: string } {
  if (raw === null || raw === undefined) return { ok: true };
  if (typeof raw !== "string") return { ok: false, error: "sourceUrl must be a string." };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "sourceUrl must use http or https protocol." };
    }
  } catch {
    return { ok: false, error: "sourceUrl is not a valid URL." };
  }
  return { ok: true };
}

/** Escape LIKE wildcards so user input is treated as literal text. */
export function escapeLikeWildcard(input: string): string {
  return input.replace(/%/g, "\\%").replace(/_/g, "\\_");
}
