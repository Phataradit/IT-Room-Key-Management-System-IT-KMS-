import { timingSafeEqual } from "node:crypto";
import { runRoomUsageNotificationJob } from "@/lib/room-timetable/notifications";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({
      success: false,
      code: "SCHEDULER_NOT_CONFIGURED",
      message: "ยังไม่ได้ตั้งค่า CRON_SECRET",
    }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ success: false, code: "UNAUTHORIZED", message: "ไม่มีสิทธิ์เรียก Scheduler" }, { status: 401 });
  }

  try {
    const result = await runRoomUsageNotificationJob();
    return Response.json({ success: true, data: result });
  } catch (error) {
    console.error("Room usage notification job failed:", error);
    return Response.json({
      success: false,
      code: "SCHEDULER_FAILED",
      message: "ประมวลผลการแจ้งเตือนไม่สำเร็จ",
    }, { status: 500 });
  }
}
