import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const [baseUrlInput, pdfPath] = process.argv.slice(2);
if (!baseUrlInput || !pdfPath) throw new Error("Pass the server URL and PDF path as arguments.");
const baseUrl = new URL(baseUrlInput).origin;
const username = process.env.ITKMS_TEST_USERNAME;
const password = process.env.ITKMS_TEST_PASSWORD;
if (!username || !password) throw new Error("Set ITKMS_TEST_USERNAME and ITKMS_TEST_PASSWORD for an authorized test account.");

const prisma = new PrismaClient();
const cookies = new Map();
function recordCookies(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const header of setCookies) {
    const [pair] = header.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}
function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
async function getSession() {
  const response = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: cookieHeader() } });
  recordCookies(response);
  assert.equal(response.status, 200);
  return response.json();
}
async function postPdfPreview(bytes) {
  const form = new FormData();
  form.set("file", new File([bytes], "243.pdf", { type: "application/pdf" }));
  const response = await fetch(`${baseUrl}/api/room-timetable/import/preview`, {
    method: "POST",
    headers: { cookie: cookieHeader() },
    body: form,
  });
  assert.equal(response.status, 200);
  const stream = await response.text();
  const completed = stream.replaceAll("\r", "").split("\n\n").flatMap((eventBlock) => {
    const event = /^event: (.+)$/m.exec(eventBlock)?.[1];
    const data = /^data: (.+)$/m.exec(eventBlock)?.[1];
    return event === "complete" && data ? [JSON.parse(data)] : [];
  });
  const errors = stream.replaceAll("\r", "").split("\n\n").flatMap((eventBlock) => {
    const event = /^event: (.+)$/m.exec(eventBlock)?.[1];
    const data = /^data: (.+)$/m.exec(eventBlock)?.[1];
    return event === "error" && data ? [JSON.parse(data)] : [];
  });
  if (errors.length) throw new Error(errors[0].message ?? "PDF preview endpoint returned an error event.");
  assert.equal(completed.length, 1, "Preview endpoint must emit one complete event.");
  return completed[0];
}

try {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  recordCookies(csrfResponse);
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json();
  const form = new URLSearchParams({
    csrfToken,
    callbackUrl: `${baseUrl}/courses`,
    json: "true",
    username,
    password,
  });
  const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie: cookieHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  recordCookies(loginResponse);
  const session = await getSession();
  if (!session?.user?.id || !["ADMIN", "TEACHER"].includes(session.user.role)) {
    throw new Error("The test account did not receive an authorized ADMIN or TEACHER session.");
  }

  const searchResponse = await fetch(`${baseUrl}/api/courses?courseCode=21910-2021`, { headers: { cookie: cookieHeader() } });
  assert.equal(searchResponse.status, 200);
  assert.deepEqual(await searchResponse.json(), {
    success: true,
    data: { courseCode: "21910-2021", courseName: "สื่อโมชันกราฟิก" },
  });

  const before = await prisma.$transaction(async (tx) => ({
    schedules: await tx.roomSchedule.count(),
    imports: await tx.roomScheduleImport.count(),
  }));
  const pdfBytes = new Uint8Array(await readFile(pdfPath));
  const previews = [await postPdfPreview(pdfBytes), await postPdfPreview(pdfBytes)];
  for (const preview of previews) {
    assert.equal(preview.pageCount, 1);
    assert.equal(preview.successfulPages, 1);
    assert.equal(preview.rows.length, 9);
    assert.equal(preview.rows.filter(({ duplicate }) => duplicate).length, 9);
    assert.equal(preview.courseCatalog.length, 4);
    assert.ok(preview.rows.every((row) => row.subject));
    assert.ok(preview.rows.every((row) => row.teacherName === null));
    assert.ok(preview.rows.every((row) => row.teacherNameCandidate
      && row.teacherNameCandidate === row.sourceStructured.teacherName
      && row.teacherNameConfirmed === false));
    assert.ok(preview.rows.some((row) => row.courseCode === "21910-1001"
      && row.dayOfWeek === "WEDNESDAY" && row.startTime === "08:00" && row.endTime === "10:00"));
    assert.equal(preview.courseCatalog.find(({ courseCode }) => courseCode === "21910-1001")?.subject, "พื้นฐานธุรกิจดิจิทัล");
  }
  const unconfirmedImportResponse = await fetch(`${baseUrl}/api/room-timetable/import`, {
    method: "POST",
    headers: { cookie: cookieHeader(), "content-type": "application/json" },
    body: JSON.stringify({
      fileHash: previews[0].fileHash,
      fileName: previews[0].fileName,
      pageCount: previews[0].pageCount,
      rawExtraction: { pages: previews[0].pages, courseCatalog: previews[0].courseCatalog },
      rows: [previews[0].rows[0]],
    }),
  });
  assert.equal(unconfirmedImportResponse.status, 200);
  const unconfirmedImportBody = await unconfirmedImportResponse.json();
  assert.equal(unconfirmedImportBody.data.imported, 0);
  assert.equal(unconfirmedImportBody.data.duplicates, 1);
  assert.equal(unconfirmedImportBody.data.failed, 0);
  const unknownCourseRow = {
    ...previews[0].rows[0],
    sourceCellKey: `unknown-course-check-${Date.now()}`,
    courseCode: "99999-9999",
    subject: "OCR ชื่อที่ไม่เชื่อถือ",
  };
  const unknownCourseResponse = await fetch(`${baseUrl}/api/room-timetable/import`, {
    method: "POST",
    headers: { cookie: cookieHeader(), "content-type": "application/json" },
    body: JSON.stringify({
      fileHash: previews[0].fileHash,
      fileName: previews[0].fileName,
      pageCount: previews[0].pageCount,
      rawExtraction: { pages: previews[0].pages, courseCatalog: previews[0].courseCatalog },
      rows: [previews[0].rows[0], unknownCourseRow],
    }),
  });
  assert.equal(unknownCourseResponse.status, 200);
  const unknownCourseBody = await unknownCourseResponse.json();
  assert.equal(unknownCourseBody.data.duplicates, 1);
  assert.equal(unknownCourseBody.data.failed, 1);
  assert.match(unknownCourseBody.data.results.find(({ status }) => status === "FAILED").message, /Course Master/);
  const unconfirmedTeacherNameResponse = await fetch(`${baseUrl}/api/room-timetable/import`, {
    method: "POST",
    headers: { cookie: cookieHeader(), "content-type": "application/json" },
    body: JSON.stringify({
      fileHash: previews[0].fileHash,
      fileName: previews[0].fileName,
      pageCount: previews[0].pageCount,
      rawExtraction: { pages: previews[0].pages, courseCatalog: previews[0].courseCatalog },
      rows: [{ ...previews[0].rows[0], teacherName: previews[0].rows[0].teacherNameCandidate }],
    }),
  });
  assert.equal(unconfirmedTeacherNameResponse.status, 422);
  const after = await prisma.$transaction(async (tx) => ({
    schedules: await tx.roomSchedule.count(),
    imports: await tx.roomScheduleImport.count(),
  }));
  assert.deepEqual(after, before, "Preview requests must not write schedule or import rows.");

  const pageResults = [];
  for (let index = 0; index < 2; index += 1) {
    const page = await fetch(`${baseUrl}/courses`, { headers: { cookie: cookieHeader() } });
    const html = await page.text();
    const search = await fetch(`${baseUrl}/api/courses?courseCode=21910-2021`, { headers: { cookie: cookieHeader() } });
    const searchBody = await search.json();
    pageResults.push({
      status: page.status,
      containsCourseSearch: html.includes("ค้นหารายวิชา"),
      searchStatus: search.status,
      courseName: searchBody.data?.courseName ?? null,
    });
  }
  console.info(JSON.stringify({
    authenticatedRole: session.user.role,
    liveCourseApi: "21910-2021 = สื่อโมชันกราฟิก",
    previewRequests: previews.length,
    rowsPerPreview: previews.map(({ rows }) => rows.length),
    matchedCourseCount: previews.map(({ courseCatalog }) => courseCatalog.filter(({ subject }) => subject).length),
    duplicateRowsPerPreview: previews.map(({ rows }) => rows.filter(({ duplicate }) => duplicate).length),
    teacherCandidateRowsAwaitingConfirmation: previews.map(({ rows }) => rows.filter(({ teacherNameConfirmed }) => !teacherNameConfirmed).length),
    unconfirmedTeacherImportAllowed: unconfirmedImportResponse.status === 200 && unconfirmedImportBody.data.duplicates === 1,
    unknownCourseRejectedPerRow: unknownCourseBody.data.failed === 1,
    unconfirmedTeacherNameRejectedAsConfirmed: unconfirmedTeacherNameResponse.status === 422,
    multiPeriodExample: "WEDNESDAY 08:00-10:00",
    databaseCountsBefore: before,
    databaseCountsAfter: after,
    authenticatedCoursePageHttp: pageResults,
    note: "Page HTTP was fetched twice; this is not a browser hydration or click test.",
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
