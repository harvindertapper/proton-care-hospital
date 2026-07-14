import { redirect } from "next/navigation";
import { AdminConsole } from "@/app/components/AdminConsole";
import { departments, doctors } from "@/app/lib/data";
import { query, verifyAdminSession } from "@/app/lib/server";

export const dynamic = "force-dynamic";

async function rows(statement: string) {
  try {
    const result = await query<Record<string, string | number | null>>(statement);
    return result.results || [];
  } catch {
    return [];
  }
}

async function loadData() {
  const [
    appointments,
    timings,
    doctorProfiles,
    revisions,
    feedback,
    contacts,
    blogs,
    jobs,
    videos,
    media,
    audits,
  ] = await Promise.all([
    rows("SELECT * FROM appointments ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM department_timings ORDER BY department_name"),
    rows("SELECT * FROM doctor_profiles ORDER BY name"),
    rows("SELECT * FROM content_revisions ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM career_jobs ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM patient_videos ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 100"),
    rows("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 120"),
  ]);
  return { appointments, timings, doctors: doctorProfiles, revisions, feedback, contacts, blogs, jobs, videos, media, audits };
}

export default async function AdminPage() {
  const session = await verifyAdminSession();
  if (!session) redirect("/admin/login");

  const data = await loadData();
  if (session.role !== "SUPER_ADMIN") {
    data.appointments = data.appointments.map((app: any) => ({
      ...app,
      concern: "[REDACTED - SUPER ADMIN ONLY]",
    }));
  }
  return <AdminConsole session={session} data={data} departments={departments} staticDoctors={doctors} />;
}
