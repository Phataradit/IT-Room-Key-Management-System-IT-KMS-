import { DashboardShell } from "@/components/layout/dashboard-shell";
import { QrScanner } from "@/components/qr/qr-scanner";
import { requireUser } from "@/lib/auth/guards";
import { getRoleLabel } from "@/lib/auth/roles";

export const instant = false;

export default async function ScanPage() {
  const user = await requireUser();
  return (
    <DashboardShell userName={user.name ?? "ผู้ใช้งาน"} roleLabel={getRoleLabel(user.role)} active="scan">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">สแกนเพื่อดูข้อมูลห้อง</p>
            <h1>สแกน QR Code</h1>
            <p className="welcome-subtitle">สแกน QR Code ของห้อง หรือถ่ายภาพ QR เพื่อเปิดจากมือถือ</p>
          </div>
        </div>
        <QrScanner />
      </div>
    </DashboardShell>
  );
}
