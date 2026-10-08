import { DashboardShell } from "@/components/layout/dashboard-shell";
import { BookingForm } from "@/components/borrowings/booking-form";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function NewBorrowingPage({
  searchParams,
}: {
  searchParams: Promise<{ roomId?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const rooms = await prisma.room.findMany({
    where: { deletedAt: null, status: { notIn: ["DISABLED", "MAINTENANCE"] } },
    select: { id: true, roomCode: true, roomName: true, capacity: true },
    orderBy: { roomCode: "asc" },
  });

  return (
    <DashboardShell userName={user.name} roleLabel={getRoleLabel(user.role)} active="borrowings">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">คำขอใช้ห้อง</p>
            <h1>สร้างรายการยืมห้อง</h1>
            <p className="welcome-subtitle">เลือกห้องและช่วงเวลา ระบบจะตรวจสอบตารางและรายการจองซ้ำให้</p>
          </div>
        </div>
        <section className="detail-card booking-form-card">
          <BookingForm
            rooms={rooms}
            initial={query.roomId ? {
              roomId: query.roomId,
              startsAt: "",
              endsAt: "",
              purpose: "",
              attendeeCount: 1,
              note: null,
            } : undefined}
          />
        </section>
      </div>
    </DashboardShell>
  );
}
