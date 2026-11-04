import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { SemesterCalendarEntry } from "@/lib/dashboard/statistics.mjs";

const calendarKey = "academic_calendar";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, "วันที่ไม่ถูกต้อง");

export const semesterCalendarSchema = z.array(z.object({
  academicYear: z.number().int().min(2000).max(2700),
  term: z.number().int().min(1).max(3),
  startDate: dateSchema,
  endDate: dateSchema,
})).max(30).superRefine((entries, context) => {
  const keys = new Set<string>();
  const ordered = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (const [index, entry] of ordered.entries()) {
    const key = `${entry.academicYear}-${entry.term}`;
    if (keys.has(key)) {
      context.addIssue({ code: "custom", path: [index, "term"], message: "ภาคเรียนและปีการศึกษานี้มีอยู่แล้ว" });
    }
    keys.add(key);
    if (entry.startDate > entry.endDate) {
      context.addIssue({ code: "custom", path: [index, "endDate"], message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น" });
    }
    const previous = ordered[index - 1];
    if (previous && entry.startDate <= previous.endDate) {
      context.addIssue({ code: "custom", path: [index, "startDate"], message: "ช่วงปฏิทินภาคเรียนห้ามซ้อนทับกัน" });
    }
  }
});

export async function getSemesterCalendar(): Promise<SemesterCalendarEntry[]> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: calendarKey }, select: { value: true } });
  if (!setting) return [];
  const parsed: unknown = JSON.parse(setting.value);
  return semesterCalendarSchema.parse(parsed);
}

export async function saveSemesterCalendar(calendar: SemesterCalendarEntry[]) {
  return prisma.systemSetting.upsert({
    where: { key: calendarKey },
    create: {
      key: calendarKey,
      value: JSON.stringify(calendar),
      description: "วันเริ่มต้นและวันสิ้นสุดของภาคเรียนสำหรับรายงาน Dashboard",
    },
    update: { value: JSON.stringify(calendar) },
  });
}
