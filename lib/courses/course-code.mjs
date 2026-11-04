const thaiDigits = "๐๑๒๓๔๕๖๗๘๙";

export function normalizeCourseCode(value) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[๐-๙]/g, (digit) => String(thaiDigits.indexOf(digit)))
    .trim();
  const match = /^(\d{5})\s*[-–—]\s*(\d{4})$/.exec(normalized);
  return match ? `${match[1]}-${match[2]}` : null;
}
