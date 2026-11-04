import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const [baseUrlInput, pdfPath] = process.argv.slice(2);
if (!baseUrlInput || !pdfPath) throw new Error("Pass the local Development Server URL and PDF path.");
const baseUrl = new URL(baseUrlInput);
if (!["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
  throw new Error("Live import verification is restricted to a local development server.");
}
const username = process.env.ITKMS_TEST_USERNAME;
const password = process.env.ITKMS_TEST_PASSWORD;
if (!username || !password) throw new Error("Set ITKMS_TEST_USERNAME and ITKMS_TEST_PASSWORD for an authorized test account.");

const prisma = new PrismaClient();
const cookies = new Map();
function recordCookies(response) {
  for (const header of response.headers.getSetCookie?.() ?? []) {
    const [pair] = header.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}
function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

try {
  const csrfResponse = await fetch(new URL("/api/auth/csrf", baseUrl));
  recordCookies(csrfResponse);
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json();
  const loginResponse = await fetch(new URL("/api/auth/callback/credentials", baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { cookie: cookieHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      callbackUrl: new URL("/room-timetable", baseUrl).toString(),
      json: "true",
      username,
      password,
    }),
  });
  recordCookies(loginResponse);
  const sessionResponse = await fetch(new URL("/api/auth/session", baseUrl), { headers: { cookie: cookieHeader() } });
  const session = await sessionResponse.json();
  assert.ok(session.user?.id && ["ADMIN", "TEACHER"].includes(session.user.role));

  const pdfBytes = new Uint8Array(await readFile(pdfPath));
  const previewForm = new FormData();
  previewForm.set("file", new File([pdfBytes], path.basename(pdfPath), { type: "application/pdf" }));
  const previewResponse = await fetch(new URL("/api/room-timetable/import/preview", baseUrl), {
    method: "POST",
    headers: { cookie: cookieHeader() },
    body: previewForm,
  });
  assert.equal(previewResponse.status, 200);
  const previewText = await previewResponse.text();
  const completeEvents = previewText.split("\n\n")
    .filter((block) => /^event: complete$/m.test(block))
    .map((block) => JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? "null"));
  assert.equal(completeEvents.length, 1);
  const preview = completeEvents[0];
  assert.equal(preview.rows.length, 12);

  const structurallyReadyRows = preview.rows.filter((row) =>
    row.roomId
    && row.courseCode
    && row.subject
    && row.dayOfWeek
    && row.startTime
    && row.endTime
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime)
    && row.startTime < row.endTime
    && (!row.effectiveFrom || /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom))
    && (!row.effectiveTo || /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveTo))
    && (!row.effectiveFrom || !row.effectiveTo || row.effectiveFrom <= row.effectiveTo));
  const freshSelectedRows = structurallyReadyRows.filter((row) => !row.duplicate);
  const selectedRows = freshSelectedRows.length ? freshSelectedRows : structurallyReadyRows;
  const skippedRows = preview.rows.filter((row) => !selectedRows.includes(row));
  assert.ok(selectedRows.length > 0, "The PDF must contain rows with required structure and exact Course Master matches.");
  assert.ok(selectedRows.some((row) => row.teacherNameCandidate && !row.teacherNameConfirmed),
    "The selected set must exercise pending OCR teacher names.");
  assert.ok(skippedRows.length > 0, "The PDF must exercise row-level exclusion for incomplete/unmatched data.");

  const before = await prisma.$transaction(async (tx) => ({
    schedules: await tx.roomSchedule.count(),
    imports: await tx.roomScheduleImport.count(),
    existingImport: await tx.roomScheduleImport.findUnique({ where: { fileHash: preview.fileHash }, select: { id: true } }),
    existingHashScheduleCount: await tx.roomSchedule.count({ where: { sourceFileHash: preview.fileHash } }),
  }));
  const payload = {
    fileHash: preview.fileHash,
    fileName: preview.fileName,
    pageCount: preview.pageCount,
    rawExtraction: { pages: preview.pages, courseCatalog: preview.courseCatalog },
    rows: selectedRows.map((row) => ({
      sourcePage: row.sourcePage,
      sourceCellKey: row.sourceCellKey,
      sourceCellText: row.sourceCellText,
      sourceConfidence: row.sourceConfidence,
      sourceBounds: row.sourceBounds,
      sourceWords: row.sourceWords,
      sourceStructured: {
        ...row.sourceStructured,
        teacherNameCandidate: row.teacherNameCandidate,
        teacherNameConfirmed: row.teacherNameConfirmed,
      },
      sourceBuilding: row.sourceBuilding,
      roomId: row.roomId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      courseCode: row.courseCode,
      subject: row.subject,
      teacherName: row.teacherNameConfirmed ? row.teacherName : null,
      teacherNameCandidate: row.teacherNameCandidate,
      teacherNameConfirmed: row.teacherNameConfirmed,
      className: row.className,
      semester: row.semester,
      academicYear: row.academicYear,
      effectiveFrom: row.effectiveFrom || null,
      effectiveTo: row.effectiveTo || null,
    })),
  };

  async function submitImport() {
    const response = await fetch(new URL("/api/room-timetable/import", baseUrl), {
      method: "POST",
      headers: { cookie: cookieHeader(), "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    return body.data;
  }

  const firstResult = await submitImport();
  assert.equal(firstResult.imported + firstResult.duplicates + firstResult.failed, selectedRows.length);
  const importedRows = await prisma.roomSchedule.findMany({
    where: { sourceFileHash: preview.fileHash },
    select: {
      sourcePage: true,
      sourceCellKey: true,
      teacherId: true,
      teacherName: true,
      subject: true,
      courseCode: true,
      sourceStructured: true,
      course: { select: { courseCode: true, courseName: true } },
    },
  });
  for (const row of importedRows) {
    assert.ok(row.course, `Imported row ${row.sourceCellKey} must link to a real Course Master row.`);
    assert.equal(row.course.courseCode, row.courseCode);
    assert.equal(row.subject, row.course.courseName);
    const source = row.sourceStructured;
    if (source && typeof source === "object" && "teacherNameConfirmed" in source && source.teacherNameConfirmed === false) {
      assert.equal(row.teacherId, null, "An OCR candidate must never be linked to a real teacher without confirmation.");
      assert.equal(row.teacherName, null, "An unconfirmed OCR candidate must not be displayed as a verified teacher name.");
      assert.ok(typeof source.teacherNameCandidate === "string", "The pending OCR name must remain stored for later review.");
    }
  }
  assert.equal(importedRows.length, before.existingHashScheduleCount + firstResult.imported);
  const afterFirstImport = await prisma.$transaction(async (tx) => ({
    schedules: await tx.roomSchedule.count(),
    imports: await tx.roomScheduleImport.count(),
  }));
  assert.equal(afterFirstImport.schedules, before.schedules + firstResult.imported);
  assert.equal(afterFirstImport.imports, before.imports + (before.existingImport ? 0 : 1));

  const secondResult = await submitImport();
  assert.equal(secondResult.imported, 0, "Submitting the same selected PDF rows twice must not create duplicates.");
  assert.equal(secondResult.duplicates, firstResult.imported + firstResult.duplicates);
  const afterSecondImport = await prisma.$transaction(async (tx) => ({
    schedules: await tx.roomSchedule.count(),
    imports: await tx.roomScheduleImport.count(),
  }));
  assert.deepEqual(afterSecondImport, afterFirstImport);
  const timetableResponse = await fetch(new URL(
    `/api/room-timetable?roomId=${encodeURIComponent(selectedRows[0].roomId)}&type=SCHEDULE`,
    baseUrl,
  ), { headers: { cookie: cookieHeader() } });
  assert.equal(timetableResponse.status, 200);
  const timetableBody = await timetableResponse.json();
  const visibleImportedRows = timetableBody.data.entries.filter((entry) =>
    importedRows.some((row) => row.courseCode === entry.courseCode && row.subject === entry.title));
  assert.ok(visibleImportedRows.length > 0, "A fresh timetable API query must show the newly persisted schedules.");

  console.info(JSON.stringify({
    pdf: pdfPath,
    authenticatedRole: session.user.role,
    previewRows: preview.rows.length,
    selectedRows: selectedRows.length,
    skippedForStructuralOrCourseReview: skippedRows.map((row) => ({
      sourcePage: row.sourcePage,
      sourceCellKey: row.sourceCellKey,
      courseCode: row.courseCode,
      reason: !row.courseCode || !row.subject ? "ตรวจรหัสวิชา" : "ข้อมูลโครงสร้างไม่ครบ",
    })),
    pendingTeacherRowsSelected: selectedRows.filter((row) => row.teacherNameCandidate && !row.teacherNameConfirmed).length,
    firstImport: firstResult,
    secondImport: secondResult,
    databaseBefore: { schedules: before.schedules, imports: before.imports },
    databaseAfter: afterSecondImport,
    refreshedTimetableApi: {
      status: timetableResponse.status,
      matchingImportedOccurrences: visibleImportedRows.length,
    },
    importedRowsStoredWithCanonicalCoursesAndPendingTeacherText: importedRows.length === before.existingHashScheduleCount + firstResult.imported,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
