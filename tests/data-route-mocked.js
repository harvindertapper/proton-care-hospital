import { query, requireAdmin, json } from "./server-mocked.js";

export async function dashboardData(session) {
  const appointments = await query("SELECT * FROM appointments");
  let rawAppointments = appointments.results || [];
  if (session.role !== "SUPER_ADMIN") {
    const sensitiveSlugs = new Set(["psychiatry", "obstetrics-and-gynecology", "emergency-triage", "emergency-medicine"]);
    rawAppointments = rawAppointments.map((app) => ({
      ...app,
      concern: sensitiveSlugs.has(app.department_slug) ? "[REDACTED - SENSITIVE DEPT]" : app.concern,
    }));
  }
  return { appointments: rawAppointments };
}

export async function GET(request) {
  const admin = await requireAdmin();
  if (!admin.ok) return json({ error: admin.error }, { status: admin.status });
  const data = await dashboardData(admin.session);
  return json({ success: true, data });
}
