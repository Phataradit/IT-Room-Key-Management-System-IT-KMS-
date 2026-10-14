"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  type TableProps,
} from "antd";

type NotificationItem = {
  id: string;
  type: string;
  priority: "NORMAL" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  referenceId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
};
type Settings = { reminderMinutes: number; overdueMinutes: number[]; notifyAdmins: boolean };
type ApiResult<T> = { success: boolean; message?: string; data?: T; pagination?: { total: number }; unreadCount?: number };
const typeLabels: Record<string, string> = {
  BORROW_SUCCESS: "ยืมสำเร็จ",
  RETURN_SUCCESS: "คืนสำเร็จ",
  DUE_SOON: "ใกล้ครบกำหนด",
  OVERDUE: "เกินกำหนด",
  SYSTEM: "ระบบ",
  ROOM_ENDING_SOON: "ใกล้หมดเวลาใช้ห้อง",
  ROOM_USAGE_ENDED: "ถึงเวลาสิ้นสุด",
  ROOM_USAGE_OVERDUE: "เกินเวลาใช้ห้อง",
  SCHEDULE_CHANGED: "เปลี่ยนตาราง",
};
const priorityColor = { NORMAL: "blue", WARNING: "orange", CRITICAL: "red" } as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export function NotificationCenter({ isAdmin }: { isAdmin: boolean }) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [overdueText, setOverdueText] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (unreadOnly) params.set("unreadOnly", "true");
    if (type) params.set("type", type);
    if (search) params.set("search", search);
    try {
      const response = await fetch(`/api/notifications?${params}`, { cache: "no-store", signal });
      const result = await response.json() as ApiResult<NotificationItem[]>;
      if (!response.ok || !result.success) throw new Error(result.message ?? "โหลดการแจ้งเตือนไม่สำเร็จ");
      setItems(result.data ?? []);
      setTotal(result.pagination?.total ?? 0);
      setUnreadCount(result.unreadCount ?? 0);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "โหลดการแจ้งเตือนไม่สำเร็จ");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, pageSize, search, type, unreadOnly]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/notifications/settings", { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as ApiResult<Settings>;
          if (!response.ok || !result.success || !result.data) throw new Error(result.message ?? "โหลดการตั้งค่าไม่สำเร็จ");
          setSettings(result.data);
          setOverdueText(result.data.overdueMinutes.join(", "));
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          messageApi.error(cause instanceof Error ? cause.message : "โหลดการตั้งค่าไม่สำเร็จ");
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isAdmin, messageApi]);

  const markRead = async (item: NotificationItem) => {
    if (item.isRead) return;
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(item.id)}/read`, { method: "PATCH" });
      if (!response.ok) throw new Error("ปรับสถานะการแจ้งเตือนไม่สำเร็จ");
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, isRead: true } : row));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "ปรับสถานะการแจ้งเตือนไม่สำเร็จ");
    }
  };

  const markAllRead = async () => {
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error("ทำเครื่องหมายอ่านทั้งหมดไม่สำเร็จ");
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
      messageApi.success("ทำเครื่องหมายอ่านทั้งหมดแล้ว");
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "ทำเครื่องหมายอ่านทั้งหมดไม่สำเร็จ");
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    const overdueMinutes = [...new Set(overdueText.split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 1440))]
      .sort((a, b) => a - b);
    if (!overdueMinutes.length) {
      messageApi.error("กรุณาระบุช่วงเวลาเกินกำหนดเป็นนาที เช่น 5, 15, 30");
      return;
    }
    setSavingSettings(true);
    try {
      const response = await fetch("/api/notifications/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, overdueMinutes }),
      });
      const result = await response.json() as ApiResult<Settings>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.message ?? "บันทึกการตั้งค่าไม่สำเร็จ");
      setSettings(result.data);
      setOverdueText(result.data.overdueMinutes.join(", "));
      messageApi.success("บันทึกการตั้งค่าแล้ว");
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "บันทึกการตั้งค่าไม่สำเร็จ");
    } finally {
      setSavingSettings(false);
    }
  };

  const columns: TableProps<NotificationItem>["columns"] = [
    {
      title: "สถานะ",
      dataIndex: "isRead",
      width: 100,
      render: (value: boolean) => <Tag color={value ? "default" : "blue"}>{value ? "อ่านแล้ว" : "ยังไม่อ่าน"}</Tag>,
    },
    {
      title: "การแจ้งเตือน",
      key: "message",
      render: (_, item) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Typography.Text strong>{item.title}</Typography.Text>
            <Tag color={priorityColor[item.priority]}>{item.priority === "CRITICAL" ? "สำคัญ" : item.priority === "WARNING" ? "เตือน" : "ทั่วไป"}</Tag>
            <Tag>{typeLabels[item.type] ?? item.type}</Tag>
          </Space>
          <Typography.Text>{item.message}</Typography.Text>
          <Typography.Text type="secondary">{formatDate(item.createdAt)}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "ดำเนินการ",
      key: "actions",
      width: 180,
      render: (_, item) => (
        <Space>
          {!item.isRead && <Button size="small" onClick={() => void markRead(item)}>อ่านแล้ว</Button>}
          {item.actionUrl?.startsWith("/") && (
            <Link href={item.actionUrl} onClick={() => void markRead(item)}>ดูรายการ</Link>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="dashboard-content notification-center-page">
      {contextHolder}
      <div className="welcome-row">
        <div>
          <p className="eyebrow">ROOM USAGE UPDATES</p>
          <h1>การแจ้งเตือน</h1>
          <p className="welcome-subtitle">การแจ้งเตือนของคุณ · ยังไม่อ่าน {unreadCount} รายการ</p>
        </div>
        <Button disabled={!unreadCount} onClick={() => void markAllRead()}>ทำเครื่องหมายอ่านทั้งหมด</Button>
      </div>

      {isAdmin && (
        <Card title="ตั้งค่าการแจ้งเตือนเวลาใช้ห้อง" className="notification-settings-card" bordered={false}>
          {settings ? (
            <div className="notification-settings-form">
              <label>
                <span>แจ้งเตือนก่อนหมดเวลา (นาที)</span>
                <InputNumber
                  min={1}
                  max={180}
                  value={settings.reminderMinutes}
                  onChange={(value) => setSettings((current) => current ? { ...current, reminderMinutes: Number(value ?? 15) } : current)}
                />
              </label>
              <label>
                <span>แจ้งเตือนเกินเวลา (นาที คั่นด้วยจุลภาค)</span>
                <Input value={overdueText} onChange={(event) => setOverdueText(event.target.value)} placeholder="5, 15, 30" />
              </label>
              <Checkbox
                checked={settings.notifyAdmins}
                onChange={(event) => setSettings((current) => current ? { ...current, notifyAdmins: event.target.checked } : current)}
              >
                ส่งการแจ้งเตือนการใช้ห้องให้ Admin
              </Checkbox>
              <Button type="primary" loading={savingSettings} onClick={() => void saveSettings()}>บันทึกการตั้งค่า</Button>
            </div>
          ) : (
            <Typography.Text type="secondary">กำลังโหลดการตั้งค่า…</Typography.Text>
          )}
        </Card>
      )}

      <Card bordered={false} className="notification-list-card">
        <div className="notification-filters">
          <Space wrap>
            <Select
              value={unreadOnly ? "UNREAD" : "ALL"}
              onChange={(value) => { setPage(1); setUnreadOnly(value === "UNREAD"); }}
              options={[{ value: "ALL", label: "ทั้งหมด" }, { value: "UNREAD", label: "ยังไม่อ่าน" }]}
              aria-label="กรองสถานะการอ่าน"
            />
            <Select
              allowClear
              placeholder="ทุกประเภท"
              value={type || undefined}
              onChange={(value) => { setPage(1); setType(value ?? ""); }}
              options={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
              aria-label="กรองประเภทการแจ้งเตือน"
            />
            <Input.Search
              placeholder="ค้นหาการแจ้งเตือน"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onSearch={(value) => { setPage(1); setSearch(value.trim()); }}
              allowClear
            />
          </Space>
        </div>
        {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void load()}>ลองอีกครั้ง</Button>} />}
        <Table<NotificationItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [15, 30, 50, 100],
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            },
          }}
          locale={{ emptyText: <Empty description="ไม่มีการแจ้งเตือน" /> }}
          scroll={{ x: 700 }}
        />
      </Card>
    </div>
  );
}
