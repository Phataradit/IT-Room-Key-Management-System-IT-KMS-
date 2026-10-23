import { DayOfWeek, ScheduleStatus } from "@prisma/client";
import { z } from "zod";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "กรุณาระบุเวลาเป็น HH:mm");

export const roomScheduleInputSchema = z.object({
  roomId: z.string().min(1).max(30),
  teacherId: z.string().min(1).max(30).nullable().optional(),
  dayOfWeek: z.nativeEnum(DayOfWeek),
  startTime: timeSchema,
  endTime: timeSchema,
  courseCode: z.string().trim().max(50).nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  teacherName: z.string().trim().max(200).nullable().optional(),
  className: z.string().trim().max(100).nullable().optional(),
  semester: z.string().trim().max(20).nullable().optional(),
  academicYear: z.string().trim().max(20).nullable().optional(),
  effectiveFrom: z.iso.date().nullable().optional(),
  effectiveTo: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: z.nativeEnum(ScheduleStatus).default(ScheduleStatus.ACTIVE),
}).refine((value) => value.startTime < value.endTime, {
  path: ["endTime"],
  message: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
}).refine((value) => !value.effectiveTo || !value.effectiveFrom || value.effectiveFrom <= value.effectiveTo, {
  path: ["effectiveTo"],
  message: "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม",
});

export const roomScheduleExceptionSchema = z.object({
  date: z.iso.date(),
  reason: z.string().trim().max(250).nullable().optional(),
});

export const roomTimetableQuerySchema = z.object({
  weekStart: z.iso.date().optional(),
  roomId: z.string().max(30).optional(),
  dayOfWeek: z.nativeEnum(DayOfWeek).optional(),
  search: z.string().trim().max(100).default(""),
  teacherId: z.string().max(30).optional(),
  className: z.string().trim().max(100).optional(),
  semester: z.string().trim().max(20).optional(),
  academicYear: z.string().trim().max(20).optional(),
  type: z.enum(["ALL", "SCHEDULE", "BOOKING"]).default("ALL"),
  status: z.enum([
    "SCHEDULED",
    "PENDING",
    "APPROVED",
    "USING",
    "RETURNED",
    "CANCELLED",
    "REJECTED",
  ]).optional(),
});

export const roomNotificationSettingsSchema = z.object({
  reminderMinutes: z.number().int().min(1).max(180),
  overdueMinutes: z.array(z.number().int().min(1).max(1440)).min(1).max(10)
    .refine((values) => new Set(values).size === values.length, "ห้ามระบุช่วงเวลาเกินซ้ำ"),
  notifyAdmins: z.boolean(),
});
