import { requireRole } from "@/lib/auth/guards";
import { AdminDashboardView } from "@/components/dashboard/admin-dashboard-view";

export const instant = false;

export default async function AdminDashboardPage() {
  const user = await requireRole(["ADMIN"]);
  return <AdminDashboardView userName={user.name ?? "ผู้ดูแลระบบ"} />;
}
