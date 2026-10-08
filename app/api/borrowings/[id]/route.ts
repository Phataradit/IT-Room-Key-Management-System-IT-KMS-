import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, errorResponse, getRouteId, parseJson, unauthorizedResponse } from "@/lib/borrowings/http";
import { borrowingInputSchema } from "@/lib/borrowings/schemas";
import { changeBorrowingStatus, updateBorrowing } from "@/lib/borrowings/service";
import { prisma } from "@/lib/db/prisma";
import { isStudentRole } from "@/lib/auth/roles";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/borrowings/[id]">,
) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const id = await getRouteId(context);
    const booking = await prisma.roomBooking.findUnique({
      where: { id },
      include: {
        room: true,
        user: { select: { id: true, firstName: true, lastName: true, role: true, studentId: true, employeeId: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        rejectedBy: { select: { firstName: true, lastName: true } },
        returnedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!booking) {
      return Response.json({ success: false, message: "ไม่พบรายการยืม", code: "BORROWING_NOT_FOUND" }, { status: 404 });
    }
    if (isStudentRole(actor.role) && booking.userId !== actor.id) {
      return Response.json({ success: false, message: "ไม่มีสิทธิ์ดูรายการนี้", code: "FORBIDDEN" }, { status: 403 });
    }
    return Response.json({ success: true, data: booking });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/borrowings/[id]">,
) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const id = await getRouteId(context);
    const input = await parseJson(request, borrowingInputSchema);
    const booking = await updateBorrowing(actor, id, input, auditRequest(request));
    return Response.json({ success: true, message: "บันทึกการแก้ไขแล้ว", data: booking });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/borrowings/[id]">,
) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const id = await getRouteId(context);
    const booking = await changeBorrowingStatus(actor, id, "cancel", auditRequest(request));
    return Response.json({ success: true, message: "ยกเลิกรายการแล้ว", data: booking });
  } catch (error) {
    return errorResponse(error);
  }
}
