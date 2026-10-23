export type TimetableLayoutEntry = {
  id: string;
  dayOfWeek: string;
  roomId: string;
  startTime: string;
  endTime: string;
};

export type TimetablePlacement<T extends TimetableLayoutEntry> = {
  entry: T;
  start: number;
  end: number;
  lane: number;
  gridColumnStart: number;
  gridColumnEnd: number;
  coveredPeriods: number[];
};

export function getTimetablePeriods(): Array<{ number: number; start: number; end: number }>;
export function getTimetableTimeHeaders(
  timelineStart: number,
  timelineEnd: number,
): Array<{ start: number; end: number; number: number | null; label: string }>;
export function getCoveredPeriods(startTime: string, endTime: string): number[];
export function layoutTimetableEntries<T extends TimetableLayoutEntry>(entries: T[]): {
  timelineStart: number;
  timelineEnd: number;
  placements: Array<TimetablePlacement<T>>;
};
