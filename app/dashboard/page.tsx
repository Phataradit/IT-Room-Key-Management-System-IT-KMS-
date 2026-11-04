import { requireUser } from "@/lib/auth/guards";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getRoleLabel } from "@/lib/auth/roles";
import { AdminDashboardView } from "@/components/dashboard/admin-dashboard-view";

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") {
    return <AdminDashboardView userName={user.name ?? "ผู้ดูแลระบบ"} />;
  }
  return <DashboardView userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} />;
}
