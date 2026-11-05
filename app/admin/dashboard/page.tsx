import { requireRole } from "@/lib/auth/guards";
import { AdminDashboardHome } from "@/components/dashboard/admin-dashboard-home";

export const instant = false;

export default async function AdminDashboardPage() {
  const user = await requireRole(["ADMIN"]);
  return <AdminDashboardHome userName={user.name ?? "ผู้ดูแลระบบ"} />;
}
