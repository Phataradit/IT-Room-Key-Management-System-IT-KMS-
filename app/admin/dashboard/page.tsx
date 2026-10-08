import { requireRole } from "@/lib/auth/guards";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const instant = false;

export default async function AdminDashboardPage() {
  const user = await requireRole(["ADMIN"]);
  return <DashboardView userName={user.name ?? "ผู้ดูแลระบบ"} roleLabel="ผู้ดูแลระบบ" />;
}
