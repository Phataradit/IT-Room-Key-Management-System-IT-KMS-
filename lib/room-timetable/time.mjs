const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function bangkokDateStamp(date) {
  const parts = bangkokFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateStamp, days) {
  const [year, month, day] = dateStamp.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function mondayOfWeek(dateStamp) {
  const [year, month, day] = dateStamp.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay();
  return addDays(dateStamp, dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
}

export function dayOfWeekForDate(dateStamp) {
  const [year, month, day] = dateStamp.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][value];
}

export function bangkokDateTime(dateStamp, time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new RangeError("Time must use HH:mm in 24-hour format");
  const [year, month, day] = dateStamp.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(match[1]) - 7, Number(match[2])));
}

export function timeToMinutes(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new RangeError("Time must use HH:mm in 24-hour format");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}
