import { BookingStatus, UserRole } from "@prisma/client";
import { z } from "zod";

const dateTimeSchema = z.iso.datetime({ offset: true });

export const borrowingInputSchema = z.object({
  roomId: z.string().min(1).max(30),
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  purpose: z.string().trim().min(3).max(500),
  attendeeCount: z.number().int().min(1).max(1000),
  note: z.string().trim().max(2000).nullable().optional(),
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
  path: ["endsAt"],
  message: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
}).refine((value) => new Date(value.startsAt) > new Date(), {
  path: ["startsAt"],
  message: "วันและเวลาเริ่มต้องอยู่ในอนาคต",
});

export const rejectionSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const returnSchema = z.object({
  returnNote: z.string().trim().max(2000).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).default(""),
  roomId: z.string().max(30).optional(),
  status: z.nativeEnum(BookingStatus).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  sortBy: z.enum(["bookingNo", "startsAt", "endsAt", "status", "purpose", "createdAt"]).default("startsAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).refine(
  (value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
  { path: ["dateTo"], message: "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม" },
);

export const editableStatuses = [BookingStatus.PENDING] as const;
export const blockingStatuses = [BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.USING] as const;
export const approverRoles = [UserRole.TEACHER, UserRole.ADMIN] as const;
