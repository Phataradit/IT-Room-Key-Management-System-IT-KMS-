import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { inspectRoomSchedulePdf } from "../lib/room-timetable/pdf-import.ts";
import { applyDatabaseCourseNamesToPreview, getPreviewCourseCodes } from "../lib/courses/pdf-preview.mjs";
import { requiresTeacherConfirmation } from "../lib/room-timetable/teacher-review.mjs";

const pdfPath = process.argv[2];
if (!pdfPath) throw new Error("Pass the room timetable PDF path as the first argument.");
const roomCode = path.parse(pdfPath).name;

const prisma = new PrismaClient();
try {
  const bytes = new Uint8Array(await readFile(pdfPath));
  const preview = await inspectRoomSchedulePdf(bytes, pdfPath, () => {});
  const courseCodes = getPreviewCourseCodes(preview);
  const courses = await prisma.course.findMany({
    where: { courseCode: { in: courseCodes }, isActive: true },
    select: { courseCode: true, courseName: true },
  });
  const room = await prisma.room.findFirst({
    where: { roomCode, deletedAt: null, status: { notIn: ["DISABLED", "MAINTENANCE"] } },
    select: { id: true, roomCode: true, roomName: true },
  });
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", status: "ACTIVE", deletedAt: null },
    select: { firstName: true, lastName: true },
  });
  const previouslyImportedRows = await prisma.roomSchedule.findMany({
    where: { sourceFileHash: preview.fileHash },
    select: { sourcePage: true, sourceCellKey: true },
  });
  const previouslyImportedCellKeys = new Set(previouslyImportedRows.map(({ sourcePage, sourceCellKey }) => `${sourcePage}:${sourceCellKey}`));
  const courseNames = new Set(courses.map(({ courseCode }) => courseCode));
  const resolvedPreview = applyDatabaseCourseNamesToPreview(preview, courses);
  const rows = resolvedPreview.rows.map((row) => ({
    page: row.sourcePage,
    roomCode: row.roomCode,
    courseCode: row.courseCode,
    courseName: row.subject,
    duplicate: previouslyImportedCellKeys.has(`${row.sourcePage}:${row.sourceCellKey}`),
    dayOfWeek: row.dayOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    sourceConfidence: row.sourceConfidence,
    teacherName: row.teacherName,
    teacherNameCandidate: row.teacherNameCandidate,
    teacherNameConfirmed: row.teacherNameConfirmed,
    className: row.className,
  }));
  const unmatchedCodes = courseCodes.filter((courseCode) => !courseNames.has(courseCode));
  const matchedCodes = courseCodes.filter((courseCode) => courseNames.has(courseCode));
  const teacherPreservationFailures = resolvedPreview.rows.filter((row) =>
    row.sourceStructured.teacherName !== row.teacherNameCandidate).length;
  const unconfirmedTeacherCandidates = resolvedPreview.rows.filter((row) =>
    requiresTeacherConfirmation(row) && row.teacherName === null && !row.teacherNameConfirmed).length;
  const teacherMasterExactMatches = new Set(resolvedPreview.rows.flatMap((row) => {
    if (!row.teacherNameCandidate) return [];
    const matched = teachers.some(({ firstName, lastName }) => `${firstName} ${lastName}` === row.teacherNameCandidate);
    return matched ? [row.teacherNameCandidate] : [];
  })).size;

  console.info(JSON.stringify({
    pdf: pdfPath,
    pages: preview.pageCount,
    successfulPages: preview.successfulPages,
    failedPages: preview.failedPages,
    rowCount: rows.length,
    roomFromDatabase: room,
    previouslyImportedRows: previouslyImportedRows.length,
    duplicateRowsDetected: rows.filter(({ duplicate }) => duplicate).length,
    teacherNameCandidates: resolvedPreview.rows.filter(({ teacherNameCandidate }) => teacherNameCandidate !== null).length,
    unconfirmedTeacherCandidates,
    teacherPreservationFailures,
    activeTeacherMasterRecords: teachers.length,
    exactTeacherMasterMatches: teacherMasterExactMatches,
    matchedCourses: matchedCodes.map((courseCode) => ({
      courseCode,
      courseName: courses.find((course) => course.courseCode === courseCode)?.courseName,
    })),
    unmatchedCodes,
    rows,
  }, null, 2));

  if (!rows.length) throw new Error("No timetable rows were extracted from the PDF.");
  if (!matchedCodes.length) throw new Error("No PDF course codes matched the PostgreSQL course catalogue.");
  if (teacherPreservationFailures) throw new Error("A teacher candidate found in the PDF was not preserved in the preview row.");
  if (unconfirmedTeacherCandidates !== resolvedPreview.rows.filter(({ teacherNameCandidate }) => teacherNameCandidate !== null).length) {
    throw new Error("A teacher OCR candidate was promoted without human confirmation.");
  }
  if (!room) throw new Error("Room 243 could not be matched to an active room in PostgreSQL.");
  if (roomCode === "243" && !rows.some((row) => row.courseCode === "21910-1001" && row.dayOfWeek === "WEDNESDAY" && row.startTime === "08:00" && row.endTime === "10:00")) {
    throw new Error("Expected Wednesday 08:00-10:00 course row was not extracted as a two-hour range.");
  }
} finally {
  await prisma.$disconnect();
}
