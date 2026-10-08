import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function ScannedRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, user] = await Promise.all([params, requireUser()]);
  const room = await prisma.room.findFirst({
    where: { qrToken: token, qrRevokedAt: null, deletedAt: null },
    select: { id: true, roomCode: true, roomName: true, status: true, building: true, floor: true },
  });

  if (!room) notFound();
  const isUnavailable = room.status === "DISABLED" || room.status === "MAINTENANCE";

  return (
    <DashboardShell userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} active="scan">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">ผลการสแกน QR Code</p>
            <h1>{room.roomCode}</h1>
            <p className="welcome-subtitle">{room.roomName}</p>
          </div>
          <span className={`status-pill ${isUnavailable ? "status-maintenance" : "status-available"}`}>
            <span />{isUnavailable ? "ไม่พร้อมให้บริการ" : "ตรวจสอบห้องแล้ว"}
          </span>
        </div>
        <section className="detail-card">
          <h2>ข้อมูลห้อง</h2>
          <dl className="detail-list">
            <div><dt>รหัสห้อง</dt><dd>{room.roomCode}</dd></div>
            <div><dt>ชื่อห้อง</dt><dd>{room.roomName}</dd></div>
            <div><dt>อาคาร</dt><dd>{room.building}</dd></div>
            <div><dt>ชั้น</dt><dd>{room.floor}</dd></div>
          </dl>
          <Link className="outline-button room-result-link" href={`/rooms/${encodeURIComponent(room.roomCode)}`}>
            ดูรายละเอียดห้อง
          </Link>
          {!isUnavailable && (
            <Link className="primary-button room-book-button room-result-link" href={`/borrowings/new?roomId=${encodeURIComponent(room.id)}`}>
              ขอใช้ห้องนี้
            </Link>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
