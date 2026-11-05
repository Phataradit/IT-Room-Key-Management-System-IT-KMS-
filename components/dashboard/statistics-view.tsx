"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { DashboardPeriod, SemesterCalendarEntry } from "@/lib/dashboard/statistics.mjs";
import type { UserRole } from "@prisma/client";

type DashboardData = {
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

const periodLabels: Record<DashboardPeriod, string> = {
  day: "รายวัน",
  month: "รายเดือน",
  semester: "รายภาคเรียน",
  year: "รายปี",
};

function currentBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function maxCount(items: Array<{ count: number }>) {
  return Math.max(1, ...items.map(({ count }) => count));
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const result = await response.json() as { success: boolean; data?: T; message?: string };
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.message ?? "ไม่สามารถโหลดข้อมูลได้");
  }
  return result.data;
}

export function StatisticsView({ userName, userRole, roleLabel }: {
  userName: string;
  userRole: UserRole;
  roleLabel: string;
}) {
  const canManageCalendar = userRole === "ADMIN";
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const [date, setDate] = useState(currentBangkokDate());
  const [month, setMonth] = useState(currentBangkokDate().slice(0, 7));
  const [year, setYear] = useState(currentBangkokDate().slice(0, 4));
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("1");
  const [calendar, setCalendar] = useState<SemesterCalendarEntry[]>([]);
  const [calendarLoaded, setCalendarLoaded] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadedRequest, setLoadedRequest] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const printRequestPending = useRef(false);
  const [authorizingPrint, setAuthorizingPrint] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [newYear, setNewYear] = useState(String(Number(currentBangkokDate().slice(0, 4)) + 543));
  const [newTerm, setNewTerm] = useState("1");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const items = await readApiResponse<SemesterCalendarEntry[]>(
          await fetch("/api/admin/dashboard/calendar", { signal: controller.signal }),
        );
        setCalendar(items);
        if (items.length > 0) {
          const latest = [...items].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
          setAcademicYear(String(latest.academicYear));
          setTerm(String(latest.term));
        }
        setCalendarLoaded(true);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name !== "AbortError") {
          setCalendarMessage(loadError.message);
          setCalendarLoaded(true);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ period });
    if (period === "day") params.set("date", date);
    if (period === "month") params.set("month", month);
    if (period === "year") params.set("year", year);
    if (period === "semester") params.set("year", academicYear);
    if (period === "semester") params.set("term", term);
    return params.toString();
  }, [academicYear, date, month, period, term, year]);

  const requestKey = `${query}:${refreshKey}`;
  const loading = loadedRequest !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/dashboard/statistics?${query}`, { signal: controller.signal })
      .then(readApiResponse<DashboardData>)
      .then((result) => {
        setData(result);
        setError("");
        setLoadedRequest(requestKey);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") {
          setData(null);
          setError(loadError.message);
          setLoadedRequest(requestKey);
        }
      });
    return () => controller.abort();
  }, [query, requestKey]);

  useEffect(() => {
    if (!printRequestPending.current || !data || loading) return;
    printRequestPending.current = false;
    const previousTitle = document.title;
    document.title = `IT-KMS-Statistics-${periodLabels[period]}-${data.range.startDay}`;
    window.addEventListener("afterprint", () => {
      document.title = previousTitle;
    }, { once: true });
    window.print();
  }, [data, loading, period]);

  const availableYears = useMemo(
    () => [...new Set(calendar.map((entry) => entry.academicYear))].sort((a, b) => b - a),
    [calendar],
  );
  const availableTerms = useMemo(
    () => calendar.filter((entry) => entry.academicYear === Number(academicYear))
      .sort((a, b) => a.term - b.term),
    [academicYear, calendar],
  );
  const largestTrendValue = Math.max(1, ...(data?.trend.map(({ total }) => total) ?? []));
  const largestRoomValue = Math.max(1, ...(data?.rooms.map((room) => room.successful + room.inProgress) ?? []));
  const largestWeekdayValue = maxCount(data?.weekdays ?? []);
  const largestRoleValue = maxCount(data?.roles ?? []);

  function addCalendarEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      academicYear: Number(newYear),
      term: Number(newTerm),
      startDate: newStart,
      endDate: newEnd,
    };
    if (!next.startDate || !next.endDate) {
      setCalendarMessage("กรุณาระบุวันเริ่มและวันสิ้นสุดภาคเรียน");
      return;
    }
    setCalendar((current) => [...current, next].sort(
      (a, b) => a.startDate.localeCompare(b.startDate),
    ));
    setCalendarMessage("");
    setNewStart("");
    setNewEnd("");
  }

  async function saveCalendar() {
    setSavingCalendar(true);
    setCalendarMessage("");
    try {
      const response = await fetch("/api/admin/dashboard/calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calendar),
      });
      const saved = await readApiResponse<SemesterCalendarEntry[]>(response);
      setCalendar(saved);
      setCalendarMessage("บันทึกปฏิทินภาคเรียนแล้ว");
      setRefreshKey((value) => value + 1);
    } catch (saveError) {
      setCalendarMessage(saveError instanceof Error ? saveError.message : "บันทึกปฏิทินไม่สำเร็จ");
    } finally {
      setSavingCalendar(false);
    }
  }

  async function printReport() {
    if (!data || loading) return;
    setAuthorizingPrint(true);
    setError("");
    try {
      const currentData = await readApiResponse<DashboardData>(
        await fetch(`/api/admin/dashboard/statistics?${query}`, { cache: "no-store" }),
      );
      setData(currentData);
      printRequestPending.current = true;
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "ไม่สามารถตรวจสอบสิทธิ์เพื่อออกรายงานได้");
    } finally {
      setAuthorizingPrint(false);
    }
  }

  return (
    <DashboardShell userName={userName} roleLabel={roleLabel} userRole={userRole} active="statistics">
      <div className="admin-dashboard-page">
        <div className="dashboard-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">IT-KMS · สถิติจากฐานข้อมูลจริง</p>
              <h1>สถิติการใช้งานห้องเรียน</h1>
              <p className="welcome-subtitle">ภาพรวมและการวิเคราะห์ข้อมูลการใช้งานระบบ IT-KMS</p>
              <p className="welcome-subtitle">นิยามใช้งานสำเร็จ = คืนห้องแล้วเท่านั้น รายการยกเลิกและปฏิเสธไม่นับเป็นการใช้สำเร็จ</p>
            </div>
            <button type="button" className="admin-report-button" onClick={() => void printReport()} disabled={!data || loading || authorizingPrint}>
              {authorizingPrint ? "กำลังตรวจสอบสิทธิ์..." : "พิมพ์ / บันทึก PDF"}
            </button>
          </div>

          <section className="admin-dashboard-controls" aria-label="ตัวกรองรายงาน">
            <label>
              ช่วงรายงาน
              <select value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}>
                {Object.entries(periodLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </select>
            </label>
            {period === "day" && (
              <label>วันที่<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            )}
            {period === "month" && (
              <label>เดือน<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
            )}
            {period === "year" && (
              <label>ปี ค.ศ.<input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} /></label>
            )}
            {period === "semester" && (
              <>
                <label>
                  ปีการศึกษา
                  <select value={academicYear} onChange={(event) => {
                    setAcademicYear(event.target.value);
                    const firstTerm = calendar.find((entry) => entry.academicYear === Number(event.target.value));
                    if (firstTerm) setTerm(String(firstTerm.term));
                  }}>
                    {availableYears.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  ภาคเรียน
                  <select value={term} onChange={(event) => setTerm(event.target.value)}>
                    {availableTerms.map((entry) => (
                      <option key={`${entry.academicYear}-${entry.term}`} value={entry.term}>ภาคเรียนที่ {entry.term}</option>
                    ))}
                  </select>
                </label>
                {calendarLoaded && availableTerms.length === 0 && (
                  <span className="admin-calendar-hint">
                    {canManageCalendar
                      ? "ตั้งค่าปฏิทินภาคเรียนด้านล่างก่อนดูรายงาน"
                      : "ยังไม่มีปฏิทินภาคเรียน โปรดติดต่อผู้ดูแลระบบ"}
                  </span>
                )}
              </>
            )}
            <span className="admin-data-status" role="status">{loading ? "กำลังโหลดข้อมูล..." : data?.range.label}</span>
          </section>

          {error && <p className="admin-dashboard-error" role="alert">{error}</p>}

          {data && (
            <div className="dashboard-print-report" id="statistics-print-report">
              <div className="dashboard-print-heading">
                <h2>รายงานสถิติการใช้งานห้อง IT-KMS</h2>
                <p>ช่วงเวลา: {data.range.label} ({data.range.startDay} ถึงก่อน {data.range.endDay})</p>
                <p>นิยาม: ใช้งานสำเร็จคือสถานะ “คืนแล้ว”; กำลังใช้งานนับแยก; ยกเลิกและปฏิเสธไม่นับเป็นการใช้สำเร็จ</p>
              </div>

              <section className="admin-stat-grid" aria-label="สถิติภาพรวม">
                <article className="admin-stat-card"><span>ห้องทั้งหมด</span><strong>{data.summary.totalRooms}</strong><small>ห้องที่ยังไม่ถูกลบในระบบ</small></article>
                <article className="admin-stat-card"><span>รายการจองห้อง</span><strong>{data.summary.totalBookings}</strong><small>ทุกสถานะตามวันเริ่มจอง</small></article>
                <article className="admin-stat-card"><span>ยืมกุญแจ</span><strong>{data.summary.borrowingCount}</strong><small>รายการตามวันยืม</small></article>
                <article className="admin-stat-card"><span>ใช้งานสำเร็จ</span><strong>{data.summary.successful}</strong><small>เฉพาะรายการที่คืนห้องแล้ว</small></article>
                <article className="admin-stat-card"><span>กำลังใช้งาน</span><strong>{data.summary.inProgress}</strong><small>เริ่มใช้แล้วและยังไม่คืน</small></article>
                <article className="admin-stat-card"><span>ยกเลิก</span><strong>{data.summary.cancelled}</strong><small>แยกจากรายการใช้งานสำเร็จ</small></article>
                <article className="admin-stat-card"><span>ห้องที่มีการใช้งาน</span><strong>{data.summary.activeRooms}</strong><small>ห้องไม่ซ้ำ สถานะคืนแล้วหรือกำลังใช้</small></article>
                <article className="admin-stat-card"><span>ห้องใช้มากที่สุด</span><strong>{data.summary.topRoom?.roomCode ?? "—"}</strong><small>{data.summary.topRoom ? `${data.summary.topRoom.count} ครั้ง · ${data.summary.topRoom.roomName}` : "ไม่มีรายการใช้งาน"}</small></article>
              </section>

              <section className="admin-chart-grid">
                <article className="admin-chart-card admin-chart-wide">
                  <h2>แนวโน้มรายการตามช่วงเวลา</h2>
                  <p>ทุกสถานะแยกตามรายการจอง ไม่รวมยอดเป็นการใช้งานสำเร็จ</p>
                  <div className={`admin-trend-list ${period === "day" ? "admin-trend-hourly" : ""}`}>
                    {data.trend.map((bucket) => (
                      <div className="admin-trend-row" key={bucket.key}>
                        <span>{bucket.label}</span>
                        <div className="admin-bar-track" title={`รายการทั้งหมด ${bucket.total}`}>
                          <i className="admin-bar-success" style={{ width: `${bucket.successful / largestTrendValue * 100}%` }} />
                          <i className="admin-bar-using" style={{ width: `${bucket.inProgress / largestTrendValue * 100}%` }} />
                          <i className="admin-bar-cancelled" style={{ width: `${bucket.cancelled / largestTrendValue * 100}%` }} />
                          <i className="admin-bar-pending" style={{ width: `${bucket.pending / largestTrendValue * 100}%` }} />
                          <i className="admin-bar-approved" style={{ width: `${bucket.approved / largestTrendValue * 100}%` }} />
                          <i className="admin-bar-rejected" style={{ width: `${bucket.rejected / largestTrendValue * 100}%` }} />
                        </div>
                        <strong>{bucket.total}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="admin-chart-legend">
                    <span>สำเร็จ</span><span>กำลังใช้</span><span>ยกเลิก</span>
                    <span>รออนุมัติ</span><span>อนุมัติแล้ว</span><span>ไม่อนุมัติ</span>
                  </div>
                </article>

                <article className="admin-chart-card">
                  <h2>สถานะการจอง</h2>
                  <p>หนึ่งรายการถูกนับเพียงสถานะเดียว</p>
                  <ul className="admin-count-list">
                    {data.statuses.map(({ status, label, count }) => (
                      <li key={status}><span>{label}</span><strong>{count}</strong></li>
                    ))}
                  </ul>
                </article>

                <article className="admin-chart-card">
                  <h2>การใช้งานตามวันในสัปดาห์</h2>
                  <p>เฉพาะรายการคืนแล้วหรือกำลังใช้งาน</p>
                  <ul className="admin-mini-bars">
                    {data.weekdays.map(({ label, count }) => (
                      <li key={label}><span>{label}</span><i><b style={{ width: `${count / largestWeekdayValue * 100}%` }} /></i><strong>{count}</strong></li>
                    ))}
                  </ul>
                </article>

                <article className="admin-chart-card">
                  <h2>ตามประเภทผู้ใช้งาน</h2>
                  <p>นับรายการคืนแล้วหรือกำลังใช้งาน</p>
                  <ul className="admin-count-list">
                    {data.roles.map(({ role, label, count }) => (
                      <li key={role}><span>{label}</span><strong>{count}</strong></li>
                    ))}
                  </ul>
                  <div className="admin-role-bars">
                    {data.roles.map(({ role, count }) => (
                      <i key={role} title={`${role}: ${count}`} style={{ width: `${count / largestRoleValue * 100}%` }} />
                    ))}
                  </div>
                </article>

                <article className="admin-chart-card admin-chart-wide">
                  <h2>ห้องที่มีการใช้งาน</h2>
                  <p>เรียงจากจำนวนรายการคืนแล้วหรือกำลังใช้งานมากที่สุด</p>
                  {data.rooms.length === 0 ? <p className="admin-empty">ไม่มีรายการในช่วงเวลานี้</p> : (
                    <ul className="admin-room-bars">
                      {data.rooms.slice(0, 12).map((room) => {
                        const activity = room.successful + room.inProgress;
                        return (
                          <li key={room.roomId}>
                            <span>{room.roomCode} · {room.roomName}</span>
                            <i><b style={{ width: `${activity / largestRoomValue * 100}%` }} /></i>
                            <strong>{activity}</strong>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              </section>

              <section className="admin-chart-card admin-room-table-card">
                <h2>รายละเอียดตามห้อง</h2>
                <div className="admin-table-scroll">
                  <table>
                    <thead><tr><th>ห้อง</th><th>รายการจอง</th><th>สำเร็จ</th><th>กำลังใช้</th><th>ยกเลิก</th></tr></thead>
                    <tbody>
                      {data.rooms.length === 0
                        ? <tr><td colSpan={5} className="admin-empty">ไม่มีข้อมูลในช่วงเวลานี้</td></tr>
                        : data.rooms.map((room) => (
                          <tr key={room.roomId}>
                            <td>{room.roomCode} · {room.roomName}</td>
                            <td>{room.total}</td>
                            <td>{room.successful}</td>
                            <td>{room.inProgress}</td>
                            <td>{room.cancelled}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <p className="dashboard-print-footer">วันที่ออกรายงาน: {new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(new Date())} · IT-KMS</p>
            </div>
          )}

          {canManageCalendar && <details className="admin-calendar-settings">
            <summary>ตั้งค่าปฏิทินภาคเรียน</summary>
            <p>กำหนดวันเริ่มต้นและวันสิ้นสุดจริงของแต่ละภาคเรียน รายงานจะรวมข้อมูลตั้งแต่วันเริ่มต้นถึงวันสิ้นสุดที่กำหนด</p>
            {calendarMessage && <p className={calendarMessage.includes("บันทึก") ? "admin-calendar-success" : "admin-dashboard-error"} role="status">{calendarMessage}</p>}
            <div className="admin-calendar-list">
              {calendar.map((entry, index) => (
                <div className="admin-calendar-row" key={`${entry.academicYear}-${entry.term}`}>
                  <strong>ภาคเรียน {entry.term}/{entry.academicYear}</strong>
                  <span>{entry.startDate} – {entry.endDate}</span>
                  <button type="button" onClick={() => setCalendar((current) => current.filter((_, itemIndex) => itemIndex !== index))}>ลบ</button>
                </div>
              ))}
              {calendar.length === 0 && <p className="admin-empty">ยังไม่ได้กำหนดปฏิทินภาคเรียน</p>}
            </div>
            <form className="admin-calendar-form" onSubmit={addCalendarEntry}>
              <label>ปีการศึกษา<input type="number" min="2000" max="2700" value={newYear} onChange={(event) => setNewYear(event.target.value)} required /></label>
              <label>ภาคเรียน<select value={newTerm} onChange={(event) => setNewTerm(event.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
              <label>วันเริ่ม<input type="date" value={newStart} onChange={(event) => setNewStart(event.target.value)} required /></label>
              <label>วันสิ้นสุด<input type="date" value={newEnd} onChange={(event) => setNewEnd(event.target.value)} required /></label>
              <button type="submit" className="admin-calendar-add">เพิ่มภาคเรียน</button>
            </form>
            <button type="button" className="admin-report-button" onClick={() => void saveCalendar()} disabled={savingCalendar}>
              {savingCalendar ? "กำลังบันทึก..." : "บันทึกปฏิทิน"}
            </button>
          </details>}
        </div>
      </div>
    </DashboardShell>
  );
}
