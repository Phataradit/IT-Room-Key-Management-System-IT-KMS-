function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getImportBlockingProblems(row) {
  const problems = [];
  if (!row.roomId) problems.push("เลือกห้อง");
  if (!row.courseCode) problems.push("ตรวจรหัสวิชา");
  else if (!row.subject) problems.push("ตรวจรหัสวิชา");
  if (!row.dayOfWeek) problems.push("ตรวจวัน");
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!row.startTime || !row.endTime) problems.push("ตรวจเวลา");
  else if (!timePattern.test(row.startTime) || !timePattern.test(row.endTime)) problems.push("รูปแบบเวลาไม่ถูกต้อง");
  else if (row.startTime >= row.endTime) problems.push("ช่วงเวลาไม่ถูกต้อง");
  for (const date of [row.effectiveFrom, row.effectiveTo]) {
    if (date && !isCalendarDate(date)) {
      problems.push("รูปแบบวันที่ไม่ถูกต้อง");
      break;
    }
  }
  if (row.effectiveFrom && row.effectiveTo && row.effectiveFrom > row.effectiveTo) problems.push("ช่วงวันที่ไม่ถูกต้อง");
  return problems;
}

export function isImportRowStructurallyReady(row) {
  return getImportBlockingProblems(row).length === 0;
}
