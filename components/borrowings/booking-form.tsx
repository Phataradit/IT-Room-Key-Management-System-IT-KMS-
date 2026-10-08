"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Alert, Button } from "antd";
import { useRouter } from "next/navigation";

export type BookingRoomOption = {
  id: string;
  roomCode: string;
  roomName: string;
  capacity: number | null;
};

export type BookingFormValues = {
  id?: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  attendeeCount: number;
  note: string | null;
};

type BookingFormProps = {
  rooms: BookingRoomOption[];
  initial?: BookingFormValues;
};

function asBangkokDateTime(value?: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function BookingForm({ rooms, initial }: BookingFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === roomId), [roomId, rooms]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const date = String(form.get("date") ?? "");
    const startsAt = `${date}T${String(form.get("startTime") ?? "")}:00+07:00`;
    const endsAt = `${date}T${String(form.get("endTime") ?? "")}:00+07:00`;
    const body = {
      roomId: String(form.get("roomId") ?? ""),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      purpose: String(form.get("purpose") ?? ""),
      attendeeCount: Number(form.get("attendeeCount")),
      note: String(form.get("note") ?? "").trim() || null,
    };

    try {
      const response = await fetch(initial?.id ? `/api/borrowings/${initial.id}` : "/api/borrowings", {
        method: initial?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as {
        success: boolean;
        message?: string;
        errors?: Array<{ field: string; message: string }>;
      };
      if (!response.ok || !result.success) {
        setError(result.message ?? "บันทึกรายการไม่สำเร็จ");
        setFieldErrors(Object.fromEntries((result.errors ?? []).map((issue) => [issue.field, issue.message])));
        return;
      }
      setSuccess(result.message ?? "บันทึกรายการแล้ว");
      window.setTimeout(() => {
        router.push("/borrowings");
        router.refresh();
      }, 700);
    } catch {
      setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="booking-form" onSubmit={handleSubmit}>
      {error && <Alert type="error" showIcon message={error} className="booking-form-alert" />}
      {success && <Alert type="success" showIcon message={success} className="booking-form-alert" />}
      <label htmlFor="roomId">ห้อง <span>*</span></label>
      <select
        id="roomId"
        name="roomId"
        value={roomId}
        onChange={(event) => setRoomId(event.target.value)}
        required
      >
        <option value="">เลือกห้อง</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>{room.roomCode} · {room.roomName}</option>
        ))}
      </select>
      {fieldErrors.roomId && <span className="form-field-error">{fieldErrors.roomId}</span>}
      {selectedRoom?.capacity && <small className="form-hint">ห้องนี้รองรับไม่เกิน {selectedRoom.capacity} คน</small>}

      <label htmlFor="date">วันที่ <span>*</span></label>
      <input
        id="date"
        name="date"
        type="date"
        defaultValue={initial ? asBangkokDateTime(initial.startsAt).slice(0, 10) : ""}
        required
      />

      <div className="form-time-grid">
        <div>
          <label htmlFor="startTime">เวลาเริ่ม <span>*</span></label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            defaultValue={initial ? asBangkokDateTime(initial.startsAt).slice(11, 16) : ""}
            required
          />
        </div>
        <div>
          <label htmlFor="endTime">เวลาสิ้นสุด <span>*</span></label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            defaultValue={initial ? asBangkokDateTime(initial.endsAt).slice(11, 16) : ""}
            required
          />
        </div>
      </div>
      {fieldErrors.startsAt && <span className="form-field-error">{fieldErrors.startsAt}</span>}
      {fieldErrors.endsAt && <span className="form-field-error">{fieldErrors.endsAt}</span>}

      <label htmlFor="purpose">วัตถุประสงค์ <span>*</span></label>
      <input
        id="purpose"
        name="purpose"
        type="text"
        maxLength={500}
        defaultValue={initial?.purpose ?? ""}
        placeholder="เช่น สอนวิชา Database Systems"
        required
      />
      {fieldErrors.purpose && <span className="form-field-error">{fieldErrors.purpose}</span>}

      <label htmlFor="attendeeCount">จำนวนผู้ใช้งาน <span>*</span></label>
      <input
        id="attendeeCount"
        name="attendeeCount"
        type="number"
        min={1}
        max={1000}
        defaultValue={initial?.attendeeCount ?? 1}
        required
      />
      {fieldErrors.attendeeCount && <span className="form-field-error">{fieldErrors.attendeeCount}</span>}

      <label htmlFor="note">หมายเหตุ</label>
      <textarea
        id="note"
        name="note"
        rows={3}
        maxLength={2000}
        defaultValue={initial?.note ?? ""}
        placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
      />

      <div className="booking-form-footer">
        <Button onClick={() => router.back()} disabled={saving}>ยกเลิก</Button>
        <Button type="primary" htmlType="submit" loading={saving}>
          {initial ? "บันทึกการแก้ไข" : "ส่งคำขอยืมห้อง"}
        </Button>
      </div>
    </form>
  );
}
