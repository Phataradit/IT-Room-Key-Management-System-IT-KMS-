import { ZodError } from "zod";
import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, unauthorizedResponse } from "@/lib/borrowings/http";
import { roomScheduleInputSchema, roomTimetableQuerySchema } from "@/lib/room-timetable/schemas";
import {
  createRoomSchedule,
  getRoomTimetable,
  parseRoomScheduleJson,
  RoomScheduleError,
} from "@/lib/room-timetable/service";
function handleError(error: unknown) {
  if (error instanceof RoomScheduleError) {
    return Response.json({ success: false, code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
      errors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    }, { status: 422 });
  }
  console.error("Room timetable API error:", error);
  return Response.json({ success: false, code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const query = roomTimetableQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await getRoomTimetable(actor, query);
    return Response.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const input = await parseRoomScheduleJson(request, roomScheduleInputSchema);
    const schedule = await createRoomSchedule(actor, input, auditRequest(request));
    return Response.json({ success: true, data: schedule }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
