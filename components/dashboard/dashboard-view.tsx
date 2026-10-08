"use client";

import Link from "next/link";
import { ClockCircleOutlined, KeyOutlined, QrcodeOutlined } from "@ant-design/icons";
import { DashboardShell } from "@/components/layout/dashboard-shell";

const rooms = [
  { code: "251", name: "ห้อง 251", place: "ตำแหน่งยังไม่ระบุ", status: "available", text: "ว่าง" },
  { code: "252", name: "ห้อง 252", place: "ตำแหน่งยังไม่ระบุ", status: "borrowed", text: "กำลังใช้งาน" },
  { code: "253", name: "ห้อง 253", place: "ตำแหน่งยังไม่ระบุ", status: "available", text: "ว่าง" },
];

type DashboardViewProps = {
  userName: string;
  roleLabel: string;
};

export function DashboardView({ userName, roleLabel }: DashboardViewProps) {
  return (
    <DashboardShell userName={userName} roleLabel={roleLabel} active="dashboard">
      <div className="dashboard-content">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">
              {new Intl.DateTimeFormat("th-TH", { dateStyle: "full", timeZone: "Asia/Bangkok" }).format(new Date())}
            </p>
            <h1>สวัสดี, {userName.split(" ")[0]} <span aria-hidden="true">👋</span></h1>
            <p className="welcome-subtitle">จัดการการยืม-คืนกุญแจห้องของคุณได้ที่นี่</p>
          </div>
          <span className="role-chip">{roleLabel}</span>
        </div>

        <section className="quick-actions" aria-label="เมนูด่วน">
          <Link className="scan-action" href="/scan">
            <span className="scan-icon"><QrcodeOutlined /></span>
            <span><strong>สแกน QR Code</strong><small>สแกนเพื่อดูข้อมูลห้อง</small></span>
            <span className="action-arrow">→</span>
          </Link>
          <Link className="secondary-action" href="/rooms">
            <span className="secondary-icon"><KeyOutlined /></span>
            <span><strong>ค้นหาห้อง</strong><small>ดูสถานะและรายละเอียด</small></span>
            <span className="action-arrow">→</span>
          </Link>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div><h2>สถานะการยืมของคุณ</h2><p>รายการที่กำลังดำเนินการ</p></div>
            <Link href="/history" className="text-link">ประวัติทั้งหมด <span>→</span></Link>
          </div>
          <div className="borrow-card">
            <div className="borrow-card-icon"><KeyOutlined /></div>
            <div className="borrow-card-copy">
              <span className="status-pill status-empty"><span /> ยังไม่มีรายการยืม</span>
              <h3>ยังไม่มีรายการยืมที่กำลังดำเนินการ</h3>
              <p>สแกน QR Code หรือค้นหาห้องเพื่อเริ่มยืมกุญแจ</p>
            </div>
            <Link className="outline-button" href="/rooms">ดูห้องทั้งหมด</Link>
          </div>
        </section>

        <section className="section-block rooms-section">
          <div className="section-heading">
            <div><h2>สถานะห้องล่าสุด</h2><p>ตรวจสอบห้องและความพร้อมใช้งาน</p></div>
            <Link href="/rooms" className="text-link">ดูห้องทั้งหมด <span>→</span></Link>
          </div>
          <div className="room-list">
            {rooms.map((room) => (
              <Link className="room-row" href={`/rooms/${room.code}`} key={room.code}>
                <div className="room-code"><KeyOutlined /></div>
                <div className="room-info"><strong>{room.code}</strong><span>{room.name} <i>·</i> {room.place}</span></div>
                <span className={`status-pill status-${room.status}`}><span />{room.text}</span>
                <span className="room-chevron">›</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="dashboard-footnote">
          <ClockCircleOutlined />
          <span>หากต้องการความช่วยเหลือ กรุณาติดต่อผู้ดูแลระบบ</span>
        </div>
      </div>
    </DashboardShell>
  );
}
