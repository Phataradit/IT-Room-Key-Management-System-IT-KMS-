export function parseCourseCatalogRow(value) {
  const normalized = value.replace(/[๐-๙]/g, (digit) => String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit)));
  const match = /\b(\d{5})\s*[-–—]\s*(\d{4})\b/.exec(normalized);
  if (!match) return null;

  const subject = normalized
    .replace(match[0], " ")
    .replace(/[|:;–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKC");
  return {
    courseCode: `${match[1]}-${match[2]}`,
    subject: subject || null,
    codeStart: match.index,
    codeLength: match[0].length,
  };
}
