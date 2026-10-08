import "server-only";
import { randomBytes } from "node:crypto";
import {
  BookingStatus,
  NotificationType,
  Prisma,
  RoomStatus,
  UserRole,
  type User,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isStudentRole } from "@/lib/auth/roles";
import { blockingStatuses } from "@/lib/borrowings/schemas";

type BorrowingInput = {
  roomId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  attendeeCount: number;
  note?: string | null;
};

type AuditRequest = {
  ipAddress?: string;
  userAgent?: string;
};

type Actor = Pick<User, "id" | "role" | "firstName" | "lastName">;

export class BorrowingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BorrowingError";
  }
}

function toDate(value: string) {
  return new Date(value);
}

function bangkokDateStamp(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => part.value)
    .join("");
}

async function lockRoom(tx: Prisma.TransactionClient, roomId: string) {
  const rooms = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Room" WHERE "id" = ${roomId} FOR UPDATE
  `;
  if (rooms.length === 0) {
    throw new BorrowingError("ไม่พบห้องที่เลือก", "ROOM_NOT_FOUND", 404);
  }
}

async function lockBooking(tx: Prisma.TransactionClient, bookingId: string) {
  const bookings = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "RoomBooking" WHERE "id" = ${bookingId} FOR UPDATE
  `;
  if (bookings.length === 0) {
    throw new BorrowingError("ไม่พบรายการยืม", "BORROWING_NOT_FOUND", 404);
  }
}

async function validateRoomAndAvailability(
  tx: Prisma.TransactionClient,
  input: BorrowingInput,
  excludeId?: string,
) {
  const room = await tx.room.findFirst({
    where: { id: input.roomId, deletedAt: null },
    select: { id: true, status: true, capacity: true, roomCode: true },
  });

  if (!room) throw new BorrowingError("ไม่พบห้องที่เลือก", "ROOM_NOT_FOUND", 404);
  if (room.status === RoomStatus.DISABLED || room.status === RoomStatus.MAINTENANCE) {
    throw new BorrowingError("ห้องนี้ปิดใช้งานหรืออยู่ระหว่างปรับปรุง", "ROOM_UNAVAILABLE", 409);
  }
  if (room.capacity !== null && input.attendeeCount > room.capacity) {
    throw new BorrowingError(`จำนวนผู้ใช้งานเกินความจุห้อง (${room.capacity} คน)`, "ROOM_CAPACITY_EXCEEDED", 422);
  }

  const startsAt = toDate(input.startsAt);
  const endsAt = toDate(input.endsAt);
  const overlapping = await tx.roomBooking.findFirst({
    where: {
      roomId: room.id,
      status: { in: [...blockingStatuses] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { bookingNo: true },
  });

  if (overlapping) {
    throw new BorrowingError(
      `ช่วงเวลานี้ซ้อนกับรายการ ${overlapping.bookingNo}`,
      "ROOM_TIME_CONFLICT",
      409,
    );
  }

  const scheduleConflicts = await tx.$queryRaw<Array<{ subject: string }>>`
    SELECT s."subject"
    FROM "RoomSchedule" s
    CROSS JOIN LATERAL generate_series(
      date_trunc('day', (${startsAt}::timestamptz AT TIME ZONE 'Asia/Bangkok')),
      date_trunc('day', ((${endsAt} - interval '1 millisecond')::timestamptz AT TIME ZONE 'Asia/Bangkok')),
      interval '1 day'
    ) AS days(booking_day)
    WHERE s."roomId" = ${room.id}
      AND s."status" = 'ACTIVE'
      AND s."dayOfWeek"::text = CASE EXTRACT(DOW FROM booking_day)::integer
        WHEN 0 THEN 'SUNDAY'
        WHEN 1 THEN 'MONDAY'
        WHEN 2 THEN 'TUESDAY'
        WHEN 3 THEN 'WEDNESDAY'
        WHEN 4 THEN 'THURSDAY'
        WHEN 5 THEN 'FRIDAY'
        WHEN 6 THEN 'SATURDAY'
      END
      AND (booking_day::date + s."startTime"::time) <
        (${endsAt}::timestamptz AT TIME ZONE 'Asia/Bangkok')
      AND (booking_day::date + s."endTime"::time) >
        (${startsAt}::timestamptz AT TIME ZONE 'Asia/Bangkok')
    LIMIT 1
  `;

  if (scheduleConflicts[0]) {
    throw new BorrowingError(
      `ช่วงเวลานี้ชนกับตารางห้อง: ${scheduleConflicts[0].subject}`,
      "ROOM_SCHEDULE_CONFLICT",
      409,
    );
  }

  return room;
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  bookingId: string,
  oldValue: Prisma.InputJsonValue | undefined,
  newValue: Prisma.InputJsonValue,
  request: AuditRequest,
) {
  await tx.auditLog.create({
    data: {
      userId: actor.id,
      action,
      entity: "ROOM_BOOKING",
      entityId: bookingId,
      oldValue,
      newValue,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
    },
  });
}

async function notify(
  tx: Prisma.TransactionClient,
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  referenceId: string,
) {
  await tx.notification.create({
    data: { userId, type, title, message, referenceId },
  });
}

export async function createBorrowing(actor: Actor, input: BorrowingInput, request: AuditRequest) {
  return prisma.$transaction(async (tx) => {
    await lockRoom(tx, input.roomId);
    const room = await validateRoomAndAvailability(tx, input);
    const bookingNo = `RM-${bangkokDateStamp(new Date())}-${randomBytes(8).toString("hex").toUpperCase()}`;
    const booking = await tx.roomBooking.create({
      data: {
        bookingNo,
        userId: actor.id,
        roomId: room.id,
        startsAt: toDate(input.startsAt),
        endsAt: toDate(input.endsAt),
        purpose: input.purpose,
        attendeeCount: input.attendeeCount,
        note: input.note || null,
      },
    });

    await notify(
      tx,
      actor.id,
      NotificationType.SYSTEM,
      "ส่งคำขอใช้ห้องแล้ว",
      `คำขอ ${booking.bookingNo} รอการอนุมัติ`,
      booking.id,
    );
    await writeAudit(tx, actor, "ROOM_BOOKING_CREATE", booking.id, undefined, {
      bookingNo,
      roomId: room.id,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: BookingStatus.PENDING,
    }, request);
    return booking;
  });
}

export async function updateBorrowing(
  actor: Actor,
  bookingId: string,
  input: BorrowingInput,
  request: AuditRequest,
) {
  return prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const current = await tx.roomBooking.findUnique({ where: { id: bookingId } });
    if (!current) throw new BorrowingError("ไม่พบรายการยืม", "BORROWING_NOT_FOUND", 404);
    if (current.status !== BookingStatus.PENDING) {
      throw new BorrowingError("แก้ไขได้เฉพาะคำขอที่รออนุมัติ", "INVALID_BORROWING_STATUS", 409);
    }
    if (actor.role === UserRole.TEACHER || (!isStudentRole(actor.role) && actor.role !== UserRole.ADMIN && current.userId !== actor.id)) {
      throw new BorrowingError("ไม่มีสิทธิ์แก้ไขรายการนี้", "FORBIDDEN", 403);
    }

    for (const roomId of [...new Set([current.roomId, input.roomId])].sort()) {
      await lockRoom(tx, roomId);
    }
    const room = await validateRoomAndAvailability(tx, input, current.id);
    const updated = await tx.roomBooking.update({
      where: { id: current.id },
      data: {
        roomId: room.id,
        startsAt: toDate(input.startsAt),
        endsAt: toDate(input.endsAt),
        purpose: input.purpose,
        attendeeCount: input.attendeeCount,
        note: input.note || null,
      },
    });
    await writeAudit(tx, actor, "ROOM_BOOKING_UPDATE", current.id, {
      roomId: current.roomId,
      startsAt: current.startsAt.toISOString(),
      endsAt: current.endsAt.toISOString(),
      purpose: current.purpose,
      attendeeCount: current.attendeeCount,
      note: current.note,
    }, {
      roomId: updated.roomId,
      startsAt: updated.startsAt.toISOString(),
      endsAt: updated.endsAt.toISOString(),
      purpose: updated.purpose,
      attendeeCount: updated.attendeeCount,
      note: updated.note,
    }, request);
    return updated;
  });
}

export async function changeBorrowingStatus(
  actor: Actor,
  bookingId: string,
  action: "approve" | "reject" | "start" | "return" | "cancel",
  request: AuditRequest,
  detail?: { reason?: string; returnNote?: string },
) {
  return prisma.$transaction(async (tx) => {
    await lockBooking(tx, bookingId);
    const current = await tx.roomBooking.findUnique({
      where: { id: bookingId },
      include: { room: { select: { roomCode: true } } },
    });
    if (!current) throw new BorrowingError("ไม่พบรายการยืม", "BORROWING_NOT_FOUND", 404);

    if (action === "approve" || action === "reject") {
      if (actor.role !== UserRole.TEACHER && actor.role !== UserRole.ADMIN) {
        throw new BorrowingError("เฉพาะครูหรือผู้ดูแลระบบเท่านั้นที่อนุมัติรายการได้", "FORBIDDEN", 403);
      }
      if (current.status !== BookingStatus.PENDING) {
        throw new BorrowingError("รายการนี้ไม่อยู่ในสถานะรออนุมัติ", "INVALID_BORROWING_STATUS", 409);
      }
      if (action === "approve") {
        await lockRoom(tx, current.roomId);
        await validateRoomAndAvailability(tx, {
          roomId: current.roomId,
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt.toISOString(),
          purpose: current.purpose,
          attendeeCount: current.attendeeCount,
          note: current.note,
        }, current.id);
      }

      const updated = await tx.roomBooking.update({
        where: { id: current.id },
        data: action === "approve"
          ? { status: BookingStatus.APPROVED, approvedById: actor.id, approvedAt: new Date() }
          : {
              status: BookingStatus.REJECTED,
              rejectedById: actor.id,
              rejectedAt: new Date(),
              rejectionReason: detail?.reason || null,
            },
      });
      await notify(
        tx,
        current.userId,
        NotificationType.SYSTEM,
        action === "approve" ? "คำขอใช้ห้องได้รับอนุมัติ" : "คำขอใช้ห้องถูกปฏิเสธ",
        action === "approve"
          ? `รายการ ${current.bookingNo} ห้อง ${current.room.roomCode} ได้รับอนุมัติ`
          : `รายการ ${current.bookingNo} ถูกปฏิเสธ${detail?.reason ? `: ${detail.reason}` : ""}`,
        current.id,
      );
      await writeAudit(tx, actor, action === "approve" ? "ROOM_BOOKING_APPROVE" : "ROOM_BOOKING_REJECT", current.id, {
        status: current.status,
      }, {
        status: updated.status,
        reason: detail?.reason ?? null,
      }, request);
      return updated;
    }

    if (action === "start") {
      if (current.userId !== actor.id && actor.role !== UserRole.TEACHER && actor.role !== UserRole.ADMIN) {
        throw new BorrowingError("ไม่มีสิทธิ์เริ่มใช้งานรายการนี้", "FORBIDDEN", 403);
      }
      if (current.status !== BookingStatus.APPROVED) {
        throw new BorrowingError("เริ่มใช้งานได้เฉพาะรายการที่อนุมัติแล้ว", "INVALID_BORROWING_STATUS", 409);
      }
      const now = new Date();
      if (now < current.startsAt || now >= current.endsAt) {
        throw new BorrowingError("เริ่มใช้งานได้เฉพาะในช่วงเวลาที่จอง", "OUTSIDE_BOOKING_WINDOW", 409);
      }
      await lockRoom(tx, current.roomId);
      const updated = await tx.roomBooking.update({
        where: { id: current.id },
        data: { status: BookingStatus.USING, startedAt: now },
      });
      await writeAudit(tx, actor, "ROOM_BOOKING_START", current.id, { status: current.status }, { status: updated.status }, request);
      return updated;
    }

    if (action === "return") {
      if (actor.role !== UserRole.TEACHER && actor.role !== UserRole.ADMIN) {
        throw new BorrowingError("เฉพาะครูหรือผู้ดูแลระบบเท่านั้นที่ยืนยันการคืนได้", "FORBIDDEN", 403);
      }
      if (current.status !== BookingStatus.USING) {
        throw new BorrowingError("ยืนยันคืนได้เฉพาะห้องที่กำลังใช้งาน", "INVALID_BORROWING_STATUS", 409);
      }
      const updated = await tx.roomBooking.update({
        where: { id: current.id },
        data: {
          status: BookingStatus.RETURNED,
          returnedAt: new Date(),
          returnedById: actor.id,
          returnNote: detail?.returnNote || null,
        },
      });
      await notify(tx, current.userId, NotificationType.SYSTEM, "ยืนยันการคืนห้องแล้ว", `รายการ ${current.bookingNo} คืนห้องเรียบร้อย`, current.id);
      await writeAudit(tx, actor, "ROOM_BOOKING_RETURN", current.id, { status: current.status }, {
        status: updated.status,
        returnNote: updated.returnNote,
      }, request);
      return updated;
    }

    if (action === "cancel") {
      const isOwnerPending = current.userId === actor.id && current.status === BookingStatus.PENDING;
      const isAdminCancellable = actor.role === UserRole.ADMIN
        && (current.status === BookingStatus.PENDING || current.status === BookingStatus.APPROVED);
      if (!isOwnerPending && !isAdminCancellable) {
        throw new BorrowingError("ยกเลิกได้เฉพาะคำขอของตนที่รออนุมัติ หรือรายการรออนุมัติของผู้ดูแลระบบ", "FORBIDDEN", 403);
      }
      const updated = await tx.roomBooking.update({
        where: { id: current.id },
        data: { status: BookingStatus.CANCELLED },
      });
      await notify(tx, current.userId, NotificationType.SYSTEM, "ยกเลิกรายการจองแล้ว", `รายการ ${current.bookingNo} ถูกยกเลิก`, current.id);
      await writeAudit(tx, actor, "ROOM_BOOKING_CANCEL", current.id, { status: current.status }, { status: updated.status }, request);
      return updated;
    }

    throw new BorrowingError("ไม่รองรับการดำเนินการนี้", "INVALID_ACTION", 400);
  });
}
