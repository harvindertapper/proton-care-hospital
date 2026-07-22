import type { Doctor } from "./data.ts";

export type DoctorQuery = (
  sql: string,
  ...binds: unknown[]
) => Promise<{ results?: Record<string, unknown>[] }>;

export const DOCTOR_LIST_SQL = `SELECT
  dp.slug, dp.name, dp.speciality, dp.qualification, dp.department_slug, dp.photo_url,
  dp.photo_media_id,
  ma.id AS ma_id, ma.r2_key AS ma_r2_key, ma.display_r2_key AS ma_display_r2_key,
  ma.thumbnail_r2_key AS ma_thumbnail_r2_key, ma.storage_type AS ma_storage_type,
  ma.public_path AS ma_public_path, ma.display_public_path AS ma_display_public_path,
  ma.thumbnail_public_path AS ma_thumbnail_public_path,
  ma.lifecycle_status AS ma_lifecycle_status, ma.status AS ma_status,
  ma.is_visible AS ma_is_visible, ma.deleted_at AS ma_deleted_at
FROM doctor_profiles dp
LEFT JOIN media_assets ma ON dp.photo_media_id = ma.id
WHERE dp.lifecycle_status = 'PUBLISHED' AND dp.status = 'APPROVED' AND dp.is_visible = 1 AND dp.is_deleted = 0 AND dp.deleted_at IS NULL
ORDER BY dp.name`;

export const DOCTOR_BY_SLUG_SQL = `SELECT
  dp.slug, dp.name, dp.speciality, dp.qualification, dp.department_slug, dp.photo_url,
  dp.photo_media_id,
  ma.id AS ma_id, ma.r2_key AS ma_r2_key, ma.display_r2_key AS ma_display_r2_key,
  ma.thumbnail_r2_key AS ma_thumbnail_r2_key, ma.storage_type AS ma_storage_type,
  ma.public_path AS ma_public_path, ma.display_public_path AS ma_display_public_path,
  ma.thumbnail_public_path AS ma_thumbnail_public_path,
  ma.lifecycle_status AS ma_lifecycle_status, ma.status AS ma_status,
  ma.is_visible AS ma_is_visible, ma.deleted_at AS ma_deleted_at
FROM doctor_profiles dp
LEFT JOIN media_assets ma ON dp.photo_media_id = ma.id
WHERE dp.slug = ? AND dp.lifecycle_status = 'PUBLISHED' AND dp.status = 'APPROVED' AND dp.is_visible = 1 AND dp.is_deleted = 0 AND dp.deleted_at IS NULL
LIMIT 1`;

function isMediaEligible(row: Record<string, unknown>): boolean {
  if (!row.ma_id) return false;
  if (row.ma_deleted_at) return false;
  if (String(row.ma_lifecycle_status) !== "PUBLISHED") return false;
  if (String(row.ma_status) !== "APPROVED") return false;
  if (Number(row.ma_is_visible) !== 1) return false;
  if (String(row.ma_storage_type) !== "R2" && String(row.ma_storage_type) !== "PUBLIC") return false;
  return true;
}

function generateR2MediaUrlInline(r2Key: string): string | null {
  if (!r2Key || r2Key.startsWith("public:") || /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(r2Key) || r2Key.includes("\\")) {
    return null;
  }
  const segments = r2Key.split("/");
  const encoded: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return null;
    encoded.push(encodeURIComponent(seg));
  }
  return `/api/media/${encoded.join("/")}`;
}

function resolvePhotoFromMedia(row: Record<string, unknown>): string | undefined {
  const storageType = String(row.ma_storage_type);
  if (storageType === "R2") {
    const r2Key = String(row.ma_r2_key || "");
    const url = generateR2MediaUrlInline(r2Key);
    if (!url) return undefined;
    const displayKey = row.ma_display_r2_key ? String(row.ma_display_r2_key) : null;
    if (displayKey) {
      const displayUrl = generateR2MediaUrlInline(displayKey);
      if (displayUrl) return displayUrl;
    }
    return url;
  }
  if (storageType === "PUBLIC") {
    const publicPath = row.ma_public_path ? String(row.ma_public_path) : null;
    const displayPath = row.ma_display_public_path ? String(row.ma_display_public_path) : null;
    return displayPath || publicPath || undefined;
  }
  return undefined;
}

export function dbDoctorToPublic(row: Record<string, unknown>): Doctor {
  const photoMediaId = row.photo_media_id ? String(row.photo_media_id) : null;
  let photo: string | undefined;

  if (photoMediaId) {
    if (isMediaEligible(row)) {
      photo = resolvePhotoFromMedia(row);
    } else {
      photo = undefined;
    }
  } else {
    photo = row.photo_url ? String(row.photo_url) : undefined;
  }

  return {
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    speciality: String(row.speciality || ""),
    qualification: row.qualification ? String(row.qualification) : undefined,
    departmentSlug: String(row.department_slug || ""),
    photo,
  };
}

export async function resolvePublicDoctors(queryFn: DoctorQuery): Promise<Doctor[]> {
  try {
    const rows = await queryFn(DOCTOR_LIST_SQL);
    return (rows.results || []).map(dbDoctorToPublic);
  } catch {
    console.error("Failed to load public doctors from D1; returning empty list.");
    return [];
  }
}

export async function resolveDoctorBySlug(
  queryFn: DoctorQuery,
  slug: string,
): Promise<Doctor | null> {
  try {
    const rows = await queryFn(DOCTOR_BY_SLUG_SQL, slug);
    if (rows.results?.length) return dbDoctorToPublic(rows.results[0]);
  } catch {
    console.error("Failed to load doctor from D1; returning null.");
  }
  return null;
}
