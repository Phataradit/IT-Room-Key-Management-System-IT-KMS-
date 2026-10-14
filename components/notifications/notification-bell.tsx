"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Empty, List, Popover, Space, Tag, Typography, message } from "antd";
import { BellOutlined } from "@ant-design/icons";

type NotificationItem = {
  id: string;
  type: string;
  priority: "NORMAL" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationResponse = {
  success: boolean;
  data?: NotificationItem[];
  unreadCount?: number;
};

const priorityColor = {
  NORMAL: "blue",
  WARNING: "orange",
  CRITICAL: "red",
} as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export function NotificationBell() {
  const router = useRouter();
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?pageSize=6", {
        cache: "no-store",
        signal,
      });
      const result = await response.json() as NotificationResponse;
      if (!response.ok || !result.success) throw new Error("โหลดการแจ้งเตือนไม่สำเร็จ");
      setItems(result.data ?? []);
      setUnreadCount(result.unreadCount ?? 0);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      messageApi.error("โหลดการแจ้งเตือนไม่สำเร็จ");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadNotifications(controller.signal), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      controller.abort();
    };
  }, [loadNotifications]);

  const markAllRead = async () => {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    if (!response.ok) {
      messageApi.error("ทำเครื่องหมายอ่านทั้งหมดไม่สำเร็จ");
      return;
    }
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.isRead) {
      const response = await fetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" });
      if (!response.ok) {
        messageApi.error("ปรับสถานะการแจ้งเตือนไม่สำเร็จ");
        return;
      }
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, isRead: true } : entry));
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    if (item.actionUrl?.startsWith("/")) router.push(item.actionUrl);
  };

  const content = (
    <div className="notification-popover">
      <div className="notification-popover-heading">
        <Typography.Text strong>การแจ้งเตือน</Typography.Text>
        {unreadCount > 0 && <Button size="small" type="link" onClick={() => void markAllRead()}>อ่านทั้งหมด</Button>}
      </div>
      <List
        loading={loading}
        dataSource={items}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ยังไม่มีการแจ้งเตือน" /> }}
        renderItem={(item) => (
          <List.Item
            className={`notification-popover-item ${item.isRead ? "" : "unread"}`}
            onClick={() => void openNotification(item)}
          >
            <Space align="start" size={10}>
              <Tag color={priorityColor[item.priority]}>{item.priority === "CRITICAL" ? "สำคัญ" : item.priority === "WARNING" ? "เตือน" : "ทั่วไป"}</Tag>
              <div>
                <Typography.Text strong={!item.isRead}>{item.title}</Typography.Text>
                <Typography.Paragraph className="notification-message" ellipsis={{ rows: 2 }}>{item.message}</Typography.Paragraph>
                <Typography.Text type="secondary" className="notification-date">{formatDate(item.createdAt)}</Typography.Text>
              </div>
            </Space>
          </List.Item>
        )}
      />
      <Link className="notification-view-all" href="/notifications">ดูการแจ้งเตือนทั้งหมด</Link>
    </div>
  );

  return (
    <>
      {contextHolder}
      <Popover
        content={content}
        trigger="click"
        placement="bottomRight"
        onOpenChange={(open) => {
          if (open) void loadNotifications();
        }}
      >
        <Button
          className="icon-button notification-bell-button"
          type="text"
          aria-label={`การแจ้งเตือนที่ยังไม่อ่าน ${unreadCount} รายการ`}
          icon={<Badge count={unreadCount} size="small" overflowCount={99}><BellOutlined /></Badge>}
        />
      </Popover>
    </>
  );
}
