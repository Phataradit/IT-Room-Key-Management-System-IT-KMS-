import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, errorResponse, getRouteId, parseJson, unauthorizedResponse } from "@/lib/borrowings/http";
import { rejectionSchema } from "@/lib/borrowings/schemas";
import { changeBorrowingStatus } from "@/lib/borrowings/service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/borrowings/[id]/reject">,
) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const detail = await parseJson(request, rejectionSchema);
    const booking = await changeBorrowingStatus(actor, await getRouteId(context), "reject", auditRequest(request), detail);
    return Response.json({ success: true, message: "ปฏิเสธคำขอแล้ว", data: booking });
  } catch (error) {
    return errorResponse(error);
  }
}
