import { redirect } from "next/navigation";
import { AdminConsole } from "@/app/components/AdminConsole";
import { departments, doctors } from "@/app/lib/data";
import { query, verifyAdminSession } from "@/app/lib/server";

export const dynamic = "force-dynamic";

async function rows(statement: string, ...binds: unknown[]) {
  try {
    const result = await query<Record<string, string | number | null>>(statement, ...binds);
    return result.results || [];
  } catch {
    return [];
  }
}

async function loadData(session: { email: string; role: string }) {
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
    sessionsData,
    staffData,
    closuresData,
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
    rows("SELECT id, created_at, expires_at FROM sessions WHERE email = ? AND revoked = 0 AND expires_at > ?", session.email, Date.now()),
    session.role === "SUPER_ADMIN"
      ? rows(
          `SELECT id, email, name, role, is_active, must_change_password,
                  CASE is_active WHEN 1 THEN 'Active' ELSE 'Inactive' END AS status,
                  CASE must_change_password WHEN 1 THEN 'Password change required' ELSE 'Password set' END AS password_status,
                  created_at
           FROM admin_users WHERE role = 'STAFF' ORDER BY name`,
        )
      : Promise.resolve([]),
    rows("SELECT * FROM department_closures ORDER BY closed_date DESC LIMIT 200"),
  ]);
  return {
    appointments,
    timings,
    doctors: doctorProfiles,
    revisions,
    feedback,
    contacts,
    blogs,
    jobs,
    videos,
    media,
    audits,
    sessions: sessionsData,
    staff: staffData,
    closures: closuresData,
  };
}

export default async function AdminPage() {
  const session = await verifyAdminSession();
  if (!session) redirect("/admin/login");
  if (session.mustChangePassword) redirect("/admin/change-password");

  const data = await loadData(session);
  if (session.role !== "SUPER_ADMIN") {
    const sensitiveSlugs = new Set(["psychiatry", "obstetrics-and-gynecology", "emergency-triage", "emergency-medicine"]);
    data.appointments = data.appointments.map((app) => ({
      ...app,
      concern:
        typeof app.department_slug === "string" && sensitiveSlugs.has(app.department_slug)
          ? "[REDACTED - SENSITIVE DEPT]"
          : app.concern,
    }));
  }
  return <AdminConsole session={session} data={data} departments={departments} staticDoctors={doctors} />;
}
