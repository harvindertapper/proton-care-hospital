import { MutationConflictError, MutationNotFoundError } from "./mutation-result.ts";
import { generateR2MediaUrl, validatePublicPath } from "./media-resolver.ts";

export const ARCHIVED_BLOG_SAVE_ERROR = "Cannot modify a deleted blog post. Restore it first.";

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

export async function createBlog(
  repo: BlogRepo,
  slug: string,
  fields: {
    title: string;
    excerpt: string;
    body: string;
    coverMediaId: string | null;
    isVisible: boolean;
  },
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const id = `blog-${slug}`;
  const status = fields.isVisible ? "APPROVED" : "NEEDS_REVIEW";
  const isVisible = fields.isVisible ? 1 : 0;

  let result: { success?: boolean; meta?: { changes?: number } };
  try {
    result = await repo.run(
      `INSERT INTO blog_posts (id, slug, title, excerpt, body, cover_media_id, status, is_visible, source_note, lifecycle_status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin-approved', 'PUBLISHED', 1)`,
      id, slug, fields.title, fields.excerpt, fields.body, fields.coverMediaId,
      status, isVisible,
    );
  } catch (err) {
    const existing = await loadBlog(repo, slug);
    if (existing) {
      throw new MutationConflictError("A blog with this slug was created by another session.");
    }
    throw err;
  }
  if (Number(result.meta?.changes || 0) < 1) {
    const existing = await loadBlog(repo, slug);
    if (existing) {
      throw new MutationConflictError("A blog with this slug was created by another session.");
    }
    throw new Error("Blog post creation failed unexpectedly.");
  }
  await repo.audit(actorEmail, "BLOG_APPROVED", "BlogPost", slug, fields.title);
  return { outcome: "APPLIED" };
}

export async function updateBlog(
  repo: BlogRepo,
  slug: string,
  expectedVersion: number,
  fields: {
    title: string;
    excerpt: string;
    body: string;
    coverMediaId: string | null;
    coverMediaIdExplicitlyProvided: boolean;
    isVisible: boolean;
  },
  actorEmail: string,
): Promise<{ outcome: "APPLIED" }> {
  const current = await loadBlog(repo, slug);
  if (!current) throw new MutationNotFoundError("Blog post");
  if (current.is_deleted) {
    throw new MutationNotFoundError("Blog post");
  }
  if (current.version !== expectedVersion) {
    throw new MutationConflictError("Blog post was modified by another session. Refresh and try again.");
  }

  const effectiveCoverMediaId = fields.coverMediaIdExplicitlyProvided
    ? fields.coverMediaId
    : current.cover_media_id;

  const result = await repo.run(
    `UPDATE blog_posts SET title = ?, excerpt = ?, body = ?, cover_media_id = ?,
      status = ?, is_visible = ?, version = version + 1
     WHERE slug = ? AND version = ? AND is_deleted = 0`,
    fields.title, fields.excerpt, fields.body, effectiveCoverMediaId,
    fields.isVisible ? "APPROVED" : "NEEDS_REVIEW",
    fields.isVisible ? 1 : 0,
    slug, expectedVersion,
  );
  if (Number(result.meta?.changes || 0) < 1) {
    const recheck = await loadBlog(repo, slug);
    if (!recheck || recheck.is_deleted) {
      throw new MutationNotFoundError("Blog post");
    }
    throw new MutationConflictError("Blog post was modified by another session. Refresh and try again.");
  }
  await repo.audit(actorEmail, "BLOG_APPROVED", "BlogPost", slug, fields.title);
  return { outcome: "APPLIED" };
}
