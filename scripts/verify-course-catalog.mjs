import { PrismaClient } from "@prisma/client";
import { initialCourses } from "../prisma/course-catalog.mjs";

const prisma = new PrismaClient();

try {
  const requestedCodes = ["21910-2021", "21910-1001", "21910-1002", "00000-0000"];
  const [count, matches, expectedCourse, requestedCourses, unknownCourse, scheduleCount, linkedScheduleCount, unlinkedScheduleCount, linkedSchedules] = await Promise.all([
    prisma.course.count(),
    prisma.course.findMany({
      where: { courseCode: { in: initialCourses.map(({ courseCode }) => courseCode) } },
      select: { courseCode: true },
    }),
    prisma.course.findUnique({
      where: { courseCode: "21910-2021" },
      select: { courseCode: true, courseName: true },
    }),
    prisma.course.findMany({
      where: { courseCode: { in: requestedCodes } },
      select: { courseCode: true, courseName: true },
      orderBy: { courseCode: "asc" },
    }),
    prisma.course.findUnique({
      where: { courseCode: "99999-9999" },
      select: { courseCode: true, courseName: true },
    }),
    prisma.roomSchedule.count(),
    prisma.roomSchedule.count({ where: { courseId: { not: null } } }),
    prisma.roomSchedule.count({ where: { courseCode: { not: null }, courseId: null } }),
    prisma.roomSchedule.findMany({
      where: { courseId: { not: null } },
      select: { courseCode: true, course: { select: { courseCode: true } } },
    }),
  ]);

  if (count !== 37 || matches.length !== 37) {
    throw new Error(`Expected 37 seeded courses, found ${count} total and ${matches.length} from seed list.`);
  }
  if (expectedCourse?.courseName !== "สื่อโมชันกราฟิก") {
    throw new Error(`Unexpected 21910-2021 result: ${expectedCourse?.courseName ?? "not found"}`);
  }
  if (requestedCourses.length !== requestedCodes.length || requestedCourses.some(({ courseCode }) => typeof courseCode !== "string")) {
    throw new Error("One or more required course codes are missing or not stored as strings.");
  }
  if (unknownCourse !== null) throw new Error("Unknown code 99999-9999 unexpectedly matched a course.");
  const relationshipMismatches = linkedSchedules.filter(({ courseCode, course }) => courseCode !== course.courseCode).length;
  if (relationshipMismatches) throw new Error(`${relationshipMismatches} schedules link to a different course code.`);

  console.info(JSON.stringify({
    database: "PostgreSQL",
    courseCount: count,
    distinctSeedCourseCodes: new Set(matches.map(({ courseCode }) => courseCode)).size,
    requestedLookups: requestedCourses,
    unknownCode: "99999-9999",
    unknownCodeMatched: unknownCourse !== null,
    schedules: { total: scheduleCount, linkedToCourse: linkedScheduleCount, courseCodeWithoutLink: unlinkedScheduleCount, relationshipMismatches },
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
