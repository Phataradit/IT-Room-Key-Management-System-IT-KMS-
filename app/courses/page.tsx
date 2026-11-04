import { DashboardShell } from "@/components/layout/dashboard-shell";
import { CourseSearch } from "@/components/courses/course-search";
import { requireUser } from "@/lib/auth/guards";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function CoursesPage() {
  const user = await requireUser();
  return (
    <DashboardShell userName={user.name} roleLabel={getRoleLabel(user.role)} active="courses">
      <CourseSearch />
    </DashboardShell>
  );
}
