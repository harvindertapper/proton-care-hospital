import { defaultBlogs, defaultJobs, doctors, type Doctor } from "@/app/lib/data";
import { query } from "@/app/lib/server";

export type PublicBlog = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  body?: string;
  created_at?: string;
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

function dbDoctorToPublic(row: Record<string, unknown>): Doctor {
  return {
    slug: String(row.slug || ""),
    name: String(row.name || ""),
    speciality: String(row.speciality || ""),
    qualification: row.qualification ? String(row.qualification) : undefined,
    departmentSlug: String(row.department_slug || ""),
    photo: row.photo_url ? String(row.photo_url) : undefined,
  };
}

export async function getPublicDoctors() {
  try {
    const rows = await query<Record<string, unknown>>(
      "SELECT slug, name, speciality, qualification, department_slug, photo_url FROM doctor_profiles WHERE status = 'APPROVED' AND is_visible = 1 ORDER BY name",
    );
    if (rows.results?.length) return rows.results.map(dbDoctorToPublic);
  } catch {
    return doctors;
  }
  return doctors;
}

export async function getPublishedBlogs() {
  try {
    const rows = await query<PublicBlog>(
      "SELECT id, slug, title, excerpt, body, created_at FROM blog_posts WHERE status = 'APPROVED' AND is_visible = 1 ORDER BY created_at DESC",
    );
    if (rows.results?.length) return rows.results;
  } catch {
    return defaultBlogs.filter((item) => item.status === "approved").map((item) => ({ ...item, body: "" }));
  }
  return defaultBlogs.filter((item) => item.status === "approved").map((item) => ({ ...item, body: "" }));
}

export async function getPublishedJobs() {
  try {
    const rows = await query<PublicJob>(
      "SELECT id, slug, title, department, employment_type, description FROM career_jobs WHERE status = 'APPROVED' AND is_visible = 1 ORDER BY created_at DESC",
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
      "SELECT id, patient_name, rating, message, created_at FROM feedback WHERE status = 'APPROVED' AND is_visible = 1 ORDER BY created_at DESC LIMIT 9",
    );
    return rows.results || [];
  } catch {
    return [];
  }
}

export async function getPublishedVideos() {
  try {
    const rows = await query<PublicVideo>(
      "SELECT id, title, youtube_url, youtube_id, consent_note FROM patient_videos WHERE status = 'APPROVED' AND is_visible = 1 ORDER BY created_at DESC LIMIT 12",
    );
    return rows.results || [];
  } catch {
    return [];
  }
}
