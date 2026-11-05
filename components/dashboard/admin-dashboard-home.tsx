import Link from "next/link";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { prisma } from "@/lib/db/prisma";

const bookingStatusLabels = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  USING: "กำลังใช้งาน",
  RETURNED: "คืนห้องแล้ว",
  CANCELLED: "ยกเลิก",
  REJECTED: "ไม่อนุมัติ",
} as const;

export async function AdminDashboardHome({ userName }: { userName: string }) {
  const [pendingBookings, activeBookings, overdueBorrows, availableRooms, recentBookings] =
    await prisma.$transaction([
      prisma.roomBooking.count({ where: { status: "PENDING" } }),
      prisma.roomBooking.count({ where: { status: "USING" } }),
      prisma.borrowTransaction.count({ where: { status: "OVERDUE" } }),
      prisma.room.count({ where: { deletedAt: null, status: "AVAILABLE" } }),
      prisma.roomBooking.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          bookingNo: true,
          status: true,
          startsAt: true,
          room: { select: { roomCode: true, roomName: true } },
        },
      }),
    ]);

  const metrics = [
    { label: "คำขอรออนุมัติ", count: pendingBookings, hint: "รายการที่ต้องตรวจสอบ", href: "/borrowings" },
    { label: "ห้องที่กำลังใช้งาน", count: activeBookings, hint: "รายการที่เริ่มใช้งานแล้ว", href: "/borrowings" },
    { label: "กุญแจเกินกำหนด", count: overdueBorrows, hint: "รายการที่ต้องติดตาม", href: "/borrowings" },
    { label: "ห้องพร้อมใช้งาน", count: availableRooms, hint: "ห้องที่เปิดให้บริการ", href: "/rooms" },
  ];

  return (
    <DashboardShell userName={userName} roleLabel="ผู้ดูแลระบบ" userRole="ADMIN" active="dashboard">
      <div className="dashboard-content admin-home-page">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">
              {new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: "Asia/Bangkok" }).format(new Date())}
            </p>
            <h1>สวัสดี, {userName.split(" ")[0]}</h1>
            <p className="welcome-subtitle">ติดตามงานประจำวันและจัดการการใช้ห้องได้ที่นี่</p>
          </div>
        </div>

        <section className="admin-home-metrics" aria-label="สถานะงานประจำวัน">
          {metrics.map((metric) => (
            <Link className="admin-home-metric" href={metric.href} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.count}</strong>
              <small>{metric.hint}</small>
            </Link>
          ))}
        </section>

        <section className="section-block admin-home-recent">
          <div className="section-heading">
            <div><h2>คำขอล่าสุด</h2><p>ตรวจสอบสถานะและดำเนินการกับรายการใช้ห้อง</p></div>
            <Link href="/borrowings" className="text-link">ดูรายการทั้งหมด <span>→</span></Link>
          </div>
          <div className="room-list">
            {recentBookings.map((booking) => (
              <Link className="room-row" href="/borrowings" key={booking.id}>
                <div className="room-info">
                  <strong>{booking.bookingNo} · {booking.room.roomCode}</strong>
                  <span>{booking.room.roomName} <i>·</i> {booking.startsAt.toLocaleString("th-TH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Bangkok",
                  })}</span>
                </div>
                <span className={`status-pill ${booking.status === "RETURNED" ? "status-available" : booking.status === "CANCELLED" || booking.status === "REJECTED" ? "status-empty" : booking.status === "PENDING" ? "status-maintenance" : "status-borrowed"}`}>
                  <span />{bookingStatusLabels[booking.status]}
                </span>
              </Link>
            ))}
            {recentBookings.length === 0 && <p className="empty-state">ยังไม่มีคำขอใช้ห้อง</p>}
          </div>
        </section>

        <Link className="admin-home-statistics-link" href="/statistics">
          ดูสถิติและรายงานการใช้งาน <span aria-hidden="true">→</span>
        </Link>
      </div>
    </DashboardShell>
  );
}
