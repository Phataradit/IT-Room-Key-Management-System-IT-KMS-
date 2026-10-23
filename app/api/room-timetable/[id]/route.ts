import { ZodError } from "zod";
import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, getRouteId, unauthorizedResponse } from "@/lib/borrowings/http";
import { roomScheduleInputSchema } from "@/lib/room-timetable/schemas";
import {
  deleteRoomSchedule,
  parseRoomScheduleJson,
  RoomScheduleError,
  updateRoomSchedule,
} from "@/lib/room-timetable/service";
import { prisma } from "@/lib/db/prisma";

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
  console.error("Room timetable detail API error:", error);
  return Response.json({ success: false, code: "INTERNAL_ERROR", message: "เกิดข้อผิดพลาดภายในระบบ" }, { status: 500 });
}

export async function GET(_request: Request, context: IdRouteContext) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const schedule = await prisma.roomSchedule.findUnique({
      where: { id: await getRouteId(context) },
      include: {
        room: { select: { id: true, roomCode: true, roomName: true } },
        exceptions: { orderBy: { date: "asc" } },
      },
    });
    if (!schedule) throw new RoomScheduleError("ไม่พบตารางสอน", "SCHEDULE_NOT_FOUND", 404);
    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: Request, context: IdRouteContext) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const input = await parseRoomScheduleJson(request, roomScheduleInputSchema);
    const schedule = await updateRoomSchedule(actor, await getRouteId(context), input, auditRequest(request));
    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: IdRouteContext) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const schedule = await deleteRoomSchedule(actor, await getRouteId(context), auditRequest(request));
    return Response.json({ success: true, data: schedule });
  } catch (error) {
    return handleError(error);
  }
}
