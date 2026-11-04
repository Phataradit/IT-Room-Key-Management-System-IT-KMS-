import "server-only";
import { prisma } from "@/lib/db/prisma";

export function findCourseByCode(courseCode: string) {
  return prisma.course.findFirst({
    where: { courseCode, isActive: true },
    select: { id: true, courseCode: true, courseName: true },
  });
}

export function findCoursesByCodes(courseCodes: string[]) {
  const uniqueCodes = [...new Set(courseCodes)];
  if (!uniqueCodes.length) return Promise.resolve([]);
  return prisma.course.findMany({
    where: { courseCode: { in: uniqueCodes }, isActive: true },
    select: { id: true, courseCode: true, courseName: true },
  });
}
