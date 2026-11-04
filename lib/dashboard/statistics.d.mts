export type DashboardPeriod = "day" | "month" | "semester" | "year";
export type SemesterCalendarEntry = {
  academicYear: number;
  term: number;
  startDate: string;
  endDate: string;
};
export type DashboardRange = {
  period: DashboardPeriod;
  label: string;
  startDate: Date;
  endDate: Date;
  startDay: string;
  endDay: string;
};
export function resolveDashboardRange(input: {
  period: DashboardPeriod;
  date?: string;
  month?: string;
  year?: string | number;
  term?: string | number;
  calendar: SemesterCalendarEntry[];
}): DashboardRange;
export function calculateDashboardStatistics(input: {
  range: DashboardRange;
  totalRooms: number;
  borrowingCount: number;
  bookings: Array<{
    roomId: string;
    roomCode: string;
    roomName: string;
    status: string;
    startsAt: Date;
    userRole: string;
  }>;
}): {
  range: { period: DashboardPeriod; label: string; startDay: string; endDay: string };
  summary: {
    totalRooms: number;
    borrowingCount: number;
    totalBookings: number;
    successful: number;
    inProgress: number;
    cancelled: number;
    pending: number;
    approved: number;
    rejected: number;
    activeRooms: number;
    topRoom: { roomCode: string; roomName: string; count: number } | null;
  };
  trend: Array<{
    key: string;
    label: string;
    total: number;
    successful: number;
    inProgress: number;
    cancelled: number;
    pending: number;
    approved: number;
    rejected: number;
  }>;
  rooms: Array<{ roomId: string; roomCode: string; roomName: string; total: number; successful: number; inProgress: number; cancelled: number }>;
  statuses: Array<{ status: string; label: string; count: number }>;
  weekdays: Array<{ label: string; count: number }>;
  roles: Array<{ role: string; label: string; count: number }>;
};
export function getBangkokCurrentDate(now?: Date): string;
export function getBangkokCurrentMonth(now?: Date): string;
export function getBangkokCurrentYear(now?: Date): number;
