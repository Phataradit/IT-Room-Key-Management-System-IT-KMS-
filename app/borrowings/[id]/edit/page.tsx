import { notFound, redirect } from "next/navigation";
import { BookingForm } from "@/components/borrowings/booking-form";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function EditBorrowingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const booking = await prisma.roomBooking.findUnique({ where: { id } });
  if (!booking) notFound();
  if (
    booking.status !== "PENDING"
    || (user.role !== "ADMIN" && booking.userId !== user.id)
    || user.role === "TEACHER"
  ) {
    redirect("/borrowings");
  }

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
            <p className="eyebrow">{booking.bookingNo}</p>
            <h1>แก้ไขคำขอใช้ห้อง</h1>
            <p className="welcome-subtitle">แก้ไขได้จนกว่าครูหรือผู้ดูแลระบบจะอนุมัติ</p>
          </div>
        </div>
        <section className="detail-card booking-form-card">
          <BookingForm
            rooms={rooms}
            initial={{
              id: booking.id,
              roomId: booking.roomId,
              startsAt: booking.startsAt.toISOString(),
              endsAt: booking.endsAt.toISOString(),
              purpose: booking.purpose,
              attendeeCount: booking.attendeeCount,
              note: booking.note,
            }}
          />
        </section>
      </div>
    </DashboardShell>
  );
}
