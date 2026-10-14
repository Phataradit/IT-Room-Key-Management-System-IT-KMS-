import { getApiUser } from "@/lib/auth/api-user";
import { getRouteId, unauthorizedResponse } from "@/lib/borrowings/http";
import { prisma } from "@/lib/db/prisma";

type IdRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: IdRouteContext) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const id = await getRouteId(context);
    const result = await prisma.notification.updateMany({
      where: { id, userId: actor.id, isRead: false },
      data: { isRead: true },
    });
    if (!result.count) {
      const existing = await prisma.notification.findFirst({
        where: { id, userId: actor.id },
        select: { id: true, isRead: true },
      });
      if (!existing) {
        return Response.json({ success: false, message: "ไม่พบการแจ้งเตือน" }, { status: 404 });
      }
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error("Mark notification read API error:", error);
    return Response.json({ success: false, message: "ปรับสถานะการแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
}
