import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, errorResponse, getRouteId, parseJson, unauthorizedResponse } from "@/lib/borrowings/http";
import { returnSchema } from "@/lib/borrowings/schemas";
import { changeBorrowingStatus } from "@/lib/borrowings/service";

export async function POST(
  request: Request,
  context: RouteContext<"/api/borrowings/[id]/return">,
) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const detail = await parseJson(request, returnSchema);
    const booking = await changeBorrowingStatus(actor, await getRouteId(context), "return", auditRequest(request), detail);
    return Response.json({ success: true, message: "ยืนยันคืนห้องแล้ว", data: booking });
  } catch (error) {
    return errorResponse(error);
  }
}
