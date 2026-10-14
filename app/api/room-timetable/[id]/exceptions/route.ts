import { ZodError } from "zod";
import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, getRouteId, unauthorizedResponse } from "@/lib/borrowings/http";
import { roomScheduleExceptionSchema } from "@/lib/room-timetable/schemas";
import {
  addScheduleException,
  parseRoomScheduleJson,
  removeScheduleException,
  RoomScheduleError,
} from "@/lib/room-timetable/service";

type IdRouteContext = { params: Promise<{ id: string }> };

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
  console.error("Room schedule exception API error:", error);
  return Response.json({ success: false, code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
}

export async function POST(request: Request, context: IdRouteContext) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const input = await parseRoomScheduleJson(request, roomScheduleExceptionSchema);
    const exception = await addScheduleException(
      actor,
      await getRouteId(context),
      input.date,
      input.reason,
      auditRequest(request),
    );
    return Response.json({ success: true, data: exception }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: IdRouteContext) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const exceptionId = new URL(request.url).searchParams.get("exceptionId");
    if (!exceptionId) {
      return Response.json({ success: false, code: "VALIDATION_ERROR", message: "กรุณาระบุรายการวันที่ยกเลิก" }, { status: 422 });
    }
    await removeScheduleException(actor, await getRouteId(context), exceptionId, auditRequest(request));
    return Response.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
