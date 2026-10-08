import { BorrowStatus } from "@prisma/client";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function RoomsPage() {
  const user = await requireUser();
  const rooms = await prisma.room.findMany({
    where: { deletedAt: null },
    orderBy: { roomCode: "asc" },
    include: {
      borrows: {
        where: {
          status: { in: [BorrowStatus.PENDING, BorrowStatus.BORROWED, BorrowStatus.OVERDUE] },
          returnedAt: null,
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  return (
    <DashboardShell userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} active="rooms">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">IT ROOM KEY MANAGEMENT SYSTEM</p>
            <h1>ห้องทั้งหมด</h1>
            <p className="welcome-subtitle">ค้นหาและตรวจสอบสถานะห้องในวิทยาลัย</p>
          </div>
        </div>
        <section className="room-list">
          {rooms.map((room) => {
            const status = room.status === "MAINTENANCE" ? "maintenance" : room.borrows.length ? "borrowed" : room.status === "DISABLED" ? "maintenance" : "available";
            const label = room.status === "MAINTENANCE" ? "ปิดปรับปรุง" : room.status === "DISABLED" ? "ปิดใช้งาน" : room.borrows.length ? "กำลังใช้งาน" : "ว่าง";
            return (
              <a className="room-row" href={`/rooms/${encodeURIComponent(room.roomCode)}`} key={room.id}>
                <div className="room-code">{room.roomCode.slice(0, 1)}</div>
                <div className="room-info">
                  <strong>{room.roomCode} · {room.roomName}</strong>
                  <span>อาคาร {room.building} <i>·</i> ชั้น {room.floor}</span>
                </div>
                <span className={`status-pill status-${status}`}><span />{label}</span>
                <span className="room-chevron">›</span>
              </a>
            );
          })}
          {rooms.length === 0 && <p className="empty-state">ยังไม่มีข้อมูลห้อง</p>}
        </section>
      </div>
    </DashboardShell>
  );
}
