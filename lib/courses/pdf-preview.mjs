export function getPreviewCourseCodes(preview) {
  return [...new Set([
    ...preview.rows.flatMap(({ courseCode }) => courseCode ? [courseCode] : []),
    ...preview.courseCatalog.map(({ courseCode }) => courseCode),
  ])];
}

export function applyDatabaseCourseNamesToPreview(preview, courses) {
  const courseByCode = new Map(courses.map(({ courseCode, courseName }) => [courseCode, courseName]));
  const rows = preview.rows.map((row) => {
    const subject = row.courseCode ? courseByCode.get(row.courseCode) ?? null : null;
    const teacherNameCandidate = row.teacherNameCandidate ?? row.sourceStructured?.teacherName ?? null;
    return {
      ...row,
      subject,
      teacherName: null,
      teacherNameCandidate,
      teacherNameConfirmed: false,
      sourceStructured: { ...row.sourceStructured, subject },
    };
  });
  const courseCatalog = getPreviewCourseCodes(preview).map((courseCode) => {
    const courseName = courseByCode.get(courseCode) ?? null;
    const entry = preview.courseCatalog.find((course) => course.courseCode === courseCode);
    return {
      courseCode,
      subject: courseName,
      sourceText: courseName ? "ชื่อจากฐานข้อมูลรายวิชา" : "ไม่พบในฐานข้อมูลรายวิชา",
      confidence: entry?.confidence ?? null,
      bounds: entry?.bounds ?? { x: 0, y: 0, width: 0, height: 0 },
    };
  });
  return { ...preview, rows, courseCatalog };
}
