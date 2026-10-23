import assert from "node:assert/strict";
import test from "node:test";
import {
  getCoveredPeriods,
  getTimetablePeriods,
  getTimetableTimeHeaders,
  layoutTimetableEntries,
} from "../lib/room-timetable/timetable-layout.mjs";

function entry(id, dayOfWeek, roomId, startTime, endTime) {
  return { id, dayOfWeek, roomId, startTime, endTime };
}

test("period coverage handles one-hour, multi-hour, and exact boundary ranges", () => {
  assert.deepEqual(getCoveredPeriods("08:00", "09:00"), [1]);
  assert.deepEqual(getCoveredPeriods("08:00", "10:00"), [1, 2]);
  assert.deepEqual(getCoveredPeriods("12:00", "14:00"), [5, 6]);
  assert.deepEqual(getCoveredPeriods("16:00", "20:00"), [9, 10, 11, 12]);
  assert.deepEqual(getCoveredPeriods("07:30", "08:00"), []);
  assert.deepEqual(getCoveredPeriods("08:15", "09:45"), [1, 2]);
});

test("invalid time values and reversed intervals are rejected", () => {
  assert.throws(() => getCoveredPeriods("25:00", "26:00"), RangeError);
  assert.throws(() => getCoveredPeriods("09:00", "08:00"), RangeError);
  assert.throws(() => layoutTimetableEntries([entry("bad", "MONDAY", "room-1", "08:00", "08:00")]), RangeError);
});

test("timetable keeps all 13 periods and a distinct pre-period header", () => {
  const periods = getTimetablePeriods();
  assert.equal(periods.length, 13);
  assert.deepEqual([periods[0].number, periods[0].start, periods[0].end], [1, 480, 540]);
  assert.deepEqual([periods[12].number, periods[12].start, periods[12].end], [13, 1200, 1260]);

  const headers = getTimetableTimeHeaders(450, 1260);
  assert.deepEqual(headers[0], { start: 450, end: 480, number: null, label: "07:30–08:00" });
  assert.deepEqual(headers.slice(1).map(({ number }) => number), periods.map(({ number }) => number));
});

test("layout spans real minutes, isolates days, and stacks overlapping entries", () => {
  const entries = [
    entry("two-hours", "WEDNESDAY", "243", "08:00", "10:00"),
    entry("same-room-overlap", "WEDNESDAY", "243", "09:30", "10:30"),
    entry("different-room-overlap", "WEDNESDAY", "251", "09:30", "10:30"),
    entry("next-day", "THURSDAY", "243", "08:00", "10:00"),
  ];
  const layout = layoutTimetableEntries(entries);
  const placements = new Map(layout.placements.map((placement) => [placement.entry.id, placement]));

  assert.equal(layout.timelineStart, 450);
  assert.equal(layout.timelineEnd, 1260);
  assert.equal(placements.get("two-hours").gridColumnEnd - placements.get("two-hours").gridColumnStart, 120);
  assert.equal(placements.get("two-hours").lane, 0);
  assert.equal(placements.get("same-room-overlap").lane, 1);
  assert.equal(placements.get("different-room-overlap").lane, 2);
  assert.equal(placements.get("next-day").lane, 0);
});

test("entries touching at a period boundary do not overlap", () => {
  const layout = layoutTimetableEntries([
    entry("first", "MONDAY", "243", "08:00", "09:00"),
    entry("next", "MONDAY", "243", "09:00", "10:00"),
  ]);
  assert.deepEqual(layout.placements.map(({ lane }) => lane), [0, 0]);
});

test("headers extend when an event is outside the normal timetable", () => {
  const layout = layoutTimetableEntries([
    entry("early", "MONDAY", "243", "07:00", "07:30"),
    entry("late", "MONDAY", "243", "21:00", "22:00"),
  ]);
  assert.equal(layout.timelineStart, 420);
  assert.equal(layout.timelineEnd, 1320);
  assert.deepEqual(getTimetableTimeHeaders(layout.timelineStart, layout.timelineEnd).at(-1), {
    start: 1260,
    end: 1320,
    number: null,
    label: "21:00–22:00",
  });
});
