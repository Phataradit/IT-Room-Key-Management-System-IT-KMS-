"use client";

import Link from "next/link";
import {
  AppstoreOutlined,
  BellOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  FileTextOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { SignOutButton } from "@/components/layout/sign-out-button";

type DashboardShellProps = {
  children: React.ReactNode;
  userName: string;
  roleLabel: string;
  active: string;
};

const navigation = [
  { href: "/dashboard", label: "หน้าหลัก", icon: <HomeOutlined />, key: "dashboard" },
  { href: "/rooms", label: "ห้องทั้งหมด", icon: <AppstoreOutlined />, key: "rooms" },
  { href: "/scan", label: "สแกน QR", icon: <QrcodeOutlined />, key: "scan" },
  { href: "/borrowings", label: "ยืม-คืนห้อง", icon: <FileTextOutlined />, key: "borrowings" },
  { href: "/history", label: "ประวัติการยืม", icon: <ClockCircleOutlined />, key: "history" },
];

export function DashboardShell({ children, userName, roleLabel, active }: DashboardShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/dashboard">
          <span className="sidebar-logo">K</span>
          <span><strong>IT-KMS</strong><small>KEY MANAGEMENT</small></span>
        </Link>
        <div className="sidebar-caption">เมนูหลัก</div>
        <nav className="sidebar-nav" aria-label="เมนูหลัก">
          {navigation.map((item) => (
            <Link className={`nav-link ${active === item.key ? "active" : ""}`} href={item.href} key={item.key}>
              {item.icon}<span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-help">
          <div className="help-mark">?</div>
          <strong>ต้องการความช่วยเหลือ?</strong>
          <span>ติดต่อผู้ดูแลระบบของคุณ</span>
          <a href="mailto:admin@itkms.local">ติดต่อเรา <span>→</span></a>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="breadcrumb">ระบบจัดการกุญแจ <span>/</span> หน้าหลัก</div>
          <div className="topbar-actions">
            <span className="icon-button" aria-label="การแจ้งเตือน"><BellOutlined /><i /></span>
            <div className="topbar-divider" />
            <div className="user-menu">
              <div className="avatar">{userName.charAt(0)}</div>
              <div className="user-meta"><strong>{userName}</strong><span>{roleLabel}</span></div>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main>{children}</main>
        <nav className="mobile-nav" aria-label="เมนูมือถือ">
          <Link href="/dashboard" className={active === "dashboard" ? "active" : ""}><HomeOutlined /><span>หน้าหลัก</span></Link>
          <Link href="/rooms" className={active === "rooms" ? "active" : ""}><AppstoreOutlined /><span>ห้อง</span></Link>
          <Link href="/scan" className="mobile-scan"><QrcodeOutlined /><span>สแกน</span></Link>
          <Link href="/borrowings" className={active === "borrowings" ? "active" : ""}><FileTextOutlined /><span>จอง</span></Link>
          <Link href="/history" className={active === "history" ? "active" : ""}><ClockCircleOutlined /><span>ประวัติ</span></Link>
        </nav>
      </div>
    </div>
  );
}
