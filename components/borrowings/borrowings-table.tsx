"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
  type TableProps,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { isStudentRole } from "@/lib/auth/roles";

type BookingStatus = "PENDING" | "APPROVED" | "USING" | "RETURNED" | "CANCELLED" | "REJECTED";
type ActorRole = "SCHOOL_STUDENT" | "STUDENT" | "TEACHER" | "ADMIN";

type BookingPerson = {
  id?: string;
  firstName: string;
  lastName: string;
  role?: ActorRole;
  studentId?: string | null;
  employeeId?: string | null;
};

type BorrowingRow = {
  id: string;
  bookingNo: string;
  userId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  purpose: string;
  attendeeCount: number;
  note: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  startedAt: string | null;
  returnedAt: string | null;
  returnNote: string | null;
  createdAt: string;
  room: { id: string; roomCode: string; roomName: string };
  user: BookingPerson;
  approvedBy: BookingPerson | null;
  rejectedBy: BookingPerson | null;
  returnedBy: BookingPerson | null;
};

type RoomOption = { id: string; roomCode: string; roomName: string };

type BorrowingsTableProps = {
  actorId: string;
  role: ActorRole;
  rooms: RoomOption[];
};

const statusLabels: Record<BookingStatus, string> = {
  PENDING: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  USING: "กำลังใช้งาน",
  RETURNED: "คืนแล้ว",
  CANCELLED: "ยกเลิก",
  REJECTED: "ปฏิเสธ",
};

const statusColors: Record<BookingStatus, string> = {
  PENDING: "gold",
  APPROVED: "blue",
  USING: "processing",
  RETURNED: "green",
  CANCELLED: "default",
  REJECTED: "red",
};

function dateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function personName(person: BookingPerson | null) {
  return person ? `${person.firstName} ${person.lastName}` : "";
}

function confirmationText(record: BorrowingRow) {
  if (record.status === "RETURNED") {
    return `คืนโดย ${personName(record.returnedBy)} · ${dateTime(record.returnedAt)}`;
  }
  if (record.status === "USING") {
    return `เริ่มใช้งาน · ${dateTime(record.startedAt)}`;
  }
  if (record.approvedAt) {
    return `อนุมัติโดย ${personName(record.approvedBy)} · ${dateTime(record.approvedAt)}`;
  }
  if (record.rejectedAt) {
    return `ปฏิเสธโดย ${personName(record.rejectedBy)} · ${dateTime(record.rejectedAt)}`;
  }
  return "รอการยืนยัน";
}

export function BorrowingsTable({ actorId, role, rooms }: BorrowingsTableProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [rows, setRows] = useState<BorrowingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("startsAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [detail, setDetail] = useState<BorrowingRow | null>(null);
  const [returnTarget, setReturnTarget] = useState<BorrowingRow | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [rejectTarget, setRejectTarget] = useState<BorrowingRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workingId, setWorkingId] = useState("");

  const loadRows = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });
    if (search.trim()) query.set("search", search.trim());
    if (roomId) query.set("roomId", roomId);
    if (status) query.set("status", status);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);

    try {
      const response = await fetch(`/api/borrowings?${query}`, { signal });
      const result = await response.json() as {
        success: boolean;
        message?: string;
        data?: BorrowingRow[];
        pagination?: { total: number };
      };
      if (!response.ok || !result.success) {
        setError(result.message ?? "โหลดรายการยืม-คืนไม่สำเร็จ");
        return;
      }
      setRows(result.data ?? []);
      setTotal(result.pagination?.total ?? 0);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองโหลดข้อมูลใหม่");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [dateFrom, dateTo, page, pageSize, roomId, search, sortBy, sortOrder, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadRows(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadRows]);

  async function performAction(
    record: BorrowingRow,
    action: "approve" | "reject" | "start" | "return" | "cancel",
    body?: Record<string, string>,
  ) {
    setWorkingId(record.id);
    try {
      const response = await fetch(
        action === "cancel" ? `/api/borrowings/${record.id}` : `/api/borrowings/${record.id}/${action}`,
        {
          method: action === "cancel" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const result = await response.json() as { success: boolean; message?: string };
      if (!response.ok || !result.success) {
        messageApi.error(result.message ?? "ดำเนินการไม่สำเร็จ");
        return;
      }
      messageApi.success(result.message ?? "บันทึกสำเร็จ");
      setReturnTarget(null);
      setRejectTarget(null);
      setReturnNote("");
      setRejectReason("");
      await loadRows();
    } catch {
      messageApi.error("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setWorkingId("");
    }
  }

  const tableChange: TableProps<BorrowingRow>["onChange"] = (pagination, _filters, sorter) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 10);
    const selectedSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    if (typeof selectedSorter?.field === "string") {
      setSortBy(selectedSorter.field);
      setSortOrder(selectedSorter.order === "ascend" ? "asc" : "desc");
    }
  };

  function sortable(title: string, field: string) {
    return {
      title,
      dataIndex: field,
      key: field,
      sorter: true,
      sortOrder: sortBy === field ? (sortOrder === "asc" ? "ascend" as const : "descend" as const) : undefined,
    };
  }

  const columns: TableProps<BorrowingRow>["columns"] = [
    {
      ...sortable("รหัสรายการ", "bookingNo"),
      render: (_value, record) => <strong className="booking-no">{record.bookingNo}</strong>,
    },
    {
      ...sortable("วันที่", "startsAt"),
      render: (_value, record) => dateTime(record.startsAt).split(" ")[0],
    },
    {
      title: "ห้อง",
      dataIndex: ["room", "roomCode"],
      key: "room",
      render: (_value, record) => <span>{record.room.roomCode}<small className="table-secondary">{record.room.roomName}</small></span>,
    },
    {
      ...sortable("เวลาเริ่ม", "startsAt"),
      render: (_value, record) => dateTime(record.startsAt).split(" ").slice(-1)[0],
    },
    {
      ...sortable("เวลาสิ้นสุด", "endsAt"),
      render: (_value, record) => dateTime(record.endsAt).split(" ").slice(-1)[0],
    },
    {
      title: "ผู้ยืม",
      dataIndex: ["user", "firstName"],
      key: "borrower",
      render: (_value, record) => `${record.user.firstName} ${record.user.lastName}`,
    },
    {
      ...sortable("วัตถุประสงค์", "purpose"),
      render: (_value, record) => <span className="table-purpose">{record.purpose}</span>,
    },
    {
      ...sortable("สถานะ", "status"),
      render: (_value, record) => <Tag color={statusColors[record.status]}>{statusLabels[record.status]}</Tag>,
    },
    {
      title: "ลายเซ็น/การยืนยัน",
      key: "confirmation",
      render: (_value, record) => <span className="table-confirmation">{confirmationText(record)}</span>,
    },
    {
      title: "การจัดการ",
      key: "actions",
      fixed: "right",
      width: 210,
      render: (_value, record) => {
        const isOwner = record.userId === actorId;
        const isStudent = isStudentRole(role);
        const mayEdit = record.status === "PENDING" && (role === "ADMIN" || (isStudent && isOwner));
        const mayApprove = !isStudent && record.status === "PENDING";
        const mayStart = record.status === "APPROVED" && (isOwner || !isStudent);
        const mayReturn = !isStudent && record.status === "USING";
        const mayCancel = (record.status === "PENDING" || (role === "ADMIN" && record.status === "APPROVED"))
          && (role === "ADMIN" || (isStudent && isOwner && record.status === "PENDING"));
        return (
          <Space size={[4, 4]} wrap>
            <Button size="small" onClick={() => setDetail(record)}>ดู</Button>
            {mayEdit && <Link className="ant-btn ant-btn-default ant-btn-sm" href={`/borrowings/${record.id}/edit`}>แก้ไข</Link>}
            {mayApprove && (
              <>
                <Popconfirm title="อนุมัติคำขอนี้หรือไม่?" onConfirm={() => performAction(record, "approve")}>
                  <Button size="small" type="primary" loading={workingId === record.id}>อนุมัติ</Button>
                </Popconfirm>
                <Button size="small" danger onClick={() => { setRejectTarget(record); setRejectReason(""); }}>ปฏิเสธ</Button>
              </>
            )}
            {mayStart && (
              <Popconfirm title="ยืนยันเริ่มใช้งานห้อง?" onConfirm={() => performAction(record, "start")}>
                <Button size="small" type="primary" loading={workingId === record.id}>เริ่มใช้</Button>
              </Popconfirm>
            )}
            {mayReturn && <Button size="small" onClick={() => setReturnTarget(record)}>ยืนยันคืน</Button>}
            {mayCancel && (
              <Popconfirm title="ยกเลิกคำขอนี้หรือไม่?" onConfirm={() => performAction(record, "cancel")}>
                <Button size="small" danger loading={workingId === record.id}>ยกเลิก</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <section className="borrowings-panel">
      {contextHolder}
      <div className="borrowings-toolbar">
        <Input.Search
          aria-label="ค้นหารายการ"
          allowClear
          placeholder="ค้นหารหัส รายชื่อ วัตถุประสงค์ หรือห้อง"
          value={search}
          onChange={(event) => { setPage(1); setSearch(event.target.value); }}
          className="borrowing-search"
        />
        <Select
          aria-label="กรองห้อง"
          allowClear
          placeholder="ทุกห้อง"
          value={roomId || undefined}
          onChange={(value) => { setPage(1); setRoomId(value ?? ""); }}
          options={rooms.map((room) => ({ value: room.id, label: `${room.roomCode} · ${room.roomName}` }))}
          className="borrowing-filter"
        />
        <Select
          aria-label="กรองสถานะ"
          allowClear
          placeholder="ทุกสถานะ"
          value={status || undefined}
          onChange={(value) => { setPage(1); setStatus(value ?? ""); }}
          options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          className="borrowing-filter"
        />
        <label className="date-filter">ตั้งแต่<input aria-label="วันที่เริ่มกรอง" type="date" value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} /></label>
        <label className="date-filter">ถึง<input aria-label="วันที่สิ้นสุดกรอง" type="date" value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} /></label>
        <Button type="primary" icon={<PlusOutlined />} href="/borrowings/new">สร้างรายการ</Button>
      </div>
      {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void loadRows()}>ลองอีกครั้ง</Button>} className="borrowings-error" />}
      <Table<BorrowingRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        onChange={tableChange}
        scroll={{ x: 1450 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count, range) => `${range[0]}-${range[1]} จาก ${count} รายการ`,
        }}
        locale={{ emptyText: "ยังไม่มีรายการยืม-คืน" }}
      />
      <Modal
        title={`รายละเอียดรายการ ${detail?.bookingNo ?? ""}`}
        open={Boolean(detail)}
        onCancel={() => setDetail(null)}
        footer={<Button onClick={() => setDetail(null)}>ปิด</Button>}
        width={700}
      >
        {detail && (
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="สถานะ"><Tag color={statusColors[detail.status]}>{statusLabels[detail.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="ห้อง">{detail.room.roomCode} · {detail.room.roomName}</Descriptions.Item>
            <Descriptions.Item label="ผู้ยืม">{personName(detail.user)}</Descriptions.Item>
            <Descriptions.Item label="จำนวนผู้ใช้งาน">{detail.attendeeCount} คน</Descriptions.Item>
            <Descriptions.Item label="เวลาเริ่ม">{dateTime(detail.startsAt)}</Descriptions.Item>
            <Descriptions.Item label="เวลาสิ้นสุด">{dateTime(detail.endsAt)}</Descriptions.Item>
            <Descriptions.Item label="วัตถุประสงค์" span={2}>{detail.purpose}</Descriptions.Item>
            <Descriptions.Item label="หมายเหตุ" span={2}>{detail.note || "—"}</Descriptions.Item>
            <Descriptions.Item label="การยืนยัน" span={2}>{confirmationText(detail)}</Descriptions.Item>
            {detail.rejectionReason && <Descriptions.Item label="เหตุผลที่ปฏิเสธ" span={2}>{detail.rejectionReason}</Descriptions.Item>}
            {detail.returnNote && <Descriptions.Item label="หมายเหตุการคืน" span={2}>{detail.returnNote}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>
      <Modal
        title={`ยืนยันคืนห้อง ${returnTarget?.room.roomCode ?? ""}`}
        open={Boolean(returnTarget)}
        onCancel={() => setReturnTarget(null)}
        onOk={() => returnTarget && void performAction(returnTarget, "return", { returnNote })}
        okText="ยืนยันคืน"
        cancelText="ยกเลิก"
        confirmLoading={Boolean(returnTarget && workingId === returnTarget.id)}
      >
        <p>ตรวจสอบห้องและยืนยันว่าคืนพื้นที่เรียบร้อยแล้ว</p>
        <Input.TextArea
          rows={3}
          maxLength={2000}
          placeholder="หมายเหตุการคืน (ไม่บังคับ)"
          value={returnNote}
          onChange={(event) => setReturnNote(event.target.value)}
        />
      </Modal>
      <Modal
        title={`ปฏิเสธคำขอ ${rejectTarget?.bookingNo ?? ""}`}
        open={Boolean(rejectTarget)}
        onCancel={() => setRejectTarget(null)}
        onOk={() => rejectTarget && void performAction(rejectTarget, "reject", { reason: rejectReason })}
        okText="ยืนยันปฏิเสธ"
        cancelText="กลับ"
        okButtonProps={{ danger: true }}
        confirmLoading={Boolean(rejectTarget && workingId === rejectTarget.id)}
      >
        <Input.TextArea
          rows={3}
          maxLength={1000}
          placeholder="ระบุเหตุผล (ไม่บังคับ)"
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
        />
      </Modal>
    </section>
  );
}
