import assert from "node:assert/strict";
import test from "node:test";
import { parseCourseCatalogRow } from "../lib/room-timetable/course-catalog.mjs";
import { normalizeCourseCode } from "../lib/courses/course-code.mjs";
import { applyDatabaseCourseNamesToPreview, getPreviewCourseCodes } from "../lib/courses/pdf-preview.mjs";
import { prepareTeacherImportFields, requiresTeacherConfirmation } from "../lib/room-timetable/teacher-review.mjs";
import { getImportBlockingProblems, isImportRowStructurallyReady } from "../lib/room-timetable/import-readiness.mjs";
import { initialCourses } from "../prisma/course-catalog.mjs";

test("course title is extracted when code and title share one PDF text item", () => {
  assert.deepEqual(parseCourseCatalogRow("31910-2005 ระบบฐานข้อมูล"), {
    courseCode: "31910-2005",
    subject: "ระบบฐานข้อมูล",
    codeStart: 0,
    codeLength: 10,
  });
});

test("course code can be split across PDF text items and use typographic dashes", () => {
  assert.deepEqual(parseCourseCatalogRow("วิชา ๓๑๙๑๐ – ๒๐๐๕ ระบบฐานข้อมูล"), {
    courseCode: "31910-2005",
    subject: "วิชา ระบบฐานข้อมูล",
    codeStart: 5,
    codeLength: 12,
  });
});

test("course code is still returned when its PDF row has no readable title", () => {
  assert.deepEqual(parseCourseCatalogRow("31910 - 2005"), {
    courseCode: "31910-2005",
    subject: null,
    codeStart: 0,
    codeLength: 12,
  });
});

test("OCR Thai combining marks are normalized into standard Thai text", () => {
  const expected = "ระบบปฏิบัติการและบำรุงรักษาคอมพิวเตอร์";
  assert.equal(
    parseCourseCatalogRow("31910-0001 ระบบปฏิบัติการและบํารุงรักษาคอมพิวเตอร์")?.subject?.normalize("NFKC"),
    expected.normalize("NFKC"),
  );
});

test("search accepts ASCII and Thai-digit course codes with exact matching shape", () => {
  assert.equal(normalizeCourseCode("21910-2021"), "21910-2021");
  assert.equal(normalizeCourseCode("๒๑๙๑๐ – ๒๐๒๑"), "21910-2021");
  assert.equal(normalizeCourseCode("21910-202"), null);
  assert.equal(normalizeCourseCode("prefix 21910-2021"), null);
});

test("seed catalogue contains 37 unique courses and the required lookup entry", () => {
  assert.equal(initialCourses.length, 37);
  assert.equal(new Set(initialCourses.map(({ courseCode }) => courseCode)).size, 37);
  assert.deepEqual(initialCourses.find(({ courseCode }) => courseCode === "21910-2021"), {
    courseCode: "21910-2021",
    courseName: "สื่อโมชันกราฟิก",
  });
});

test("PDF preview always takes the subject from the exact database course code", () => {
  const preview = {
    rows: [
      {
        courseCode: "21910-2021",
        subject: "OCR ผิด",
        teacherName: null,
        teacherNameCandidate: "teacher OCR candidate",
        teacherNameConfirmed: false,
        sourceStructured: { subject: "OCR ผิด", teacherName: "teacher OCR candidate" },
      },
      { courseCode: "99999-9999", subject: "OCR สุ่มเดา", sourceStructured: { subject: "OCR สุ่มเดา" } },
    ],
    courseCatalog: [{
      courseCode: "21910-2021",
      subject: "OCR ชื่ออื่น",
      sourceText: "OCR ชื่ออื่น",
      confidence: 90,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    }],
  };
  const codes = getPreviewCourseCodes(preview);
  assert.deepEqual(codes, ["21910-2021", "99999-9999"]);
  const resolved = applyDatabaseCourseNamesToPreview(preview, [
    { courseCode: "21910-2021", courseName: "สื่อโมชันกราฟิก" },
  ]);
  assert.equal(resolved.rows[0].subject, "สื่อโมชันกราฟิก");
  assert.equal(resolved.rows[0].teacherName, null);
  assert.equal(resolved.rows[0].teacherNameCandidate, "teacher OCR candidate");
  assert.equal(resolved.rows[0].teacherNameConfirmed, false);
  assert.equal(resolved.rows[0].sourceStructured.subject, "สื่อโมชันกราฟิก");
  assert.equal(resolved.rows[1].subject, null);
  assert.equal(resolved.rows[1].sourceStructured.subject, null);
  assert.equal(resolved.courseCatalog[0].subject, "สื่อโมชันกราฟิก");
  assert.match(resolved.courseCatalog[0].sourceText, /ฐานข้อมูล/);
  assert.equal(resolved.courseCatalog[1].subject, null);
});

test("unconfirmed OCR teacher candidates remain a review warning without blocking valid schedule structure", () => {
  const noisyCandidate = "ร ว ว ร ร ณ";
  const candidate = {
    teacherNameCandidate: noisyCandidate,
    teacherName: null,
    teacherNameConfirmed: false,
  };
  assert.equal(requiresTeacherConfirmation(candidate), true);
  const persistedTeacherFields = prepareTeacherImportFields({
    ...candidate,
    sourceStructured: { teacherName: noisyCandidate },
  });
  assert.equal(persistedTeacherFields.teacherName, null);
  assert.deepEqual(persistedTeacherFields.sourceStructured, {
    teacherName: noisyCandidate,
    teacherNameCandidate: noisyCandidate,
    teacherNameConfirmed: false,
  });
  const structurallyCompleteRow = {
    roomId: "room-243",
    courseCode: "21910-1001",
    subject: "พื้นฐานธุรกิจดิจิทัล",
    dayOfWeek: "WEDNESDAY",
    startTime: "08:00",
    endTime: "10:00",
    effectiveFrom: null,
    effectiveTo: null,
    ...candidate,
  };
  assert.deepEqual(getImportBlockingProblems(structurallyCompleteRow), []);
  assert.equal(isImportRowStructurallyReady(structurallyCompleteRow), true);

  const unresolvedCourse = { ...structurallyCompleteRow, courseCode: "99999-9999", subject: null };
  assert.deepEqual(getImportBlockingProblems(unresolvedCourse), ["ตรวจรหัสวิชา"]);
  assert.equal(isImportRowStructurallyReady(unresolvedCourse), false);
  const mixedRows = [structurallyCompleteRow, unresolvedCourse];
  const rowsToImport = mixedRows.filter(isImportRowStructurallyReady);
  const rowsToReport = mixedRows.filter((row) => !isImportRowStructurallyReady(row));
  assert.equal(rowsToImport.length, 1);
  assert.equal(rowsToImport[0].teacherName, null);
  assert.equal(rowsToReport.length, 1);
  assert.deepEqual(getImportBlockingProblems(rowsToReport[0]), ["ตรวจรหัสวิชา"]);
  assert.equal([].filter(isImportRowStructurallyReady).length, 0);

  assert.equal(requiresTeacherConfirmation({
    teacherNameCandidate: noisyCandidate,
    teacherName: "วรรณ",
    teacherNameConfirmed: true,
  }), false);
  assert.deepEqual(prepareTeacherImportFields({
    teacherNameCandidate: noisyCandidate,
    teacherName: "ครูวรรณ",
    teacherNameConfirmed: true,
    sourceStructured: { teacherName: noisyCandidate },
  }), {
    teacherName: "ครูวรรณ",
    sourceStructured: {
      teacherName: noisyCandidate,
      teacherNameCandidate: null,
      teacherNameConfirmed: true,
    },
  });
  assert.equal(requiresTeacherConfirmation({
    teacherNameCandidate: null,
    teacherName: "ครูทดสอบ",
    teacherNameConfirmed: false,
  }), true);
  assert.equal(requiresTeacherConfirmation({
    teacherNameCandidate: null,
    teacherName: null,
    teacherNameConfirmed: false,
  }), false);
});
