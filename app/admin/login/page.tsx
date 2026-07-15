import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/app/components/AdminConsole";
import { verifyAdminSession } from "@/app/lib/server";

export default async function AdminLoginPage() {
  const session = await verifyAdminSession();
  if (session?.mustChangePassword) redirect("/admin/change-password");
  if (session) redirect("/admin");

  return (
    <main className="admin-login-page">
      <AdminLoginForm />
    </main>
  );
}
