import { UserRole } from "@prisma/client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { requireUser } from "@/lib/auth/guards";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function NotificationsPage() {
  const user = await requireUser();
  return (
    <DashboardShell userName={user.name} roleLabel={getRoleLabel(user.role)} active="notifications">
      <NotificationCenter isAdmin={user.role === UserRole.ADMIN} />
    </DashboardShell>
  );
}
