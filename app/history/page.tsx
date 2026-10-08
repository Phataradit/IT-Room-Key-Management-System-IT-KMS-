import { DashboardShell } from "@/components/layout/dashboard-shell";
import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function HistoryPage() {
  const user = await requireUser();
  const transactions = await prisma.borrowTransaction.findMany({
    where: { userId: user.id },
    orderBy: { borrowedAt: "desc" },
    take: 50,
    include: { room: { select: { roomCode: true, roomName: true } } },
  });

  return (
    <DashboardShell userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} active="history">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">รายการของฉัน</p>
            <h1>ประวัติการยืม-คืน</h1>
            <p className="welcome-subtitle">แสดงเฉพาะรายการที่คุณเป็นผู้ยืม</p>
          </div>
        </div>
        <section className="room-list history-list">
          {transactions.map((transaction) => (
            <article className="room-row" key={transaction.id}>
              <div className="room-info">
                <strong>{transaction.transactionNo} · {transaction.room.roomCode}</strong>
                <span>{transaction.room.roomName} <i>·</i> {transaction.borrowedAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <span className={`status-pill ${transaction.status === "RETURNED" ? "status-available" : transaction.status === "OVERDUE" ? "status-maintenance" : transaction.status === "CANCELLED" ? "status-empty" : "status-borrowed"}`}>
                <span />{transaction.status === "RETURNED" ? "คืนแล้ว" : transaction.status === "OVERDUE" ? "เกินกำหนด" : transaction.status === "CANCELLED" ? "ยกเลิก" : "กำลังยืม"}
              </span>
            </article>
          ))}
          {transactions.length === 0 && <p className="empty-state">ยังไม่มีประวัติการยืม</p>}
        </section>
      </div>
    </DashboardShell>
  );
}
