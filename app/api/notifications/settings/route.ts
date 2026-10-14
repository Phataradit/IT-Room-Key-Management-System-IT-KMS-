import { UserRole } from "@prisma/client";
import { ZodError } from "zod";
import { getApiUser } from "@/lib/auth/api-user";
import { unauthorizedResponse } from "@/lib/borrowings/http";
import {
  getRoomNotificationSettings,
  updateRoomNotificationSettings,
} from "@/lib/room-timetable/notifications";
import { roomNotificationSettingsSchema } from "@/lib/room-timetable/schemas";

function forbiddenResponse() {
  return Response.json({ success: false, message: "เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งค่าการแจ้งเตือนได้" }, { status: 403 });
}

export async function GET() {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    if (actor.role !== UserRole.ADMIN) return forbiddenResponse();
    return Response.json({ success: true, data: await getRoomNotificationSettings() });
  } catch (error) {
    console.error("Notification settings API error:", error);
    return Response.json({ success: false, message: "โหลดการตั้งค่าการแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    if (actor.role !== UserRole.ADMIN) return forbiddenResponse();
    const input = roomNotificationSettingsSchema.parse(await request.json());
    const data = await updateRoomNotificationSettings({
      ...input,
      overdueMinutes: [...input.overdueMinutes].sort((a, b) => a - b),
    }, actor.id);
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ success: false, message: "ข้อมูลการตั้งค่าไม่ถูกต้อง" }, { status: 422 });
    }
    console.error("Update notification settings API error:", error);
    return Response.json({ success: false, message: "บันทึกการตั้งค่าการแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
}
