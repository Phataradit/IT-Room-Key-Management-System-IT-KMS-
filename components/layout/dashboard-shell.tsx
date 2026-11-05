"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  MenuOutlined,
  HomeOutlined,
  FileTextOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { Drawer } from "antd";
import type { UserRole } from "@prisma/client";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SignOutButton } from "@/components/layout/sign-out-button";

type DashboardShellProps = {
  children: React.ReactNode;
  userName: string;
  roleLabel: string;
  userRole: UserRole;
  active: string;
};

const baseNavigation = [
  { href: "/dashboard", label: "หน้าหลัก", icon: <HomeOutlined />, key: "dashboard" },
  { href: "/rooms", label: "ห้องทั้งหมด", icon: <AppstoreOutlined />, key: "rooms" },
  { href: "/room-timetable", label: "ตารางประจำห้อง", icon: <CalendarOutlined />, key: "room-timetable" },
  { href: "/scan", label: "สแกน QR", icon: <QrcodeOutlined />, key: "scan" },
  { href: "/borrowings", label: "ยืม-คืนห้อง", icon: <FileTextOutlined />, key: "borrowings" },
  { href: "/history", label: "ประวัติการยืม", icon: <ClockCircleOutlined />, key: "history" },
];

const statisticsNavigationItem = {
  href: "/statistics",
  label: "สถิติ",
  icon: <BarChartOutlined />,
  key: "statistics",
};

export function DashboardShell({ children, userName, roleLabel, userRole, active }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigation = userRole === "ADMIN" || userRole === "TEACHER"
    ? [baseNavigation[0], statisticsNavigationItem, ...baseNavigation.slice(1)]
    : baseNavigation;

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;

      document.documentElement.dataset.authCheck = "pending";
      void fetch("/api/auth/session", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not verify the restored session");
          const session = await response.json();
          if (!session?.user?.id) {
            window.location.replace("/login");
            return;
          }
          delete document.documentElement.dataset.authCheck;
        })
        .catch(() => window.location.replace("/login?logout=verify-error"));
    }

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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
            <NotificationBell />
            <div className="topbar-divider" />
            <div className="user-menu">
              <div className="avatar">{userName.charAt(0)}</div>
              <div className="user-meta"><strong>{userName}</strong><span>{roleLabel}</span></div>
              <SignOutButton />
            </div>
            <button
              className="mobile-menu-toggle"
              type="button"
              aria-label="เปิดเมนู"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <MenuOutlined />
            </button>
          </div>
        </header>
        <main>{children}</main>
        <Drawer
          title="เมนู IT-KMS"
          placement="left"
          width="min(88vw, 360px)"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          className="mobile-menu-drawer"
        >
          <div className="mobile-drawer-user">
            <div className="avatar">{userName.charAt(0)}</div>
            <div className="user-meta">
              <strong>{userName}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>
          <nav className="mobile-drawer-nav" aria-label="เมนูหลัก">
            {navigation.map((item) => (
              <Link
                className={`mobile-drawer-link ${active === item.key ? "active" : ""}`}
                href={item.href}
                key={item.key}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.icon}<span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <SignOutButton />
        </Drawer>
      </div>
    </div>
  );
}
