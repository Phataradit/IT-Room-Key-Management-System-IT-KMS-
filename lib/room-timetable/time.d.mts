export function bangkokDateStamp(date: Date): string;
export function addDays(dateStamp: string, days: number): string;
export function mondayOfWeek(dateStamp: string): string;
export function dayOfWeekForDate(
  dateStamp: string,
): "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";
export function bangkokDateTime(dateStamp: string, time: string): Date;
export function timeToMinutes(time: string): number;
export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean;
