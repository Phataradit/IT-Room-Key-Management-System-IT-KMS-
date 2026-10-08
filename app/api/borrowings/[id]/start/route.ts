import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, errorResponse, getRouteId, unauthorizedResponse } from "@/lib/borrowings/http";
import { changeBorrowingStatus } from "@/lib/borrowings/service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/borrowings/[id]/start">,
) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const booking = await changeBorrowingStatus(actor, await getRouteId(context), "start", auditRequest(request));
    return Response.json({ success: true, message: "เริ่มใช้งานห้องแล้ว", data: booking });
  } catch (error) {
    return errorResponse(error);
  }
}
