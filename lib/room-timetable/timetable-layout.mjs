import { timeToMinutes } from "./time.mjs";

const openingTime = 7 * 60 + 30;
const firstPeriodStart = 8 * 60;
const closingTime = 21 * 60;
const periodMinutes = 60;

export function getTimetablePeriods() {
  return Array.from({ length: 13 }, (_, index) => ({
    number: index + 1,
    start: firstPeriodStart + index * periodMinutes,
    end: firstPeriodStart + (index + 1) * periodMinutes,
  }));
}

export function getTimetableTimeHeaders(timelineStart, timelineEnd) {
  if (!Number.isInteger(timelineStart) || !Number.isInteger(timelineEnd) || timelineStart >= timelineEnd) {
    throw new RangeError("Timetable bounds must be increasing whole minutes");
  }

  const headers = [];
  for (let cursor = timelineStart; cursor < openingTime; ) {
    const end = Math.min(openingTime, cursor + periodMinutes);
    headers.push({ start: cursor, end, number: null, label: `${formatTime(cursor)}–${formatTime(end)}` });
    cursor = end;
  }

  if (timelineStart < firstPeriodStart && timelineEnd > openingTime) {
    headers.push({ start: openingTime, end: firstPeriodStart, number: null, label: "07:30–08:00" });
  }

  for (const period of getTimetablePeriods()) {
    if (period.end <= timelineStart || period.start >= timelineEnd) continue;
    headers.push({
      ...period,
      start: Math.max(period.start, timelineStart),
      end: Math.min(period.end, timelineEnd),
      label: `${formatTime(period.start)}–${formatTime(period.end)}`,
    });
  }

  for (let cursor = closingTime; cursor < timelineEnd; ) {
    const end = Math.min(timelineEnd, cursor + periodMinutes);
    headers.push({ start: cursor, end, number: null, label: `${formatTime(cursor)}–${formatTime(end)}` });
    cursor = end;
  }

  return headers.filter((header) => header.start < timelineEnd && header.end > timelineStart);
}

function formatTime(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function getCoveredPeriods(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start >= end) throw new RangeError("Timetable end time must be after start time");

  return getTimetablePeriods()
    .filter((period) => start < period.end && end > period.start)
    .map((period) => period.number);
}

export function layoutTimetableEntries(entries) {
  const normalized = entries.map((entry) => {
    const start = timeToMinutes(entry.startTime);
    const end = timeToMinutes(entry.endTime);
    if (start >= end) throw new RangeError(`Timetable entry ${entry.id} has an invalid time range`);
    if (!entry.dayOfWeek || !entry.roomId || !entry.id) {
      throw new TypeError("Timetable entries require an id, day, and room");
    }
    return { entry, start, end };
  });

  const timelineStart = Math.min(openingTime, ...normalized.map(({ start }) => start));
  const timelineEnd = Math.max(closingTime, ...normalized.map(({ end }) => end));
  const laneEnds = new Map();
  const placements = normalized
    .sort((left, right) => left.entry.dayOfWeek.localeCompare(right.entry.dayOfWeek) || left.start - right.start || left.end - right.end)
    .map(({ entry, start, end }) => {
      const dayLanes = laneEnds.get(entry.dayOfWeek) ?? [];
      let lane = dayLanes.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) lane = dayLanes.length;
      dayLanes[lane] = end;
      laneEnds.set(entry.dayOfWeek, dayLanes);

      return {
        entry,
        start,
        end,
        lane,
        gridColumnStart: start - timelineStart + 1,
        gridColumnEnd: end - timelineStart + 1,
        coveredPeriods: getCoveredPeriods(entry.startTime, entry.endTime),
      };
    });

  return { timelineStart, timelineEnd, placements };
}
