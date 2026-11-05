import { StatisticsView } from "@/components/dashboard/statistics-view";
import { requireRole } from "@/lib/auth/guards";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function StatisticsPage() {
  const user = await requireRole(["ADMIN", "TEACHER"]);
  return (
    <StatisticsView
      userName={user.name ?? "ผู้ใช้งาน"}
      userRole={user.role}
      roleLabel={getRoleLabel(user.role)}
    />
  );
}
