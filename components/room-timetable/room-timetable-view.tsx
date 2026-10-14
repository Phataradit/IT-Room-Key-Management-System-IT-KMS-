"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  type TableProps,
} from "antd";
import {
  CalendarOutlined,
  LeftOutlined,
  PlusOutlined,
  PrinterOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  addDays,
  bangkokDateStamp,
  dayOfWeekForDate,
  mondayOfWeek,
  timeToMinutes,
} from "@/lib/room-timetable/time.mjs";

type ActorRole = "SCHOOL_STUDENT" | "STUDENT" | "TEACHER" | "ADMIN";
type DayName = "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";
type RoomOption = {
  id: string;
  roomCode: string;
  roomName: string;
  building: string;
  status: string;
};
type TeacherOption = { id: string; name: string };
type TimetableEntry = {
  id: string;
  referenceId: string;
  type: "SCHEDULE" | "BOOKING";
  roomId: string;
  roomCode: string;
  roomName: string;
  title: string;
  courseCode: string | null;
  teacherName: string | null;
  className: string | null;
  semester: string | null;
  academicYear: string | null;
  dayOfWeek: DayName;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
};
type TimetableData = {
  weekStart: string;
  dates: string[];
  rooms: RoomOption[];
  teachers: TeacherOption[];
  entries: TimetableEntry[];
};
type ScheduleFormValues = {
  roomId: string;
  teacherId?: string;
  teacherName: string;
  dayOfWeek: DayName;
  startTime: string;
  endTime: string;
  courseCode?: string;
  subject: string;
  className: string;
  semester: string;
  academicYear: string;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
  status: "ACTIVE" | "INACTIVE";
};
type ExceptionRecord = { id: string; date: string; reason: string | null };

const days: Array<{ value: DayName; label: string }> = [
  { value: "MONDAY", label: "จันทร์" },
  { value: "TUESDAY", label: "อังคาร" },
  { value: "WEDNESDAY", label: "พุธ" },
  { value: "THURSDAY", label: "พฤหัสบดี" },
  { value: "FRIDAY", label: "ศุกร์" },
  { value: "SATURDAY", label: "เสาร์" },
  { value: "SUNDAY", label: "อาทิตย์" },
];
const statusLabels: Record<string, string> = {
  SCHEDULED: "ตามตาราง",
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  USING: "กำลังใช้งาน",
  RETURNED: "คืนแล้ว",
  CANCELLED: "ยกเลิก",
  REJECTED: "ปฏิเสธ",
};
const statusColors: Record<string, string> = {
  SCHEDULED: "blue",
  PENDING: "gold",
  APPROVED: "cyan",
  USING: "green",
  RETURNED: "default",
  CANCELLED: "default",
  REJECTED: "red",
};
const dayLabels = Object.fromEntries(days.map((day) => [day.value, day.label])) as Record<DayName, string>;
const timetablePeriods = Array.from({ length: 13 }, (_, index) => ({
  number: index + 1,
  start: (index + 8) * 60,
  end: (index + 9) * 60,
}));

function formatTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function getTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function detectConflicts(entries: TimetableEntry[]) {
  return new Set(entries.flatMap((entry, index) => entries.some((other, otherIndex) => {
    if (otherIndex === index || other.roomId !== entry.roomId) return false;
    if (["CANCELLED", "REJECTED", "RETURNED"].includes(entry.status)
      || ["CANCELLED", "REJECTED", "RETURNED"].includes(other.status)) return false;
    return new Date(other.startsAt) < new Date(entry.endsAt)
      && new Date(other.endsAt) > new Date(entry.startsAt);
  }) ? [entry.id] : []));
}

async function readJson<T>(response: Response) {
  const body = await response.json() as { success: boolean; message?: string; data?: T };
  if (!response.ok || !body.success) throw new Error(body.message ?? "ดำเนินการไม่สำเร็จ");
  return body;
}

export function RoomTimetableView({
  actorRole,
  initialWeekStart,
}: {
  actorRole: ActorRole;
  initialWeekStart: string;
}) {
  const [messageApi, contextHolder] = message.useMessage();
  const [data, setData] = useState<TimetableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(mondayOfWeek(initialWeekStart));
  const [roomId, setRoomId] = useState("");
  const [dayFilter, setDayFilter] = useState<DayName | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "SCHEDULE" | "BOOKING">("ALL");
  const [statusFilter, setStatusFilter] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"WEEK" | "LIST">("WEEK");
  const [mobileDay, setMobileDay] = useState<DayName>(dayOfWeekForDate(initialWeekStart) as DayName);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [working, setWorking] = useState(false);
  const [exceptionSchedule, setExceptionSchedule] = useState<TimetableEntry | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");
  const [form] = Form.useForm<ScheduleFormValues>();
  const canManage = actorRole === "TEACHER" || actorRole === "ADMIN";
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ weekStart, type: typeFilter });
    if (roomId) params.set("roomId", roomId);
    if (dayFilter !== "ALL") params.set("dayOfWeek", dayFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (teacherId) params.set("teacherId", teacherId);
    if (search) params.set("search", search);
    try {
      const response = await fetch(`/api/room-timetable?${params}`, { cache: "no-store", signal });
      const result = await readJson<TimetableData>(response);
      setData(result.data ?? null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "โหลดตารางไม่สำเร็จ");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dayFilter, roomId, search, statusFilter, teacherId, typeFilter, weekStart]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadData(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadData]);

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const conflictIds = useMemo(() => detectConflicts(entries), [entries]);
  const byDay = useMemo(() => new Map(
    days.map(({ value }) => [value, entries.filter((entry) => entry.dayOfWeek === value)]),
  ), [entries]);

  const openCreate = () => {
    setEditingId("");
    form.resetFields();
    form.setFieldsValue({
      roomId: roomId || data?.rooms[0]?.id,
      dayOfWeek: dayFilter === "ALL" ? "MONDAY" : dayFilter,
      effectiveFrom: weekStart,
      startTime: "08:00",
      endTime: "09:00",
      semester: "1",
      academicYear: String(new Date().getFullYear() + 543),
      status: "ACTIVE",
    });
    setEditorOpen(true);
  };

  const openEdit = async (entry: TimetableEntry) => {
    setWorking(true);
    try {
      const response = await fetch(`/api/room-timetable/${encodeURIComponent(entry.referenceId)}`, { cache: "no-store" });
      const result = await readJson<Record<string, unknown>>(response);
      const schedule = result.data;
      if (!schedule) throw new Error("ไม่พบตารางสอน");
      setEditingId(entry.referenceId);
      form.setFieldsValue({
        roomId: String(schedule.roomId),
        teacherId: schedule.teacherId ? String(schedule.teacherId) : undefined,
        teacherName: String(schedule.teacherName ?? ""),
        dayOfWeek: schedule.dayOfWeek as DayName,
        startTime: String(schedule.startTime),
        endTime: String(schedule.endTime),
        courseCode: schedule.courseCode ? String(schedule.courseCode) : "",
        subject: String(schedule.subject),
        className: String(schedule.className),
        semester: String(schedule.semester),
        academicYear: String(schedule.academicYear),
        effectiveFrom: schedule.effectiveFrom ? String(schedule.effectiveFrom).slice(0, 10) : weekStart,
        effectiveTo: schedule.effectiveTo ? String(schedule.effectiveTo).slice(0, 10) : "",
        notes: schedule.notes ? String(schedule.notes) : "",
        status: schedule.status as "ACTIVE" | "INACTIVE",
      });
      setEditorOpen(true);
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "เปิดตารางสอนไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const saveSchedule = async (values: ScheduleFormValues) => {
    setWorking(true);
    try {
      const selectedTeacher = data?.teachers.find((teacher) => teacher.id === values.teacherId);
      const payload = {
        ...values,
        teacherId: values.teacherId || null,
        teacherName: selectedTeacher?.name ?? values.teacherName,
        courseCode: values.courseCode || null,
        effectiveTo: values.effectiveTo || null,
        notes: values.notes || null,
      };
      const response = await fetch(
        editingId ? `/api/room-timetable/${encodeURIComponent(editingId)}` : "/api/room-timetable",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await readJson(response);
      messageApi.success(editingId ? "บันทึกการแก้ไขตารางแล้ว" : "เพิ่มตารางแล้ว");
      setEditorOpen(false);
      await loadData();
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "บันทึกตารางไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const deactivateSchedule = async (entry: TimetableEntry) => {
    setWorking(true);
    try {
      const response = await fetch(`/api/room-timetable/${encodeURIComponent(entry.referenceId)}`, { method: "DELETE" });
      await readJson(response);
      messageApi.success("ปิดใช้งานตารางแล้ว");
      await loadData();
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "ปิดตารางไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const openExceptions = async (entry: TimetableEntry) => {
    setWorking(true);
    try {
      const response = await fetch(`/api/room-timetable/${encodeURIComponent(entry.referenceId)}`, { cache: "no-store" });
      const result = await readJson<{ exceptions: ExceptionRecord[] }>(response);
      setExceptions(result.data?.exceptions ?? []);
      setExceptionDate("");
      setExceptionReason("");
      setExceptionSchedule(entry);
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "โหลดวันยกเว้นไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const saveException = async () => {
    if (!exceptionSchedule || !exceptionDate) {
      messageApi.warning("กรุณาเลือกวันที่ต้องการยกเลิก");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch(`/api/room-timetable/${encodeURIComponent(exceptionSchedule.referenceId)}/exceptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: exceptionDate, reason: exceptionReason || null }),
      });
      await readJson(response);
      messageApi.success("บันทึกวันยกเว้นแล้ว");
      setExceptions((current) => [...current, { id: crypto.randomUUID(), date: `${exceptionDate}T00:00:00.000Z`, reason: exceptionReason || null }]);
      await loadData();
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "บันทึกวันยกเว้นไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const removeException = async (exceptionId: string) => {
    if (!exceptionSchedule) return;
    setWorking(true);
    try {
      const response = await fetch(
        `/api/room-timetable/${encodeURIComponent(exceptionSchedule.referenceId)}/exceptions?exceptionId=${encodeURIComponent(exceptionId)}`,
        { method: "DELETE" },
      );
      await readJson(response);
      setExceptions((current) => current.filter((item) => item.id !== exceptionId));
      messageApi.success("ยกเลิกวันยกเว้นแล้ว");
      await loadData();
    } catch (cause) {
      messageApi.error(cause instanceof Error ? cause.message : "ยกเลิกวันยกเว้นไม่สำเร็จ");
    } finally {
      setWorking(false);
    }
  };

  const columns: TableProps<TimetableEntry>["columns"] = [
    {
      title: "วัน / เวลา",
      key: "time",
      width: 170,
      render: (_, entry) => (
        <span>
          {formatDate(bangkokDateStamp(new Date(entry.startsAt)))} · {formatTime(entry.startsAt)}–{formatTime(entry.endsAt)}
        </span>
      ),
    },
    { title: "ห้อง", dataIndex: "roomCode", width: 90, render: (value: string) => `ห้อง ${value}` },
    {
      title: "รายการใช้ห้อง",
      key: "subject",
      render: (_, entry) => (
        <div>
          <Typography.Text strong>{entry.title}</Typography.Text>
          {entry.courseCode && <Typography.Text type="secondary"> · {entry.courseCode}</Typography.Text>}
          <div className="room-timetable-secondary">
            {[entry.teacherName, entry.className].filter(Boolean).join(" · ") || entry.roomName}
          </div>
        </div>
      ),
    },
    { title: "ประเภท", dataIndex: "type", width: 115, render: (value: string) => value === "SCHEDULE" ? "ตารางประจำ" : "จองห้อง" },
    {
      title: "สถานะ",
      dataIndex: "status",
      width: 125,
      render: (value: string, entry) => (
        <Space size={4}>
          <Tag color={statusColors[value] ?? "default"}>{statusLabels[value] ?? value}</Tag>
          {conflictIds.has(entry.id) && <Tag color="red">เวลาชน</Tag>}
        </Space>
      ),
    },
    {
      title: "จัดการ",
      key: "actions",
      width: 190,
      hidden: !canManage,
      render: (_, entry) => entry.type === "SCHEDULE" ? (
        <Space wrap size={4}>
          <Button size="small" onClick={() => void openEdit(entry)}>แก้ไข</Button>
          <Button size="small" onClick={() => void openExceptions(entry)}>วันยกเว้น</Button>
          <Popconfirm title="ปิดใช้งานตารางนี้หรือไม่" onConfirm={() => void deactivateSchedule(entry)}>
            <Button size="small" danger loading={working}>ปิด</Button>
          </Popconfirm>
        </Space>
      ) : null,
    },
  ];

  const renderGridEntry = (entry: TimetableEntry) => {
    const conflict = conflictIds.has(entry.id);
    return (
      <button
        type="button"
        className={`timetable-cell-entry ${entry.type === "BOOKING" ? "booking-event" : "schedule-event"} ${conflict ? "conflict-event" : ""}`}
        key={entry.id}
        title={`ห้อง ${entry.roomCode} · ${entry.title} · ${formatTime(entry.startsAt)}–${formatTime(entry.endsAt)}`}
        onClick={() => entry.type === "SCHEDULE" && canManage ? void openEdit(entry) : undefined}
      >
        <strong>ห้อง {entry.roomCode}</strong>
        <span className="timetable-cell-subject">{entry.title}</span>
        <span>{formatTime(entry.startsAt)}–{formatTime(entry.endsAt)}</span>
        {entry.className && <span>{entry.className}</span>}
        {conflictIds.has(entry.id) && <span>เวลาชน</span>}
      </button>
    );
  };

  const selectedMobileEntries = entries.filter((entry) => entry.dayOfWeek === mobileDay);

  return (
    <div className="dashboard-content room-timetable-page">
      {contextHolder}
      <div className="welcome-row room-timetable-heading">
        <div>
          <p className="eyebrow">IT ROOM MANAGEMENT</p>
          <h1><CalendarOutlined /> ตารางประจำห้อง</h1>
          <p className="welcome-subtitle">ตรวจสอบการใช้ห้องตามวันและคาบเวลา</p>
        </div>
        <Space wrap>
          {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>เพิ่มตารางประจำห้อง</Button>}
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>พิมพ์</Button>
        </Space>
      </div>

      <Card className="room-timetable-filters" bordered={false}>
        <div className="timetable-filter-grid">
          <Select
            aria-label="เลือกห้อง"
            value={roomId || undefined}
            placeholder="ทุกห้อง"
            allowClear
            onChange={(value) => setRoomId(value ?? "")}
            options={data?.rooms.map((room) => ({ value: room.id, label: `${room.roomCode} · ${room.roomName}` }))}
          />
          <Input
            type="date"
            aria-label="เลือกวันที่ในสัปดาห์"
            value={weekStart}
            onChange={(event) => setWeekStart(mondayOfWeek(event.target.value || initialWeekStart))}
          />
          <Select
            aria-label="กรองวัน"
            value={dayFilter}
            onChange={setDayFilter}
            options={[{ value: "ALL", label: "ทุกวัน" }, ...days]}
          />
          <Select
            aria-label="กรองประเภท"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "ALL", label: "ทุกประเภท" },
              { value: "SCHEDULE", label: "ตารางประจำ" },
              { value: "BOOKING", label: "รายการจอง" },
            ]}
          />
          <Select
            aria-label="กรองสถานะ"
            value={statusFilter || undefined}
            placeholder="ทุกสถานะ"
            allowClear
            onChange={(value) => setStatusFilter(value ?? "")}
            options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          />
          {canManage && (
            <Select
              aria-label="กรองครูผู้สอน"
              value={teacherId || undefined}
              placeholder="ครูทุกคน"
              allowClear
              onChange={(value) => setTeacherId(value ?? "")}
              options={data?.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))}
            />
          )}
          <Input
            aria-label="ค้นหาวิชา ห้อง หรือผู้สอน"
            placeholder="ค้นหาวิชา ห้อง หรือผู้สอน"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onPressEnter={() => setSearch(searchText.trim())}
            suffix={<Button type="text" size="small" aria-label="ค้นหา" icon={<SearchOutlined />} onClick={() => setSearch(searchText.trim())} />}
          />
        </div>
        <div className="timetable-toolbar">
          <Space wrap>
            <Button size="small" onClick={() => setWeekStart(mondayOfWeek(initialWeekStart))}>สัปดาห์นี้</Button>
            <Button size="small" icon={<LeftOutlined />} aria-label="สัปดาห์ก่อนหน้า" onClick={() => setWeekStart(addDays(weekStart, -7))} />
            <Button size="small" icon={<RightOutlined />} aria-label="สัปดาห์ถัดไป" onClick={() => setWeekStart(addDays(weekStart, 7))} />
            <Typography.Text type="secondary">{formatDate(weekDates[0])} – {formatDate(weekDates[6])}</Typography.Text>
          </Space>
          <Space.Compact>
            <Button type={view === "WEEK" ? "primary" : "default"} onClick={() => setView("WEEK")}>รายสัปดาห์</Button>
            <Button type={view === "LIST" ? "primary" : "default"} onClick={() => setView("LIST")}>รายการ</Button>
          </Space.Compact>
        </div>
      </Card>

      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void loadData()}>ลองอีกครั้ง</Button>} />}
      {!error && view === "WEEK" && (
        <>
          <div className="timetable-mobile-day">
            <Select
              aria-label="เลือกวันที่แสดง"
              value={mobileDay}
              onChange={setMobileDay}
              options={weekDates.map((date) => ({ value: dayOfWeekForDate(date) as DayName, label: `${dayLabels[dayOfWeekForDate(date) as DayName]} · ${formatDate(date)}` }))}
            />
            <List
              loading={loading}
              dataSource={selectedMobileEntries}
              locale={{ emptyText: <Empty description="ไม่มีรายการใช้ห้องวันนี้" /> }}
              renderItem={(entry) => (
                <List.Item>
                  <Card className="timetable-mobile-event" size="small">
                    <Space direction="vertical" size={5}>
                      <Space wrap>
                        <Tag color={entry.type === "SCHEDULE" ? "blue" : "purple"}>{entry.type === "SCHEDULE" ? "ตารางเรียน" : "จองห้อง"}</Tag>
                        <Tag color={statusColors[entry.status] ?? "default"}>{statusLabels[entry.status] ?? entry.status}</Tag>
                        {conflictIds.has(entry.id) && <Tag color="red">เวลาชน</Tag>}
                      </Space>
                      <Typography.Text strong>ห้อง {entry.roomCode} · {entry.title}</Typography.Text>
                      <Typography.Text>{formatTime(entry.startsAt)}–{formatTime(entry.endsAt)}</Typography.Text>
                      <Typography.Text type="secondary">{[entry.teacherName, entry.className].filter(Boolean).join(" · ")}</Typography.Text>
                      {entry.type === "SCHEDULE" && canManage && (
                        <Space>
                          <Button size="small" onClick={() => void openEdit(entry)}>แก้ไข</Button>
                          <Button size="small" onClick={() => void openExceptions(entry)}>วันยกเว้น</Button>
                        </Space>
                      )}
                    </Space>
                  </Card>
                </List.Item>
              )}
            />
          </div>
          <div className="timetable-week-scroll">
            <table className="timetable-class-grid">
              <thead>
                <tr>
                  <th scope="col">วัน</th>
                  {timetablePeriods.map((period) => (
                    <th scope="col" key={period.number}>
                      <strong>{period.number}</strong>
                      <span>{`${String(Math.floor(period.start / 60)).padStart(2, "0")}:00–${String(Math.floor(period.end / 60)).padStart(2, "0")}:00`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day, dayIndex) => (
                  <tr key={day.value}>
                    <th scope="row">
                      <strong>{day.label}</strong>
                      <span>{formatDate(weekDates[dayIndex])}</span>
                    </th>
                    {timetablePeriods.map((period) => {
                      const periodEntries = (byDay.get(day.value) ?? []).filter((entry) => {
                        const start = timeToMinutes(getTime(entry.startsAt));
                        return start >= period.start && start < period.end;
                      });
                      return (
                        <td key={period.number}>
                          {periodEntries.length
                            ? periodEntries.map(renderGridEntry)
                            : <span className="timetable-empty-cell">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!error && view === "LIST" && (
        <Card bordered={false} className="room-timetable-list-card">
          <Table<TimetableEntry>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={entries}
            pagination={{ pageSize: 15, showSizeChanger: true, pageSizeOptions: [15, 30, 50] }}
            locale={{ emptyText: <Empty description="ไม่พบข้อมูลตารางหรือรายการใช้ห้อง" /> }}
            scroll={{ x: 900 }}
          />
        </Card>
      )}
      {loading && !data && <Card loading bordered={false} />}

      <Modal
        title={editingId ? "แก้ไขตารางประจำห้อง" : "เพิ่มตารางประจำห้อง"}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={working}
        okText="บันทึก"
        cancelText="ยกเลิก"
        width={720}
        destroyOnHidden
      >
        <Alert
          className="schedule-form-help"
          type="info"
          showIcon
          message="ระบบจะตรวจสอบเวลาซ้ำทั้งกับตารางประจำและรายการจองที่มีผลในช่วงวันที่กำหนด"
        />
        <Form<ScheduleFormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => void saveSchedule(values)}
          onValuesChange={(changed) => {
            if ("teacherId" in changed) {
              const selected = data?.teachers.find((teacher) => teacher.id === changed.teacherId);
              form.setFieldValue("teacherName", selected?.name ?? "");
            }
          }}
        >
          <div className="schedule-form-grid">
            <Form.Item name="roomId" label="ห้อง" rules={[{ required: true, message: "กรุณาเลือกห้อง" }]}>
              <Select options={data?.rooms.map((room) => ({ value: room.id, label: `${room.roomCode} · ${room.roomName}` }))} />
            </Form.Item>
            <Form.Item name="dayOfWeek" label="วัน" rules={[{ required: true }]}>
              <Select options={days} />
            </Form.Item>
            <Form.Item name="startTime" label="เวลาเริ่ม" rules={[{ required: true }]}>
              <Input type="time" />
            </Form.Item>
            <Form.Item name="endTime" label="เวลาสิ้นสุด" rules={[{ required: true }]}>
              <Input type="time" />
            </Form.Item>
            <Form.Item name="effectiveFrom" label="เริ่มใช้วันที่" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="effectiveTo" label="สิ้นสุดวันที่">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="subject" label="ชื่อวิชา / กิจกรรม" rules={[{ required: true }]}>
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="courseCode" label="รหัสวิชา">
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item name="teacherId" label="เลือกครูจากบัญชี">
              <Select
                allowClear
                placeholder="เลือกครู (ถ้ามี)"
                options={data?.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))}
              />
            </Form.Item>
            <Form.Item name="teacherName" label="ชื่อผู้สอน / ผู้รับผิดชอบ" rules={[{ required: true }]}>
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="className" label="กลุ่มเรียน / ชั้น" rules={[{ required: true }]}>
              <Input maxLength={100} />
            </Form.Item>
            <Form.Item name="semester" label="ภาคเรียน" rules={[{ required: true }]}>
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item name="academicYear" label="ปีการศึกษา" rules={[{ required: true }]}>
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item name="status" label="สถานะ">
              <Select options={[{ value: "ACTIVE", label: "ใช้งาน" }, { value: "INACTIVE", label: "ปิดใช้งาน" }]} />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="หมายเหตุ">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={exceptionSchedule ? `วันยกเว้น · ห้อง ${exceptionSchedule.roomCode} · ${exceptionSchedule.title}` : "วันยกเว้น"}
        open={Boolean(exceptionSchedule)}
        onCancel={() => setExceptionSchedule(null)}
        footer={null}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          เพิ่มวันที่ไม่เรียนหรือยกเลิกเป็นกรณีพิเศษ โดยไม่ลบตารางประจำสัปดาห์
        </Typography.Paragraph>
        <Space direction="vertical" className="exception-form">
          <Input type="date" value={exceptionDate} onChange={(event) => setExceptionDate(event.target.value)} />
          <Input
            placeholder="เหตุผล (ไม่บังคับ)"
            maxLength={250}
            value={exceptionReason}
            onChange={(event) => setExceptionReason(event.target.value)}
          />
          <Button type="primary" loading={working} onClick={() => void saveException()}>เพิ่มวันยกเว้น</Button>
        </Space>
        <List
          className="exception-list"
          dataSource={exceptions}
          locale={{ emptyText: "ยังไม่มีวันยกเว้น" }}
          renderItem={(item) => (
            <List.Item
              actions={[<Popconfirm key="remove" title="ยกเลิกข้อยกเว้นวันนี้หรือไม่" onConfirm={() => void removeException(item.id)}><Button size="small">คืนตาราง</Button></Popconfirm>]}
            >
              <List.Item.Meta
                title={formatDate(item.date.slice(0, 10))}
                description={item.reason || "ยกเลิกการใช้ห้องในวันนี้"}
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
