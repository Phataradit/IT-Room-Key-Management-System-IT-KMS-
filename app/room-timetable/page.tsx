import { DashboardShell } from "@/components/layout/dashboard-shell";
import { RoomTimetableView } from "@/components/room-timetable/room-timetable-view";
import { requireUser } from "@/lib/auth/guards";
import { getRoleLabel } from "@/lib/auth/roles";
import { mondayOfWeek, bangkokDateStamp } from "@/lib/room-timetable/time.mjs";

export const instant = false;

export default async function RoomTimetablePage() {
  const user = await requireUser();
  const initialWeekStart = mondayOfWeek(bangkokDateStamp(new Date()));
  return (
    <DashboardShell userName={user.name} roleLabel={getRoleLabel(user.role)} active="room-timetable">
      <RoomTimetableView actorRole={user.role} initialWeekStart={initialWeekStart} />
    </DashboardShell>
  );
}
