import { requireUser } from "@/lib/auth/guards";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getRoleLabel } from "@/lib/auth/roles";
import { AdminDashboardHome } from "@/components/dashboard/admin-dashboard-home";

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") {
    return <AdminDashboardHome userName={user.name ?? "ผู้ดูแลระบบ"} />;
  }
  return <DashboardView userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} userRole={user.role} />;
}
