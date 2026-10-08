import { notFound } from "next/navigation";
import Link from "next/link";
import { BorrowStatus } from "@prisma/client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const [{ roomCode }, user] = await Promise.all([params, requireUser()]);
  const room = await prisma.room.findFirst({
    where: { roomCode, deletedAt: null },
    include: {
      keys: { orderBy: { keyCode: "asc" } },
      borrows: {
        where: {
          status: { in: [BorrowStatus.PENDING, BorrowStatus.BORROWED, BorrowStatus.OVERDUE] },
          returnedAt: null,
        },
        orderBy: { borrowedAt: "desc" },
        take: 1,
        select: { id: true, borrowedAt: true, expectedReturnAt: true },
      },
      bookings: {
        where: { status: { in: ["APPROVED", "USING"] }, endsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { id: true, startsAt: true, endsAt: true, status: true },
      },
      schedules: {
        where: { status: "ACTIVE" },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        take: 8,
        select: { dayOfWeek: true, startTime: true, endTime: true, subject: true, className: true },
      },
    },
  });
  if (!room) notFound();

  const isMaintenance = room.status === "MAINTENANCE" || room.status === "DISABLED";
  const isBorrowed = room.borrows.length > 0 || room.bookings.some((booking) => booking.status === "USING");
  const isReserved = room.bookings.some((booking) => booking.status === "APPROVED");
  const status = isMaintenance ? "maintenance" : isBorrowed || isReserved ? "borrowed" : "available";
  const statusLabel = room.status === "DISABLED" ? "ปิดใช้งาน" : room.status === "MAINTENANCE" ? "ปิดปรับปรุง" : isBorrowed ? "กำลังใช้งาน" : isReserved ? "มีรายการจอง" : "ว่าง";
  const dayNames: Record<string, string> = {
    MONDAY: "จันทร์",
    TUESDAY: "อังคาร",
    WEDNESDAY: "พุธ",
    THURSDAY: "พฤหัสบดี",
    FRIDAY: "ศุกร์",
    SATURDAY: "เสาร์",
    SUNDAY: "อาทิตย์",
  };

  return (
    <DashboardShell userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} active="rooms">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow"><Link className="text-link" href="/rooms">ห้องทั้งหมด</Link> / รายละเอียดห้อง</p>
            <h1>{room.roomCode}</h1>
            <p className="welcome-subtitle">{room.roomName}</p>
          </div>
          <span className={`status-pill status-${status}`}><span />{statusLabel}</span>
        </div>
        <section className="room-detail-grid">
          <article className="detail-card">
            <h2>ข้อมูลห้อง</h2>
            <dl className="detail-list">
              <div><dt>อาคาร</dt><dd>{room.building}</dd></div>
              <div><dt>ชั้น</dt><dd>{room.floor}</dd></div>
              <div><dt>ประเภทห้อง</dt><dd>{room.roomType.replaceAll("_", " ")}</dd></div>
              <div><dt>ความจุ</dt><dd>{room.capacity ? `${room.capacity} คน` : "ไม่ระบุ"}</dd></div>
              <div><dt>จำนวนกุญแจ</dt><dd>{room.keys.length} ดอก</dd></div>
            </dl>
            {room.description && <p className="detail-description">{room.description}</p>}
          </article>
          <article className="detail-card">
            <h2>สถานะการยืม</h2>
            {room.bookings[0] ? (
              <div className="borrow-status-detail">
                <span className={`status-pill ${room.bookings[0].status === "USING" ? "status-borrowed" : "status-available"}`}>
                  <span />{room.bookings[0].status === "USING" ? "กำลังใช้งาน" : "จองแล้ว"}
                </span>
                <p>เวลาเริ่ม {room.bookings[0].startsAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
                <p>เวลาสิ้นสุด {room.bookings[0].endsAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
              </div>
            ) : room.borrows[0] ? (
              <div className="borrow-status-detail">
                <span className="status-pill status-borrowed"><span />{room.borrows[0].expectedReturnAt < new Date() ? "เกินกำหนด" : "กำลังใช้งาน"}</span>
                <p>ยืมเมื่อ {room.borrows[0].borrowedAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</p>
                <p>กำหนดคืน {room.borrows[0].expectedReturnAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
            ) : <p className="empty-state">ห้องนี้ยังไม่มีรายการยืมที่กำลังดำเนินการ</p>}
            {isMaintenance && <p className="detail-description">ห้องนี้ยังไม่พร้อมให้บริการ</p>}
            {!isMaintenance && !isBorrowed && !isReserved && (
              <Link className="primary-button room-book-button" href={`/borrowings/new?roomId=${encodeURIComponent(room.id)}`}>
                ขอใช้ห้อง
              </Link>
            )}
          </article>
        </section>
        <section className="section-block">
          <div className="section-heading"><div><h2>ตารางประจำห้อง</h2><p>กำหนดการใช้ห้อง</p></div></div>
          <div className="room-list">
            {room.schedules.map((schedule) => (
              <div className="room-row" key={`${schedule.dayOfWeek}-${schedule.startTime}-${schedule.subject}`}>
                <div className="room-info">
                  <strong>{dayNames[schedule.dayOfWeek]} · {schedule.startTime}–{schedule.endTime}</strong>
                  <span>{schedule.subject} <i>·</i> {schedule.className}</span>
                </div>
              </div>
            ))}
            {room.schedules.length === 0 && <p className="empty-state">ยังไม่มีตารางประจำห้อง</p>}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
