type ImportReadinessRow = {
  roomId: string | null;
  courseCode: string | null;
  subject: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

export function getImportBlockingProblems(row: ImportReadinessRow): string[];
export function isImportRowStructurallyReady(row: ImportReadinessRow): boolean;
