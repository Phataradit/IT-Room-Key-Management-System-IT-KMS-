const BANGKOK_TIME_ZONE = "Asia/Bangkok";

export const bookingStatusLabels = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  USING: "กำลังใช้งาน",
  RETURNED: "ใช้งานเสร็จแล้ว",
  CANCELLED: "ยกเลิก",
  REJECTED: "ไม่อนุมัติ",
};

const roleLabels = {
  STUDENT: "นักเรียน/นักศึกษา",
  TEACHER: "ครู",
  ADMIN: "ผู้ดูแลระบบ",
};

function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function nextDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function dateKey(date) {
  const { year, month, day } = bangkokParts(date);
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  const { year, month } = bangkokParts(date);
  return `${year}-${month}`;
}

function startOfBangkokDay(dateString) {
  return new Date(`${dateString}T00:00:00+07:00`);
}

export function resolveDashboardRange({ period, date, month, year, term, calendar }) {
  if (period === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new Error("วันที่ไม่ถูกต้อง");
    }
    const startDate = new Date(`${date}T00:00:00Z`);
    if (startDate.toISOString().slice(0, 10) !== date) throw new Error("วันที่ไม่ถูกต้อง");
    const endDate = nextDate(date);
    return {
      period,
      label: new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: BANGKOK_TIME_ZONE })
        .format(startOfBangkokDay(date)),
      startDate: startOfBangkokDay(date),
      endDate: startOfBangkokDay(endDate),
      startDay: date,
      endDay: endDate,
    };
  }

  if (period === "month") {
    if (!/^\d{4}-\d{2}$/.test(month ?? "")) throw new Error("เดือนที่เลือกไม่ถูกต้อง");
    const [yearPart, monthPart] = month.split("-").map(Number);
    if (monthPart < 1 || monthPart > 12) throw new Error("เดือนที่เลือกไม่ถูกต้อง");
    const startDay = `${month}-01`;
    const endDay = new Date(Date.UTC(yearPart, monthPart, 1)).toISOString().slice(0, 10);
    return {
      period,
      label: new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: BANGKOK_TIME_ZONE })
        .format(startOfBangkokDay(startDay)),
      startDate: startOfBangkokDay(startDay),
      endDate: startOfBangkokDay(endDay),
      startDay,
      endDay,
    };
  }

  if (period === "year") {
    const calendarYear = Number(year);
    if (!Number.isInteger(calendarYear) || calendarYear < 2000 || calendarYear > 2100) {
      throw new Error("ปีที่เลือกไม่ถูกต้อง");
    }
    const startDay = `${calendarYear}-01-01`;
    const endDay = `${calendarYear + 1}-01-01`;
    return {
      period,
      label: new Intl.DateTimeFormat("th-TH", { year: "numeric", timeZone: BANGKOK_TIME_ZONE })
        .format(startOfBangkokDay(startDay)),
      startDate: startOfBangkokDay(startDay),
      endDate: startOfBangkokDay(endDay),
      startDay,
      endDay,
    };
  }

  if (period === "semester") {
    const selected = calendar.find((entry) => entry.academicYear === Number(year) && entry.term === Number(term));
    if (!selected) throw new Error("ไม่พบปฏิทินของภาคเรียนที่เลือก กรุณาตั้งค่าปฏิทินก่อน");
    const endDay = nextDate(selected.endDate);
    return {
      period,
      label: `ภาคเรียนที่ ${selected.term} ปีการศึกษา ${selected.academicYear}`,
      startDate: startOfBangkokDay(selected.startDate),
      endDate: startOfBangkokDay(endDay),
      startDay: selected.startDate,
      endDay,
    };
  }

  throw new Error("รูปแบบช่วงเวลาที่เลือกไม่ถูกต้อง");
}

function createTrendBuckets(range) {
  if (range.period === "day") {
    return Array.from({ length: 24 }, (_, hour) => ({
      key: `${range.startDay}T${String(hour).padStart(2, "0")}`,
      label: `${String(hour).padStart(2, "0")}:00`,
      total: 0,
      successful: 0,
      inProgress: 0,
      cancelled: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    }));
  }

  const buckets = [];
  let current = range.startDay.slice(0, 7);
  const last = range.endDay.slice(0, 7);
  while (current < last) {
    buckets.push({
      key: current,
      label: new Intl.DateTimeFormat("th-TH", { month: "short", year: "2-digit", timeZone: BANGKOK_TIME_ZONE })
        .format(startOfBangkokDay(`${current}-01`)),
      total: 0,
      successful: 0,
      inProgress: 0,
      cancelled: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    });
    const [year, month] = current.split("-").map(Number);
    current = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  }
  return buckets;
}

export function calculateDashboardStatistics({ range, bookings, totalRooms, borrowingCount }) {
  const roomMap = new Map();
  const statusCounts = Object.fromEntries(Object.keys(bookingStatusLabels).map((status) => [status, 0]));
  const roleCounts = Object.fromEntries(Object.keys(roleLabels).map((role) => [role, 0]));
  const weekdayCounts = Object.fromEntries(
    ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"].map((day) => [day, 0]),
  );
  const trendBuckets = createTrendBuckets(range);
  const trendByKey = new Map(trendBuckets.map((bucket) => [bucket.key, bucket]));
  const activeRoomIds = new Set();
  let successful = 0;
  let inProgress = 0;
  let cancelled = 0;

  for (const booking of bookings) {
    statusCounts[booking.status] = (statusCounts[booking.status] ?? 0) + 1;
    const room = roomMap.get(booking.roomId) ?? {
      roomId: booking.roomId,
      roomCode: booking.roomCode,
      roomName: booking.roomName,
      total: 0,
      successful: 0,
      inProgress: 0,
      cancelled: 0,
    };
    room.total += 1;

    const parts = bangkokParts(booking.startsAt);
    const weekdayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
    const weekday = Object.keys(weekdayCounts)[weekdayIndex];
    const trendKey = range.period === "day"
      ? `${dateKey(booking.startsAt)}T${parts.hour}`
      : monthKey(booking.startsAt);
    const trend = trendByKey.get(trendKey);
    if (trend) trend.total += 1;
    if (trend && booking.status === "PENDING") trend.pending += 1;
    if (trend && booking.status === "APPROVED") trend.approved += 1;
    if (trend && booking.status === "REJECTED") trend.rejected += 1;

    if (booking.status === "RETURNED") {
      successful += 1;
      room.successful += 1;
      if (trend) trend.successful += 1;
    } else if (booking.status === "USING") {
      inProgress += 1;
      room.inProgress += 1;
      if (trend) trend.inProgress += 1;
    } else if (booking.status === "CANCELLED") {
      cancelled += 1;
      room.cancelled += 1;
      if (trend) trend.cancelled += 1;
    }

    if (booking.status === "RETURNED" || booking.status === "USING") {
      activeRoomIds.add(booking.roomId);
      roleCounts[booking.userRole] = (roleCounts[booking.userRole] ?? 0) + 1;
      if (weekday) weekdayCounts[weekday] += 1;
    }
    roomMap.set(booking.roomId, room);
  }

  const rooms = [...roomMap.values()].sort((a, b) =>
    (b.successful + b.inProgress) - (a.successful + a.inProgress) || a.roomCode.localeCompare(b.roomCode, "th"),
  );
  const topRoom = rooms.find((room) => room.successful + room.inProgress > 0) ?? null;

  return {
    range: {
      period: range.period,
      label: range.label,
      startDay: range.startDay,
      endDay: range.endDay,
    },
    summary: {
      totalRooms,
      borrowingCount,
      totalBookings: bookings.length,
      successful,
      inProgress,
      cancelled,
      pending: statusCounts.PENDING,
      approved: statusCounts.APPROVED,
      rejected: statusCounts.REJECTED,
      activeRooms: activeRoomIds.size,
      topRoom: topRoom
        ? { roomCode: topRoom.roomCode, roomName: topRoom.roomName, count: topRoom.successful + topRoom.inProgress }
        : null,
    },
    trend: trendBuckets,
    rooms,
    statuses: Object.entries(bookingStatusLabels).map(([status, label]) => ({
      status,
      label,
      count: statusCounts[status],
    })),
    weekdays: Object.entries(weekdayCounts).map(([label, count]) => ({ label, count })),
    roles: Object.entries(roleLabels).map(([role, label]) => ({ role, label, count: roleCounts[role] })),
  };
}

export function getBangkokCurrentDate(now = new Date()) {
  return dateKey(now);
}

export function getBangkokCurrentMonth(now = new Date()) {
  return monthKey(now);
}

export function getBangkokCurrentYear(now = new Date()) {
  return Number(bangkokParts(now).year);
}
