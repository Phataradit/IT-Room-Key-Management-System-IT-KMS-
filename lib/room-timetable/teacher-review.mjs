export function requiresTeacherConfirmation({ teacherNameCandidate, teacherName, teacherNameConfirmed }) {
  const hasCandidate = typeof teacherNameCandidate === "string" && teacherNameCandidate.trim().length > 0;
  const hasValue = typeof teacherName === "string" && teacherName.trim().length > 0;
  return (hasCandidate || hasValue) && teacherNameConfirmed !== true;
}

export function prepareTeacherImportFields({ teacherName, teacherNameCandidate, teacherNameConfirmed, sourceStructured }) {
  const confirmed = teacherNameConfirmed === true;
  const candidate = confirmed ? null : teacherNameCandidate ?? sourceStructured.teacherName ?? null;
  return {
    teacherName: confirmed ? teacherName?.trim() || null : null,
    sourceStructured: {
      ...sourceStructured,
      teacherNameCandidate: candidate,
      teacherNameConfirmed: confirmed,
    },
  };
}
