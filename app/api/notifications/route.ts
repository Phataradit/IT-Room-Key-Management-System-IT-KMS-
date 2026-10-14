import { NotificationType } from "@prisma/client";
import { connection } from "next/server";
import { getApiUser } from "@/lib/auth/api-user";
import { unauthorizedResponse } from "@/lib/borrowings/http";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  await connection();
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? 10) || 10));
    const unreadOnly = params.get("unreadOnly") === "true";
    const search = params.get("search")?.trim().slice(0, 100);
    const typeValue = params.get("type");
    const type = typeValue && Object.values(NotificationType).includes(typeValue as NotificationType)
      ? typeValue as NotificationType
      : undefined;
    const where = {
      userId: actor.id,
      ...(unreadOnly ? { isRead: false } : {}),
      ...(type ? { type } : {}),
      ...(search ? {
        OR: [
          { title: { contains: search, mode: "insensitive" as const } },
          { message: { contains: search, mode: "insensitive" as const } },
        ],
      } : {}),
    };
    const [data, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: actor.id, isRead: false } }),
    ]);
    return Response.json({
      success: true,
      data,
      pagination: { page, pageSize, total },
      unreadCount,
    });
  } catch (error) {
    console.error("Notification list API error:", error);
    return Response.json({ success: false, message: "โหลดการแจ้งเตือนไม่สำเร็จ" }, { status: 500 });
  }
}
