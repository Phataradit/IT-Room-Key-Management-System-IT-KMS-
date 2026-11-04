import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  calculateDashboardStatistics,
  resolveDashboardRange,
  type DashboardPeriod,
} from "@/lib/dashboard/statistics.mjs";
import { getSemesterCalendar } from "@/lib/dashboard/calendar";

export async function getDashboardStatistics(input: {
  period: DashboardPeriod;
  date?: string;
  month?: string;
  year?: string;
  term?: string;
}) {
  const calendar = await getSemesterCalendar();
  const range = resolveDashboardRange({ ...input, calendar });
  const [bookings, totalRooms, borrowingCount] = await prisma.$transaction([
    prisma.roomBooking.findMany({
      where: { startsAt: { gte: range.startDate, lt: range.endDate } },
      select: {
        roomId: true,
        status: true,
        startsAt: true,
        room: { select: { roomCode: true, roomName: true } },
        user: { select: { role: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    prisma.room.count({ where: { deletedAt: null } }),
    prisma.borrowTransaction.count({
      where: { borrowedAt: { gte: range.startDate, lt: range.endDate } },
    }),
  ]);
  return calculateDashboardStatistics({
    range,
    totalRooms,
    borrowingCount,
    bookings: bookings.map((booking) => ({
      roomId: booking.roomId,
      roomCode: booking.room.roomCode,
      roomName: booking.room.roomName,
      status: booking.status,
      startsAt: booking.startsAt,
      userRole: booking.user.role,
    })),
  });
}
