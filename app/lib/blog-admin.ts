import { generateR2MediaUrl, validatePublicPath } from "./media-resolver.ts";

export type MediaRelationValidation =
  | { ok: true }
  | { ok: false; error: string };

export type BlogQueryFn = (
  sql: string,
  ...binds: unknown[]
) => Promise<{ results?: Record<string, unknown>[] }>;

export type BlogRunFn = (
  sql: string,
  ...binds: unknown[]
) => Promise<{ success?: boolean; meta?: { changes?: number } }>;

export type BlogAuditFn = (
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: string,
) => Promise<void> | void;

export type BlogRepo = {
  query: BlogQueryFn;
  run: BlogRunFn;
  audit: BlogAuditFn;
};

export type LoadedBlog = {
  id: string;
  slug: string;
  version: number;
  deleted_at: string | null;
  is_visible: number;
  is_deleted: number;
  cover_media_id: string | null;
};

export async function loadBlog(
  repo: BlogRepo,
  slug: string,
): Promise<LoadedBlog | null> {
  const rows = await repo.query(
    "SELECT id, slug, version, deleted_at, is_visible, is_deleted, cover_media_id FROM blog_posts WHERE slug = ? LIMIT 1",
    slug,
  );
  if (!rows.results?.length) return null;
  const row = rows.results[0];
  return {
    id: String(row.id),
    slug: String(row.slug),
    version: Number(row.version),
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    is_visible: Number(row.is_visible),
    is_deleted: Number(row.is_deleted),
    cover_media_id: row.cover_media_id ? String(row.cover_media_id) : null,
  };
}

export async function validateBlogMediaRelation(
  repo: BlogRepo,
  coverMediaId: string | null,
  isBlogVisible: boolean,
): Promise<MediaRelationValidation> {
  if (!coverMediaId) return { ok: true };

  const rows = await repo.query(
    `SELECT id, category, lifecycle_status, status, is_visible, deleted_at,
            storage_type, r2_key, public_path, display_r2_key, display_public_path
     FROM media_assets
     WHERE id = ?
     LIMIT 1`,
    coverMediaId,
  );

  const media = rows.results?.[0];
  if (!media) {
    return { ok: false, error: "Selected blog cover was not found." };
  }

  if (media.deleted_at) {
    return { ok: false, error: "Selected blog cover is archived or unavailable." };
  }

  if (String(media.category) !== "BLOG") {
    return { ok: false, error: "Selected media must be in the Blog category." };
  }

  if (isBlogVisible) {
    if (
      String(media.lifecycle_status) !== "PUBLISHED" ||
      String(media.status) !== "APPROVED" ||
      Number(media.is_visible) !== 1
    ) {
      return {
        ok: false,
        error:
          "Publish and approve the selected blog cover before using it on a visible post.",
      };
    }
  }

  const storageType = String(media.storage_type);
  if (storageType !== "R2" && storageType !== "PUBLIC") {
    return { ok: false, error: "Selected blog cover does not have a valid storage type." };
  }

  if (storageType === "R2") {
    const r2Key = String(media.r2_key || "");
    const keyResult = generateR2MediaUrl(r2Key);
    if (!keyResult.ok) {
      return { ok: false, error: "Selected blog cover does not have a valid public media location." };
    }
    const displayKey = media.display_r2_key ? String(media.display_r2_key) : null;
    if (displayKey) {
      const displayResult = generateR2MediaUrl(displayKey);
      if (!displayResult.ok) {
        return { ok: false, error: "Selected blog cover does not have a valid public media location." };
      }
    }
  }

  if (storageType === "PUBLIC") {
    const publicPath = media.public_path ? String(media.public_path) : null;
    const displayPath = media.display_public_path ? String(media.display_public_path) : null;
    const path = displayPath || publicPath;
    if (!path) {
      return { ok: false, error: "Selected blog cover does not have a valid public media location." };
    }
    const pathResult = validatePublicPath(path);
    if (!pathResult.ok) {
      return { ok: false, error: "Selected blog cover does not have a valid public media location." };
    }
  }

  return { ok: true };
}
