import "server-only";
import {
  BookingStatus,
  NotificationPriority,
  NotificationType,
  ScheduleStatus,
  UserRole,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { addDays, bangkokDateStamp, bangkokDateTime, dayOfWeekForDate } from "@/lib/room-timetable/time.mjs";
import { getExpiryStages, notificationDedupeBase } from "@/lib/room-timetable/notification-policy.mjs";

const settingKeys = {
  reminderMinutes: "ROOM_ENDING_SOON_MINUTES",
  overdueMinutes: "ROOM_OVERDUE_THRESHOLDS_MINUTES",
  notifyAdmins: "ROOM_NOTIFY_ADMINS",
} as const;

export type RoomNotificationSettings = {
  reminderMinutes: number;
  overdueMinutes: number[];
  notifyAdmins: boolean;
};

const defaults: RoomNotificationSettings = {
  reminderMinutes: 15,
  overdueMinutes: [5, 15, 30],
  notifyAdmins: false,
};

function parseThresholds(value: string | undefined) {
  if (!value) return defaults.overdueMinutes;
  const thresholds = [...new Set(value.split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 1440))]
    .sort((a, b) => a - b);
  return thresholds.length ? thresholds : defaults.overdueMinutes;
}

export async function getRoomNotificationSettings(): Promise<RoomNotificationSettings> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: Object.values(settingKeys) } },
    select: { key: true, value: true },
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const reminder = Number(values.get(settingKeys.reminderMinutes));
  return {
    reminderMinutes: Number.isInteger(reminder) && reminder >= 1 && reminder <= 180
      ? reminder
      : defaults.reminderMinutes,
    overdueMinutes: parseThresholds(values.get(settingKeys.overdueMinutes)),
    notifyAdmins: values.get(settingKeys.notifyAdmins) === "true",
  };
}

export async function updateRoomNotificationSettings(input: RoomNotificationSettings, actorId: string) {
  await prisma.$transaction(async (tx) => {
    const entries = [
      [settingKeys.reminderMinutes, String(input.reminderMinutes), "จำนวนนาทีก่อนแจ้งเตือนใกล้หมดเวลา"],
      [settingKeys.overdueMinutes, input.overdueMinutes.join(","), "นาทีหลังหมดเวลาที่แจ้งเตือนเกินเวลา"],
      [settingKeys.notifyAdmins, String(input.notifyAdmins), "ส่งแจ้งเตือนให้ Admin"],
    ] as const;
    for (const [key, value, description] of entries) {
      await tx.systemSetting.upsert({
        where: { key },
        update: { value, description },
        create: { key, value, description },
      });
    }
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "ROOM_NOTIFICATION_SETTINGS_UPDATE",
        entity: "SYSTEM_SETTING",
        newValue: input,
      },
    });
  });
  return input;
}

function uniqueUserIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

async function adminRecipientIds() {
  const admins = await prisma.user.findMany({
    where: { role: UserRole.ADMIN, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  return admins.map(({ id }) => id);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function addEvent(
  rows: Prisma.NotificationCreateManyInput[],
  userIds: string[],
  event: Omit<Prisma.NotificationCreateManyInput, "userId">,
) {
  for (const userId of userIds) {
    rows.push({ ...event, userId, dedupeKey: `${event.dedupeKey}:${userId}` });
  }
}

function makeExpiryEvents(
  rows: Prisma.NotificationCreateManyInput[],
  recipients: string[],
  details: {
    sourceId: string;
    sourceType: "booking" | "schedule";
    roomCode: string;
    startsAt: Date;
    endsAt: Date;
    actionUrl: string;
    subject: string;
    now: Date;
    settings: RoomNotificationSettings;
  },
) {
  const {
    sourceId, sourceType, roomCode, startsAt, endsAt, actionUrl, subject, now, settings,
  } = details;
  const label = sourceType === "schedule" ? "ตามตาราง" : subject;
  const timeRange = `${formatDateTime(startsAt)}–${formatDateTime(endsAt)}`;
  const stages = getExpiryStages(endsAt, now, settings.reminderMinutes, settings.overdueMinutes);
  for (const stage of stages) {
    if (stage === "ENDING_SOON") {
      addEvent(rows, recipients, {
        type: NotificationType.ROOM_ENDING_SOON,
        priority: NotificationPriority.WARNING,
        title: "ห้องใกล้หมดเวลาใช้งาน",
        message: `ห้อง ${roomCode} ${label} (${timeRange}) จะหมดเวลาในอีก ${settings.reminderMinutes} นาที กรุณาเตรียมดำเนินการ`,
        referenceId: sourceId,
        actionUrl,
        dedupeKey: notificationDedupeBase(sourceType, sourceId, endsAt, stage),
      });
    } else if (stage === "ENDED") {
      addEvent(rows, recipients, {
        type: NotificationType.ROOM_USAGE_ENDED,
        priority: NotificationPriority.CRITICAL,
        title: "ถึงเวลาสิ้นสุดการใช้ห้อง",
        message: `ห้อง ${roomCode} ${label} (${timeRange}) สิ้นสุดตามกำหนด ${formatDateTime(endsAt)} แล้ว`,
        referenceId: sourceId,
        actionUrl,
        dedupeKey: notificationDedupeBase(sourceType, sourceId, endsAt, stage),
      });
    } else {
      const minutes = Number(stage.slice("OVERDUE_".length));
      addEvent(rows, recipients, {
        type: NotificationType.ROOM_USAGE_OVERDUE,
        priority: NotificationPriority.CRITICAL,
        title: `ห้องเกินเวลา ${minutes} นาที`,
        message: `ห้อง ${roomCode} ${label} (${timeRange}) เกินเวลาการใช้งานที่กำหนด ${minutes} นาที กรุณาตรวจสอบสถานะ`,
        referenceId: sourceId,
        actionUrl,
        dedupeKey: notificationDedupeBase(sourceType, sourceId, endsAt, stage),
      });
    }
  }
}

export async function runRoomUsageNotificationJob(now = new Date()) {
  const settings = await getRoomNotificationSettings();
  const dateToday = bangkokDateStamp(now);
  const dates = [addDays(dateToday, -1), dateToday, addDays(dateToday, 1)];
  const [bookings, schedules, adminIds] = await Promise.all([
    prisma.roomBooking.findMany({
      where: { status: BookingStatus.USING },
      include: {
        room: {
          select: {
            roomCode: true,
            teachers: { where: { teacher: { status: "ACTIVE", deletedAt: null } }, select: { teacherId: true } },
          },
        },
        user: { select: { id: true } },
      },
      take: 1000,
    }),
    prisma.roomSchedule.findMany({
      where: {
        status: ScheduleStatus.ACTIVE,
        OR: [
          { effectiveFrom: null },
          { effectiveFrom: { lte: new Date(`${dates[2]}T00:00:00.000Z`) } },
        ],
        AND: [
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${dates[0]}T00:00:00.000Z`) } }] },
        ],
      },
      include: {
        room: {
          select: {
            roomCode: true,
            teachers: { where: { teacher: { status: "ACTIVE", deletedAt: null } }, select: { teacherId: true } },
          },
        },
        exceptions: {
          where: {
            date: {
              gte: new Date(`${dates[0]}T00:00:00.000Z`),
              lte: new Date(`${dates[2]}T00:00:00.000Z`),
            },
          },
          select: { date: true },
        },
      },
      take: 1000,
    }),
    settings.notifyAdmins ? adminRecipientIds() : Promise.resolve([]),
  ]);

  const rows: Prisma.NotificationCreateManyInput[] = [];
  for (const booking of bookings) {
    const recipientIds = uniqueUserIds([
      booking.userId,
      ...booking.room.teachers.map(({ teacherId }) => teacherId),
      ...adminIds,
    ]);
    if (!recipientIds.length) continue;
    const startsAt = booking.startedAt ?? booking.startsAt;
    makeExpiryEvents(rows, recipientIds, {
      sourceId: booking.id,
      sourceType: "booking",
      roomCode: booking.room.roomCode,
      startsAt,
      endsAt: booking.endsAt,
      actionUrl: `/borrowings?search=${encodeURIComponent(booking.bookingNo)}`,
      subject: "รายการจอง",
      now,
      settings,
    });
  }

  for (const schedule of schedules) {
    const recipientIds = uniqueUserIds([
      schedule.teacherId,
      ...schedule.room.teachers.map(({ teacherId }) => teacherId),
      ...adminIds,
    ]);
    if (!recipientIds.length) continue;
    for (const date of dates) {
      if (dayOfWeekForDate(date) !== schedule.dayOfWeek) continue;
      const occurrenceDate = new Date(`${date}T00:00:00.000Z`);
      if (schedule.effectiveFrom && occurrenceDate < schedule.effectiveFrom) continue;
      if (schedule.effectiveTo && occurrenceDate > schedule.effectiveTo) continue;
      if (schedule.exceptions.some((exception) => exception.date.toISOString().slice(0, 10) === date)) continue;
      const startsAt = bangkokDateTime(date, schedule.startTime);
      const endsAt = bangkokDateTime(date, schedule.endTime);
      makeExpiryEvents(rows, recipientIds, {
        sourceId: schedule.id,
        sourceType: "schedule",
        roomCode: schedule.room.roomCode,
        startsAt,
        endsAt,
        actionUrl: `/room-timetable?roomId=${encodeURIComponent(schedule.roomId)}&weekStart=${date}`,
        subject: schedule.subject,
        now,
        settings,
      });
    }
  }

  const result = rows.length
    ? await prisma.notification.createMany({ data: rows, skipDuplicates: true })
    : { count: 0 };
  await prisma.auditLog.create({
    data: {
      action: "ROOM_USAGE_NOTIFICATION_JOB",
      entity: "SCHEDULER",
      newValue: {
        checkedAt: now.toISOString(),
        bookingsChecked: bookings.length,
        schedulesChecked: schedules.length,
        notificationCandidates: rows.length,
        notificationsCreated: result.count,
      },
    },
  });
  return {
    bookingsChecked: bookings.length,
    schedulesChecked: schedules.length,
    notificationsCreated: result.count,
    checkedAt: now.toISOString(),
  };
}
