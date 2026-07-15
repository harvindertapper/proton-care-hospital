import {
  audit,
  json,
  query,
  run,
  requireAdmin,
  verifyCsrf,
  hashPassword,
  verifyPassword
} from "@/app/lib/server";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return json({ error: admin.error }, { status: admin.status });
  if (!verifyCsrf(request, admin.session)) return json({ error: "Invalid CSRF token." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { oldPassword?: string; newPassword?: string };
  const oldPassword = body.oldPassword || "";
  const newPassword = body.newPassword || "";

  if (newPassword.length < 8) {
    return json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const rows = await query<{ email: string; password_hash: string }>(
    "SELECT email, password_hash FROM admin_users WHERE email = ? LIMIT 1",
    admin.session.email
  );
  const account = rows.results?.[0];

  if (!account || !(await verifyPassword(oldPassword, account.password_hash))) {
    await audit(admin.session.email, "ADMIN_PASSWORD_CHANGE_FAILED", "Admin", admin.session.email, "Incorrect old password");
    return json({ error: "Incorrect current password." }, { status: 401 });
  }

  const newHash = await hashPassword(newPassword);

  try {
    await run("UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?", newHash, admin.session.email);
    await run("UPDATE sessions SET revoked = 1 WHERE email = ?", admin.session.email);
    await audit(admin.session.email, "ADMIN_PASSWORD_CHANGED", "Admin", admin.session.email, "Password changed and sessions revoked");
    return json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return json({ error: "Failed to update password." }, { status: 500 });
  }
}
