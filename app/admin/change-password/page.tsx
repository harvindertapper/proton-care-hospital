import { redirect } from "next/navigation";
import { AdminPasswordChangeForm } from "@/app/components/AdminConsole";
import { verifyAdminSession } from "@/app/lib/server";

export const dynamic = "force-dynamic";

export default async function AdminChangePasswordPage() {
  const session = await verifyAdminSession();
  if (!session) redirect("/admin/login");
  if (!session.mustChangePassword) redirect("/admin");

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <div>
          <h1>Change temporary password</h1>
          <p>Choose a private passphrase of 15 to 128 characters.</p>
        </div>
        <AdminPasswordChangeForm csrf={session.csrf} mandatory />
      </section>
    </main>
  );
}
