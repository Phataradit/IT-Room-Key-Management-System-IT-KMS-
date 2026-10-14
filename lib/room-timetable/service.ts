import "server-only";
import {
  BookingStatus,
  DayOfWeek,
  Prisma,
  RoomStatus,
  ScheduleStatus,
  UserRole,
  type RoomSchedule,
  type User,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isStudentRole } from "@/lib/auth/roles";
import { addDays, bangkokDateStamp, bangkokDateTime, dayOfWeekForDate, mondayOfWeek } from "@/lib/room-timetable/time.mjs";
import { roomScheduleInputSchema } from "@/lib/room-timetable/schemas";
import type { ZodType, z } from "zod";

type ScheduleInput = z.infer<typeof roomScheduleInputSchema>;
type Actor = Pick<User, "id" | "role">;
type AuditRequest = { ipAddress?: string; userAgent?: string };

const dayNumber: Record<DayOfWeek, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

export class RoomScheduleError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "RoomScheduleError";
  }
}

export async function parseRoomScheduleJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new RoomScheduleError("รูปแบบ JSON ไม่ถูกต้อง", "VALIDATION_ERROR", 400);
  }
  return schema.parse(body);
}

function asDate(date: string | null | undefined) {
  return date ? new Date(`${date}T00:00:00.000Z`) : null;
}

function auditValue(schedule: Partial<RoomSchedule>) {
  return {
    roomId: schedule.roomId,
    teacherId: schedule.teacherId,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    courseCode: schedule.courseCode,
    subject: schedule.subject,
    teacherName: schedule.teacherName,
    className: schedule.className,
    semester: schedule.semester,
    academicYear: schedule.academicYear,
    effectiveFrom: schedule.effectiveFrom?.toISOString() ?? null,
    effectiveTo: schedule.effectiveTo?.toISOString() ?? null,
    status: schedule.status,
  } satisfies Prisma.InputJsonObject;
}

function auditInputValue(input: ScheduleInput) {
  return {
    roomId: input.roomId,
    teacherId: input.teacherId ?? null,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    courseCode: input.courseCode ?? null,
    subject: input.subject,
    teacherName: input.teacherName,
    className: input.className,
    semester: input.semester,
    academicYear: input.academicYear,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
    notes: input.notes ?? null,
    status: input.status,
  } satisfies Prisma.InputJsonObject;
}

async function notifyScheduleChange(
  tx: Prisma.TransactionClient,
  schedule: Pick<RoomSchedule, "id" | "roomId" | "teacherId" | "subject" | "updatedAt">,
  message: string,
  eventKey: string,
) {
  const [room, notifyAdminsSetting] = await Promise.all([
    tx.room.findUnique({
      where: { id: schedule.roomId },
      select: {
        roomCode: true,
        teachers: { where: { teacher: { status: "ACTIVE", deletedAt: null } }, select: { teacherId: true } },
      },
    }),
    tx.systemSetting.findUnique({ where: { key: "ROOM_NOTIFY_ADMINS" }, select: { value: true } }),
  ]);
  if (!room) return;
  const recipients = new Set([
    schedule.teacherId,
    ...room.teachers.map(({ teacherId }) => teacherId),
  ].filter((id): id is string => Boolean(id)));
  if (notifyAdminsSetting?.value === "true") {
    const admins = await tx.user.findMany({
      where: { role: UserRole.ADMIN, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    admins.forEach(({ id }) => recipients.add(id));
  }
  if (!recipients.size) return;
  const actionUrl = `/room-timetable?roomId=${encodeURIComponent(schedule.roomId)}`;
  await tx.notification.createMany({
    data: [...recipients].map((userId) => ({
      userId,
      type: "SCHEDULE_CHANGED" as const,
      priority: "WARNING" as const,
      title: "ตารางการใช้ห้องมีการเปลี่ยนแปลง",
      message: `ห้อง ${room.roomCode}: ${message}`,
      referenceId: schedule.id,
      actionUrl,
      dedupeKey: `schedule-change:${schedule.id}:${eventKey}:${userId}`,
    })),
    skipDuplicates: true,
  });
}

async function markScheduleExpiryNotificationsRead(tx: Prisma.TransactionClient, scheduleId: string) {
  await tx.notification.updateMany({
    where: {
      referenceId: scheduleId,
      isRead: false,
      type: {
        in: [
          "ROOM_ENDING_SOON",
          "ROOM_USAGE_ENDED",
          "ROOM_USAGE_OVERDUE",
        ],
      },
    },
    data: { isRead: true },
  });
}

async function lockRoom(tx: Prisma.TransactionClient, roomId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
  `;
  if (!locked.length) throw new RoomScheduleError("ไม่พบห้องที่เลือก", "ROOM_NOT_FOUND", 404);
}

async function validateTeacher(tx: Prisma.TransactionClient, input: ScheduleInput) {
  if (!input.teacherId) return input.teacherName;
  const teacher = await tx.user.findFirst({
    where: { id: input.teacherId, role: UserRole.TEACHER, status: "ACTIVE", deletedAt: null },
    select: { firstName: true, lastName: true },
  });
  if (!teacher) throw new RoomScheduleError("ไม่พบครูผู้สอนที่เลือก", "TEACHER_NOT_FOUND", 404);
  return `${teacher.firstName} ${teacher.lastName}`;
}

async function findConflict(
  tx: Prisma.TransactionClient,
  input: ScheduleInput,
  excludeId?: string,
) {
  const dateRange = [
    { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asDate(input.effectiveFrom)! } }] },
    ...(input.effectiveTo ? [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asDate(input.effectiveTo)! } }] }] : []),
  ];
  const schedule = await tx.roomSchedule.findFirst({
    where: {
      roomId: input.roomId,
      dayOfWeek: input.dayOfWeek,
      status: ScheduleStatus.ACTIVE,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startTime: { lt: input.endTime },
      endTime: { gt: input.startTime },
      AND: dateRange,
    },
    select: { subject: true, startTime: true, endTime: true, className: true },
  });
  if (schedule) {
    return `ชนกับตาราง "${schedule.subject}" กลุ่ม ${schedule.className} เวลา ${schedule.startTime}-${schedule.endTime}`;
  }

  const bookings = await tx.$queryRaw<Array<{ bookingNo: string; booking_day: Date }>>`
    SELECT b."bookingNo", days.booking_day
    FROM "RoomBooking" b
    CROSS JOIN LATERAL generate_series(
      date_trunc('day', b."startsAt" AT TIME ZONE 'Asia/Bangkok'),
      date_trunc('day', (b."endsAt" - interval '1 millisecond') AT TIME ZONE 'Asia/Bangkok'),
      interval '1 day'
    ) AS days(booking_day)
    WHERE b."roomId" = ${input.roomId}
      AND b."status" IN ('PENDING', 'APPROVED', 'USING')
      AND (${excludeId ?? null}::text IS NULL OR b."id" <> ${excludeId ?? null})
      AND EXTRACT(DOW FROM days.booking_day)::integer = ${dayNumber[input.dayOfWeek]}
      AND days.booking_day::date >= ${input.effectiveFrom}::date
      AND (${input.effectiveTo ?? null}::date IS NULL OR days.booking_day::date <= ${input.effectiveTo ?? null}::date)
      AND (days.booking_day::date + ${input.startTime}::time) < (b."endsAt" AT TIME ZONE 'Asia/Bangkok')
      AND (days.booking_day::date + ${input.endTime}::time) > (b."startsAt" AT TIME ZONE 'Asia/Bangkok')
    ORDER BY days.booking_day
    LIMIT 1
  `;
  if (!bookings[0]) return null;
  const date = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(bookings[0].booking_day);
  return `ชนกับรายการจอง ${bookings[0].bookingNo} วันที่ ${date}`;
}

async function writeScheduleAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  scheduleId: string,
  oldValue: Prisma.InputJsonValue | undefined,
  newValue: Prisma.InputJsonValue,
  request: AuditRequest,
) {
  await tx.auditLog.create({
    data: {
      userId: actor.id,
      action,
      entity: "ROOM_SCHEDULE",
      entityId: scheduleId,
      oldValue,
      newValue,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    },
  });
}

function assertScheduleManager(actor: Actor) {
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.TEACHER) {
    throw new RoomScheduleError("ไม่มีสิทธิ์จัดการตารางสอน", "FORBIDDEN", 403);
  }
}

export async function createRoomSchedule(actor: Actor, input: ScheduleInput, request: AuditRequest) {
  assertScheduleManager(actor);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockRoom(tx, input.roomId);
    const room = await tx.room.findFirst({
      where: { id: input.roomId, deletedAt: null, status: { notIn: [RoomStatus.DISABLED, RoomStatus.MAINTENANCE] } },
      select: { id: true },
    });
    if (!room) throw new RoomScheduleError("ห้องนี้ไม่มีอยู่หรือปิดใช้งาน", "ROOM_UNAVAILABLE", 409);
    const conflict = await findConflict(tx, input);
    if (conflict) {
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "ROOM_SCHEDULE_CONFLICT",
          entity: "ROOM_SCHEDULE",
          newValue: { roomId: input.roomId, dayOfWeek: input.dayOfWeek, conflict },
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
      });
      return { conflict } as const;
    }
    const teacherName = await validateTeacher(tx, input);
    const schedule = await tx.roomSchedule.create({
      data: {
        ...input,
        teacherId: input.teacherId ?? null,
        teacherName,
        courseCode: input.courseCode || null,
        effectiveFrom: asDate(input.effectiveFrom),
        effectiveTo: asDate(input.effectiveTo),
        notes: input.notes || null,
      },
    });
    await writeScheduleAudit(tx, actor, "ROOM_SCHEDULE_CREATE", schedule.id, undefined, auditValue(schedule), request);
    await notifyScheduleChange(tx, schedule, `เพิ่มตาราง ${schedule.subject}`, schedule.updatedAt.toISOString());
    return { schedule } as const;
  });
  if ("conflict" in outcome && outcome.conflict) {
    throw new RoomScheduleError(outcome.conflict, "ROOM_TIME_CONFLICT", 409);
  }
  if (!("schedule" in outcome)) throw new RoomScheduleError("สร้างตารางสอนไม่สำเร็จ", "SCHEDULE_CREATE_FAILED", 500);
  return outcome.schedule;
}

export async function updateRoomSchedule(
  actor: Actor,
  scheduleId: string,
  input: ScheduleInput,
  request: AuditRequest,
) {
  assertScheduleManager(actor);
  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.roomSchedule.findUnique({ where: { id: scheduleId } });
    if (!current) throw new RoomScheduleError("ไม่พบตารางสอน", "SCHEDULE_NOT_FOUND", 404);
    for (const roomId of [...new Set([current.roomId, input.roomId])].sort()) await lockRoom(tx, roomId);
    const room = await tx.room.findFirst({
      where: { id: input.roomId, deletedAt: null, status: { notIn: [RoomStatus.DISABLED, RoomStatus.MAINTENANCE] } },
      select: { id: true },
    });
    if (!room) throw new RoomScheduleError("ห้องนี้ไม่มีอยู่หรือปิดใช้งาน", "ROOM_UNAVAILABLE", 409);
    const conflict = input.status === ScheduleStatus.ACTIVE ? await findConflict(tx, input, current.id) : null;
    if (conflict) {
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: "ROOM_SCHEDULE_CONFLICT",
          entity: "ROOM_SCHEDULE",
          entityId: current.id,
          oldValue: auditValue(current),
          newValue: { ...auditInputValue(input), conflict },
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
      });
      return { conflict } as const;
    }
    const teacherName = await validateTeacher(tx, input);
    const updated = await tx.roomSchedule.update({
      where: { id: current.id },
      data: {
        ...input,
        teacherId: input.teacherId ?? null,
        teacherName,
        courseCode: input.courseCode || null,
        effectiveFrom: asDate(input.effectiveFrom),
        effectiveTo: asDate(input.effectiveTo),
        notes: input.notes || null,
      },
    });
    await markScheduleExpiryNotificationsRead(tx, updated.id);
    await writeScheduleAudit(tx, actor, "ROOM_SCHEDULE_UPDATE", updated.id, auditValue(current), auditValue(updated), request);
    await notifyScheduleChange(
      tx,
      updated,
      `แก้ไขตาราง ${updated.subject}`,
      updated.updatedAt.toISOString(),
    );
    return { schedule: updated } as const;
  });
  if ("conflict" in outcome && outcome.conflict) {
    throw new RoomScheduleError(outcome.conflict, "ROOM_TIME_CONFLICT", 409);
  }
  if (!("schedule" in outcome)) throw new RoomScheduleError("แก้ไขตารางสอนไม่สำเร็จ", "SCHEDULE_UPDATE_FAILED", 500);
  return outcome.schedule;
}

export async function deactivateRoomSchedule(actor: Actor, scheduleId: string, request: AuditRequest) {
  assertScheduleManager(actor);
  return prisma.$transaction(async (tx) => {
    const current = await tx.roomSchedule.findUnique({ where: { id: scheduleId } });
    if (!current) throw new RoomScheduleError("ไม่พบตารางสอน", "SCHEDULE_NOT_FOUND", 404);
    await lockRoom(tx, current.roomId);
    const updated = await tx.roomSchedule.update({
      where: { id: scheduleId },
      data: { status: ScheduleStatus.INACTIVE },
    });
    await markScheduleExpiryNotificationsRead(tx, scheduleId);
    await writeScheduleAudit(tx, actor, "ROOM_SCHEDULE_CANCEL", scheduleId, auditValue(current), auditValue(updated), request);
    await notifyScheduleChange(
      tx,
      updated,
      `ยกเลิกตาราง ${updated.subject}`,
      updated.updatedAt.toISOString(),
    );
    return updated;
  });
}

export async function addScheduleException(
  actor: Actor,
  scheduleId: string,
  date: string,
  reason: string | null | undefined,
  request: AuditRequest,
) {
  assertScheduleManager(actor);
  const schedule = await prisma.roomSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new RoomScheduleError("ไม่พบตารางสอน", "SCHEDULE_NOT_FOUND", 404);
  if (schedule.status !== ScheduleStatus.ACTIVE) {
    throw new RoomScheduleError("ไม่สามารถยกเลิกวันที่ของตารางที่ปิดใช้งานแล้ว", "SCHEDULE_INACTIVE", 409);
  }
  if (date < bangkokDateStamp(new Date())) {
    throw new RoomScheduleError("ไม่สามารถเปลี่ยนประวัติตารางที่ผ่านมาแล้ว", "PAST_SCHEDULE_EXCEPTION", 422);
  }
  if (dayOfWeekForDate(date) !== schedule.dayOfWeek) {
    throw new RoomScheduleError("วันที่เลือกไม่ตรงกับวันประจำสัปดาห์ของตารางนี้", "SCHEDULE_DAY_MISMATCH", 422);
  }
  const dateValue = asDate(date)!;
  if ((schedule.effectiveFrom && dateValue < schedule.effectiveFrom)
    || (schedule.effectiveTo && dateValue > schedule.effectiveTo)) {
    throw new RoomScheduleError("วันที่เลือกอยู่นอกช่วงวันที่มีผลของตาราง", "SCHEDULE_DATE_OUT_OF_RANGE", 422);
  }

  return prisma.$transaction(async (tx) => {
    await lockRoom(tx, schedule.roomId);
    const exception = await tx.roomScheduleException.create({
      data: { scheduleId, date: dateValue, reason: reason || null },
    });
    await markScheduleExpiryNotificationsRead(tx, scheduleId);
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "ROOM_SCHEDULE_EXCEPTION_CREATE",
        entity: "ROOM_SCHEDULE",
        entityId: scheduleId,
        newValue: { date, reason: reason ?? null },
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
      },
    });
    await notifyScheduleChange(
      tx,
      schedule,
      `ยกเลิกการใช้ห้องวันที่ ${date}${reason ? ` (${reason})` : ""}`,
      `exception:${date}`,
    );
    return exception;
  });
}

export async function removeScheduleException(
  actor: Actor,
  scheduleId: string,
  exceptionId: string,
  request: AuditRequest,
) {
  assertScheduleManager(actor);
  return prisma.$transaction(async (tx) => {
    const exception = await tx.roomScheduleException.findFirst({
      where: { id: exceptionId, scheduleId },
      include: {
        schedule: { select: { id: true, roomId: true, teacherId: true, subject: true, updatedAt: true } },
      },
    });
    if (!exception) throw new RoomScheduleError("ไม่พบรายการยกเลิกวันเรียน", "SCHEDULE_EXCEPTION_NOT_FOUND", 404);
    await lockRoom(tx, exception.schedule.roomId);
    await tx.roomScheduleException.delete({ where: { id: exception.id } });
    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "ROOM_SCHEDULE_EXCEPTION_DELETE",
        entity: "ROOM_SCHEDULE",
        entityId: scheduleId,
        oldValue: { date: exception.date.toISOString(), reason: exception.reason },
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
      },
    });
    await notifyScheduleChange(
      tx,
      exception.schedule,
      `คืนตารางการใช้ห้องวันที่ ${exception.date.toISOString().slice(0, 10)}`,
      `exception-removed:${exception.id}`,
    );
  });
}

export function scheduleOccurrence(schedule: {
  id: string;
  roomId: string;
  room: { roomCode: string; roomName: string };
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  subject: string;
  courseCode: string | null;
  teacherName: string;
  className: string;
  semester: string;
  academicYear: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  status: ScheduleStatus;
  exceptions: Array<{ id: string; date: Date; reason: string | null }>;
}, date: string) {
  const stamp = date;
  if (dayOfWeekForDate(stamp) !== schedule.dayOfWeek) return null;
  const start = asDate(stamp)!;
  if (schedule.effectiveFrom && start < schedule.effectiveFrom) return null;
  if (schedule.effectiveTo && start > schedule.effectiveTo) return null;
  if (schedule.exceptions.some((exception) => exception.date.toISOString().slice(0, 10) === stamp)) return null;
  return {
    id: `${schedule.id}:${stamp}`,
    referenceId: schedule.id,
    type: "SCHEDULE" as const,
    roomId: schedule.roomId,
    roomCode: schedule.room.roomCode,
    roomName: schedule.room.roomName,
    title: schedule.subject,
    courseCode: schedule.courseCode,
    teacherName: schedule.teacherName,
    className: schedule.className,
    semester: schedule.semester,
    academicYear: schedule.academicYear,
    dayOfWeek: schedule.dayOfWeek,
    startsAt: bangkokDateTime(stamp, schedule.startTime).toISOString(),
    endsAt: bangkokDateTime(stamp, schedule.endTime).toISOString(),
    status: "SCHEDULED" as const,
    notes: null,
  };
}

export async function getRoomTimetable(actor: Actor, params: {
  weekStart?: string;
  roomId?: string;
  dayOfWeek?: DayOfWeek;
  search?: string;
  teacherId?: string;
  className?: string;
  semester?: string;
  academicYear?: string;
  type?: "ALL" | "SCHEDULE" | "BOOKING";
  status?: string;
}) {
  const today = bangkokDateStamp(new Date());
  const weekStart = mondayOfWeek(params.weekStart ?? today);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const start = bangkokDateTime(weekStart, "00:00");
  const end = bangkokDateTime(addDays(weekStart, 7), "00:00");
  const isStudent = isStudentRole(actor.role);
  const search = params.search?.trim();
  const scheduleWhere: Prisma.RoomScheduleWhereInput = {
    status: ScheduleStatus.ACTIVE,
    room: { deletedAt: null },
    ...(params.roomId ? { roomId: params.roomId } : {}),
    ...(params.dayOfWeek ? { dayOfWeek: params.dayOfWeek } : {}),
    ...(params.teacherId ? { teacherId: params.teacherId } : {}),
    ...(params.className ? { className: { contains: params.className, mode: "insensitive" } } : {}),
    ...(params.semester ? { semester: params.semester } : {}),
    ...(params.academicYear ? { academicYear: params.academicYear } : {}),
    ...(search ? {
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        { courseCode: { contains: search, mode: "insensitive" } },
        { teacherName: { contains: search, mode: "insensitive" } },
        { className: { contains: search, mode: "insensitive" } },
        { room: { roomCode: { contains: search, mode: "insensitive" } } },
      ],
    } : {}),
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: asDate(dates[6])! } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asDate(weekStart)! } }] },
    ],
  };
  const [rooms, schedules, bookings, teachers] = await Promise.all([
    prisma.room.findMany({
      where: { deletedAt: null },
      select: { id: true, roomCode: true, roomName: true, building: true, status: true },
      orderBy: { roomCode: "asc" },
    }),
    params.type === "BOOKING" || (params.status && params.status !== "SCHEDULED")
      ? Promise.resolve([])
      : prisma.roomSchedule.findMany({
      where: scheduleWhere,
      include: {
        room: { select: { roomCode: true, roomName: true } },
        exceptions: { where: { date: { gte: asDate(weekStart)!, lte: asDate(dates[6])! } } },
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      take: 500,
    }),
    params.type === "SCHEDULE" || params.status === "SCHEDULED"
      ? Promise.resolve([])
      : prisma.roomBooking.findMany({
      where: {
        ...(params.roomId ? { roomId: params.roomId } : {}),
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(params.status && params.status !== "SCHEDULED" ? { status: params.status as BookingStatus } : {
          status: { in: [BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.USING, BookingStatus.RETURNED, BookingStatus.CANCELLED, BookingStatus.REJECTED] },
        }),
        ...(search ? {
          OR: [
            ...(!isStudent ? [{ purpose: { contains: search, mode: "insensitive" as const } }] : []),
            { room: { roomCode: { contains: search, mode: "insensitive" } } },
          ],
        } : {}),
      },
      include: {
        room: { select: { roomCode: true, roomName: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 500,
    }),
    actor.role === UserRole.ADMIN || actor.role === UserRole.TEACHER
      ? prisma.user.findMany({
          where: { role: UserRole.TEACHER, status: "ACTIVE", deletedAt: null },
          select: { id: true, firstName: true, lastName: true },
          orderBy: { firstName: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const scheduleEntries = dates
    .flatMap((date) => schedules.map((schedule) => scheduleOccurrence(schedule, date)))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const bookingEntries = bookings.map((booking) => {
    const visiblePerson = !isStudent || booking.userId === actor.id;
    return {
      id: booking.id,
      referenceId: booking.id,
      type: "BOOKING" as const,
      roomId: booking.roomId,
      roomCode: booking.room.roomCode,
      roomName: booking.room.roomName,
      title: visiblePerson ? booking.purpose : "มีรายการจองห้อง",
      courseCode: null,
      teacherName: visiblePerson ? `${booking.user.firstName} ${booking.user.lastName}` : null,
      className: null,
      semester: null,
      academicYear: null,
      dayOfWeek: dayOfWeekForDate(bangkokDateStamp(booking.startsAt)),
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      status: booking.status,
      notes: visiblePerson ? booking.note : null,
    };
  }).filter((booking) => !params.status || booking.status === params.status);
  const entries = [...scheduleEntries, ...bookingEntries].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const filteredEntries = params.dayOfWeek
    ? entries.filter((entry) => entry.dayOfWeek === params.dayOfWeek)
    : entries;
  return {
    weekStart,
    dates,
    rooms,
    teachers: teachers.map((teacher) => ({ id: teacher.id, name: `${teacher.firstName} ${teacher.lastName}` })),
    entries: filteredEntries,
  };
}
