import { defaultJobs, type Doctor } from "@/app/lib/data";
import { query } from "@/app/lib/server";
import {
  resolvePublicDoctors,
  resolveDoctorBySlug,
  dbDoctorToPublic,
  DOCTOR_LIST_SQL,
  DOCTOR_BY_SLUG_SQL,
} from "./doctor-public.ts";
import { generateR2MediaUrl, validatePublicPath } from "./media-resolver.ts";

export type PublicBlog = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  author?: string;
  reviewer?: string;
  created_at?: string;
  coverMediaUrl?: string | null;
  coverAltText?: string | null;
  coverWidth?: number | null;
  coverHeight?: number | null;
};

export type PublicJob = {
  id?: string;
  slug: string;
  title: string;
  department?: string;
  employment_type?: string;
  description?: string;
};

export type PublicReview = {
  id: string;
  patient_name: string;
  rating: number;
  message: string;
  created_at: string;
};

export type PublicVideo = {
  id: string;
  title: string;
  youtube_url: string;
  youtube_id: string;
  consent_note: string;
};

export type { DoctorQuery } from "./doctor-public.ts";
export { dbDoctorToPublic, DOCTOR_LIST_SQL, DOCTOR_BY_SLUG_SQL };

function resolveBlogCoverUrl(row: Record<string, unknown>): string | null {
  const storageType = row.cover_storage_type as string | undefined;
  if (!storageType) return null;

  if (storageType === "R2") {
    const r2Key = row.cover_r2_key as string | undefined;
    if (!r2Key) return null;
    const result = generateR2MediaUrl(r2Key);
    return result.ok ? result.url : null;
  }

  if (storageType === "PUBLIC") {
    const displayPath = row.cover_display_public_path as string | undefined;
    const publicPath = row.cover_public_path as string | undefined;
    const path = displayPath || publicPath;
    if (!path) return null;
    const result = validatePublicPath(path);
    return result.ok ? result.path : null;
  }

  return null;
}

export async function getPublicDoctors() {
  return resolvePublicDoctors(query);
}

export async function getPublishedBlogs() {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.body, bp.author, bp.reviewer, bp.created_at,
              ma.storage_type AS cover_storage_type,
              ma.r2_key AS cover_r2_key,
              ma.public_path AS cover_public_path,
              ma.display_public_path AS cover_display_public_path,
              ma.alt_text AS cover_alt_text,
              ma.width AS cover_width,
              ma.height AS cover_height
       FROM blog_posts bp
       LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id
         AND ma.deleted_at IS NULL
         AND ma.category = 'BLOG'
         AND ma.lifecycle_status = 'PUBLISHED'
         AND ma.status = 'APPROVED'
         AND ma.is_visible = 1
       WHERE bp.status = 'APPROVED' AND bp.is_visible = 1 AND bp.is_deleted = 0
         AND bp.lifecycle_status = 'PUBLISHED'
       ORDER BY bp.created_at DESC`,
    );
    if (rows.results?.length) {
      return rows.results.map((row) => ({
        id: row.id as string,
        slug: row.slug as string,
        title: row.title as string,
        excerpt: row.excerpt as string,
        body: row.body as string,
        author: row.author as string,
        reviewer: row.reviewer as string,
        created_at: row.created_at as string,
        coverMediaUrl: resolveBlogCoverUrl(row),
        coverAltText: (row.cover_alt_text as string) || null,
        coverWidth: row.cover_width != null ? Number(row.cover_width) : null,
        coverHeight: row.cover_height != null ? Number(row.cover_height) : null,
      }));
    }
  } catch {
    return [];
  }
  return [];
}

export async function getPublishedJobs() {
  try {
    const rows = await query<PublicJob>(
      "SELECT id, slug, title, department, employment_type, description FROM career_jobs WHERE status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 ORDER BY created_at DESC",
    );
    if (rows.results?.length) return rows.results;
  } catch {
    return defaultJobs.filter((item) => item.status === "approved").map((item) => ({ ...item, employment_type: item.type, description: "" }));
  }
  return defaultJobs.filter((item) => item.status === "approved").map((item) => ({ ...item, employment_type: item.type, description: "" }));
}

export async function getPublishedReviews() {
  try {
    const rows = await query<PublicReview>(
      `SELECT
        id,
        CASE
          WHEN publication_name = 'named'
            THEN patient_name
          ELSE 'Anonymous patient'
        END AS patient_name,
        rating,
        message,
        created_at
      FROM feedback
      WHERE status = 'APPROVED'
        AND is_visible = 1
        AND public_consent = 1
      ORDER BY created_at DESC
      LIMIT 9`,
    );

    return rows.results || [];
  } catch {
    return [];
  }
}

export async function getPublishedVideos() {
  try {
    const rows = await query<PublicVideo>(
      "SELECT id, title, youtube_url, youtube_id, consent_note FROM patient_videos WHERE status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 ORDER BY created_at DESC LIMIT 12",
    );
    return rows.results || [];
  } catch {
    return [];
  }
}

export async function getBlogBySlug(slug: string): Promise<PublicBlog | null> {
  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT bp.id, bp.slug, bp.title, bp.excerpt, bp.body, bp.author, bp.reviewer, bp.created_at,
              ma.storage_type AS cover_storage_type,
              ma.r2_key AS cover_r2_key,
              ma.public_path AS cover_public_path,
              ma.display_public_path AS cover_display_public_path,
              ma.alt_text AS cover_alt_text,
              ma.width AS cover_width,
              ma.height AS cover_height
       FROM blog_posts bp
       LEFT JOIN media_assets ma ON bp.cover_media_id = ma.id
         AND ma.deleted_at IS NULL
         AND ma.category = 'BLOG'
         AND ma.lifecycle_status = 'PUBLISHED'
         AND ma.status = 'APPROVED'
         AND ma.is_visible = 1
       WHERE bp.slug = ? AND bp.status = 'APPROVED' AND bp.is_visible = 1 AND bp.is_deleted = 0
         AND bp.lifecycle_status = 'PUBLISHED'`,
      slug
    );
    if (rows.results?.length) {
      const row = rows.results[0];
      return {
        id: row.id as string,
        slug: row.slug as string,
        title: row.title as string,
        excerpt: row.excerpt as string,
        body: row.body as string,
        author: row.author as string,
        reviewer: row.reviewer as string,
        created_at: row.created_at as string,
        coverMediaUrl: resolveBlogCoverUrl(row),
        coverAltText: (row.cover_alt_text as string) || null,
        coverWidth: row.cover_width != null ? Number(row.cover_width) : null,
        coverHeight: row.cover_height != null ? Number(row.cover_height) : null,
      };
    }
  } catch {
    // fallback removed — return null for missing or broken blog lookups
  }
  return null;
}

export async function getJobBySlug(slug: string): Promise<PublicJob | null> {
  try {
    const rows = await query<PublicJob>(
      "SELECT id, slug, title, department, employment_type, description FROM career_jobs WHERE slug = ? AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0",
      slug
    );
    if (rows.results?.length) return rows.results[0];
  } catch {
    // fallback
    const fallback = defaultJobs.find((item) => item.slug === slug && item.status === "approved");
    if (fallback) return { ...fallback, employment_type: fallback.type, description: fallback.title };
  }
  return null;
}

export async function getDoctorBySlug(slug: string): Promise<Doctor | null> {
  return resolveDoctorBySlug(
    query,
    slug
  );
}
