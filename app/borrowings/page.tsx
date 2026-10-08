import Link from "next/link";
import { BorrowingsTable } from "@/components/borrowings/borrowings-table";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel, isStudentRole } from "@/lib/auth/roles";

export const instant = false;

export default async function BorrowingsPage() {
  const user = await requireUser();
  const rooms = await prisma.room.findMany({
    where: { deletedAt: null },
    select: { id: true, roomCode: true, roomName: true },
    orderBy: { roomCode: "asc" },
  });

  return (
    <DashboardShell userName={user.name} roleLabel={getRoleLabel(user.role)} active="borrowings">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">ระบบบริหารการใช้ห้อง</p>
            <h1>รายการยืม-คืนห้อง</h1>
            <p className="welcome-subtitle">
              {isStudentRole(user.role) ? "แสดงเฉพาะคำขอและประวัติของคุณ" : "ตรวจสอบ อนุมัติ และจัดการรายการใช้ห้อง"}
            </p>
          </div>
        </div>
        <BorrowingsTable actorId={user.id} role={user.role} rooms={rooms} />
        <p className="booking-flow-note">
          <Link href="/rooms">เลือกห้อง</Link> → ส่งคำขอ → ครูหรือผู้ดูแลระบบอนุมัติ → เริ่มใช้งานตามเวลาจอง → ครูหรือผู้ดูแลระบบยืนยันคืน
        </p>
      </div>
    </DashboardShell>
  );
}
