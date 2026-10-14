import { getApiUser } from "@/lib/auth/api-user";
import { unauthorizedResponse } from "@/lib/borrowings/http";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const result = await prisma.notification.updateMany({
      where: { userId: actor.id, isRead: false },
      data: { isRead: true },
    });
    return Response.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Mark all notifications read API error:", error);
    return Response.json({ success: false, message: "ปรับสถานะการแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
}
