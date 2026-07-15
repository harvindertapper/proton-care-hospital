import {
  audit,
  json,
  query,
  requireAdmin,
  hashPassword,
  verifyPassword
} from "@/app/lib/server";

export async function POST(request: Request) {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const body = (await request.json().catch(() => ({}))) as { oldPassword?: string; newPassword?: string };
  const oldPassword = body.oldPassword || "";
  const newPassword = body.newPassword || "";

  if (newPassword.length < 8) {
    return json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const rows = await query<{ email: string; password_hash: string }>(
    "SELECT email, password_hash FROM admin_users WHERE email = ? LIMIT 1",
    session.email
  );
  const account = rows.results?.[0];

  if (!account || !(await verifyPassword(oldPassword, account.password_hash))) {
    await audit(session.email, "ADMIN_PASSWORD_CHANGE_FAILED", "Admin", session.email, "Incorrect old password");
    return json({ error: "Incorrect current password." }, { status: 401 });
  }

  const newHash = await hashPassword(newPassword);

  // Use a transaction to update password and revoke all sessions (including current one, to force re-login, or we just let them stay logged in? The plan says "Revoke all existing sessions for this email")
  await query("UPDATE admin_users SET password_hash = ? WHERE email = ?", [newHash, session.email]);
  await query("UPDATE admin_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE email = ?", session.email);

  await audit(session.email, "ADMIN_PASSWORD_CHANGED", "Admin", session.email, "Password changed and sessions revoked");

  return json({ success: true });
}
