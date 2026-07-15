import { audit, clearAdminCookie, json, requireAdmin, verifyCsrf } from "@/app/lib/server";

export async function POST(request: Request) {
  const admin = await requireAdmin({ allowPasswordChangeRequired: true });
  if (!admin.ok) return json({ error: admin.error }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });
  await audit(admin.session.email, "ADMIN_LOGOUT", "Admin", admin.session.email);
  await clearAdminCookie();
  return json({ success: true });
}
