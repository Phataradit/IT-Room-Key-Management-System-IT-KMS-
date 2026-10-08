import type { UserRole } from "@prisma/client";

const roleLabels = {
  SCHOOL_STUDENT: "นักเรียน",
  STUDENT: "นักศึกษา",
  TEACHER: "คุณครู",
  ADMIN: "Admin",
} satisfies Record<UserRole, string>;

export function getRoleLabel(role: UserRole) {
  return roleLabels[role];
}

export function isStudentRole(role: UserRole) {
  return role === "SCHOOL_STUDENT" || role === "STUDENT";
}
