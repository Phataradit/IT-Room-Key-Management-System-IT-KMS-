import type { RoomSchedulePdfPreview } from "../room-timetable/pdf-import";

type CourseLookup = { courseCode: string; courseName: string };

export function getPreviewCourseCodes(preview: RoomSchedulePdfPreview): string[];
export function applyDatabaseCourseNamesToPreview(
  preview: RoomSchedulePdfPreview,
  courses: CourseLookup[],
): RoomSchedulePdfPreview;
