export type TeacherReviewInput = {
  teacherNameCandidate: string | null;
  teacherName: string | null;
  teacherNameConfirmed: boolean;
};

export function requiresTeacherConfirmation(input: TeacherReviewInput): boolean;

export function prepareTeacherImportFields<T extends {
  teacherName: string | null;
  teacherNameCandidate: string | null;
  teacherNameConfirmed: boolean;
  sourceStructured: Record<string, unknown> & { teacherName?: string | null };
}>(input: T): {
  teacherName: string | null;
  sourceStructured: T["sourceStructured"] & {
    teacherNameCandidate: string | null;
    teacherNameConfirmed: boolean;
  };
};
