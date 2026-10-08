import { requireUser } from "@/lib/auth/guards";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function DashboardPage() {
  const user = await requireUser();
  return <DashboardView userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} />;
}
