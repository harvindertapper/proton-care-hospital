import type { Doctor } from "./data.ts";

export type DoctorQuery = (
  sql: string,
  ...binds: unknown[]
) => Promise<{ results?: Record<string, unknown>[] }>;

export const DOCTOR_LIST_SQL =
  "SELECT slug, name, speciality, qualification, department_slug, photo_url FROM doctor_profiles WHERE lifecycle_status = 'PUBLISHED' AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 AND deleted_at IS NULL ORDER BY name";

export const DOCTOR_BY_SLUG_SQL =
  "SELECT slug, name, speciality, qualification, department_slug, photo_url FROM doctor_profiles WHERE slug = ? AND lifecycle_status = 'PUBLISHED' AND status = 'APPROVED' AND is_visible = 1 AND is_deleted = 0 AND deleted_at IS NULL LIMIT 1";

export function dbDoctorToPublic(row: Record<string, unknown>): Doctor {
  return {
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    speciality: String(row.speciality || ""),
    qualification: row.qualification ? String(row.qualification) : undefined,
    departmentSlug: String(row.department_slug || ""),
    photo: row.photo_url ? String(row.photo_url) : undefined,
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
