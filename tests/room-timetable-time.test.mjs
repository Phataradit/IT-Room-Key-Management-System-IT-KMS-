import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  bangkokDateStamp,
  bangkokDateTime,
  dayOfWeekForDate,
  intervalsOverlap,
  mondayOfWeek,
  timeToMinutes,
} from "../lib/room-timetable/time.mjs";
import {
  getExpiryStages,
  notificationDedupeBase,
} from "../lib/room-timetable/notification-policy.mjs";

test("weekly date helpers use calendar dates and Monday-first weeks", () => {
  assert.equal(mondayOfWeek("2026-10-11"), "2026-10-05");
  assert.equal(addDays("2026-10-05", 6), "2026-10-11");
  assert.equal(dayOfWeekForDate("2026-10-05"), "MONDAY");
  assert.equal(dayOfWeekForDate("2026-10-11"), "SUNDAY");
});

test("Bangkok date conversion is independent of the host timezone", () => {
  assert.equal(bangkokDateStamp(new Date("2026-10-08T17:30:00.000Z")), "2026-10-09");
  assert.equal(bangkokDateTime("2026-10-09", "08:00").toISOString(), "2026-10-09T01:00:00.000Z");
});

test("time and interval validation handles adjacent and overlapping slots", () => {
  assert.equal(timeToMinutes("08:30"), 510);
  assert.equal(intervalsOverlap(8 * 60, 10 * 60, 10 * 60, 11 * 60), false);
  assert.equal(intervalsOverlap(8 * 60, 10 * 60, 9 * 60 + 30, 11 * 60), true);
  assert.throws(() => timeToMinutes("25:00"), RangeError);
});

test("expiry stages include the configured reminder and overdue thresholds", () => {
  const endsAt = new Date("2026-10-09T05:00:00.000Z");
  assert.deepEqual(
    getExpiryStages(endsAt, new Date("2026-10-09T04:45:00.000Z"), 15, [5, 15, 30]),
    ["ENDING_SOON"],
  );
  assert.deepEqual(
    getExpiryStages(endsAt, new Date("2026-10-09T05:15:00.000Z"), 15, [5, 15, 30]),
    ["ENDED", "OVERDUE_5", "OVERDUE_15"],
  );
  assert.deepEqual(
    getExpiryStages(endsAt, new Date("2026-10-09T04:44:59.000Z"), 15, [5, 15, 30]),
    [],
  );
});

test("notification dedupe keys stay stable per event and change with the end time", () => {
  const end = new Date("2026-10-09T05:00:00.000Z");
  const first = notificationDedupeBase("booking", "booking-1", end, "ENDING_SOON");
  assert.equal(first, notificationDedupeBase("booking", "booking-1", end, "ENDING_SOON"));
  assert.notEqual(first, notificationDedupeBase("booking", "booking-1", new Date(end.getTime() + 60_000), "ENDING_SOON"));
});
