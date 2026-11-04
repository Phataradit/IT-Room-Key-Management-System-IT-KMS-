import assert from "node:assert/strict";
import test from "node:test";
import { calculateDashboardStatistics, resolveDashboardRange } from "../lib/dashboard/statistics.mjs";

test("cancelled and rejected bookings never count as successful room use", () => {
  const range = resolveDashboardRange({ period: "month", month: "2026-11", calendar: [] });
  const result = calculateDashboardStatistics({
    range,
    totalRooms: 5,
    borrowingCount: 2,
    bookings: [
      { roomId: "a", roomCode: "243", roomName: "ห้อง 243", status: "RETURNED", startsAt: new Date("2026-11-02T03:00:00Z"), userRole: "STUDENT" },
      { roomId: "a", roomCode: "243", roomName: "ห้อง 243", status: "USING", startsAt: new Date("2026-11-02T04:00:00Z"), userRole: "TEACHER" },
      { roomId: "b", roomCode: "251", roomName: "ห้อง 251", status: "CANCELLED", startsAt: new Date("2026-11-03T03:00:00Z"), userRole: "STUDENT" },
      { roomId: "b", roomCode: "251", roomName: "ห้อง 251", status: "REJECTED", startsAt: new Date("2026-11-04T03:00:00Z"), userRole: "ADMIN" },
      { roomId: "c", roomCode: "252", roomName: "ห้อง 252", status: "PENDING", startsAt: new Date("2026-11-05T03:00:00Z"), userRole: "STUDENT" },
    ],
  });

  assert.equal(result.summary.totalBookings, 5);
  assert.equal(result.summary.successful, 1);
  assert.equal(result.summary.inProgress, 1);
  assert.equal(result.summary.cancelled, 1);
  assert.equal(result.summary.rejected, 1);
  assert.equal(result.summary.pending, 1);
  assert.equal(result.summary.activeRooms, 1);
  assert.deepEqual(result.summary.topRoom, { roomCode: "243", roomName: "ห้อง 243", count: 2 });
  assert.equal(result.roles.find(({ role }) => role === "ADMIN").count, 0);
  assert.equal(result.weekdays.reduce((sum, { count }) => sum + count, 0), 2);
  const trend = result.trend.find(({ total }) => total > 0);
  assert.equal(trend.total, trend.successful + trend.inProgress + trend.cancelled + trend.pending + trend.approved + trend.rejected);
});

test("daily range is a Bangkok calendar day with an exclusive next-day boundary", () => {
  const range = resolveDashboardRange({ period: "day", date: "2026-11-04", calendar: [] });
  assert.equal(range.startDate.toISOString(), "2026-11-03T17:00:00.000Z");
  assert.equal(range.endDate.toISOString(), "2026-11-04T17:00:00.000Z");
  assert.equal(range.startDay, "2026-11-04");
  assert.equal(range.endDay, "2026-11-05");
});

test("semester report uses the configured academic calendar instead of calendar year boundaries", () => {
  const range = resolveDashboardRange({
    period: "semester",
    year: "2569",
    term: "1",
    calendar: [{ academicYear: 2569, term: 1, startDate: "2026-06-15", endDate: "2026-10-10" }],
  });
  assert.equal(range.startDate.toISOString(), "2026-06-14T17:00:00.000Z");
  assert.equal(range.endDate.toISOString(), "2026-10-10T17:00:00.000Z");
  assert.equal(range.startDay, "2026-06-15");
  assert.equal(range.endDay, "2026-10-11");
});

test("semester report cannot run without a configured calendar entry", () => {
  assert.throws(() => resolveDashboardRange({
    period: "semester",
    year: "2569",
    term: "2",
    calendar: [],
  }), /ไม่พบปฏิทิน/);
});
