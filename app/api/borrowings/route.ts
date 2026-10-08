import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, errorResponse, parseJson, unauthorizedResponse } from "@/lib/borrowings/http";
import { borrowingInputSchema, listQuerySchema } from "@/lib/borrowings/schemas";
import { createBorrowing } from "@/lib/borrowings/service";
import { prisma } from "@/lib/db/prisma";
import { isStudentRole } from "@/lib/auth/roles";

function dayStartInBangkok(date: string) {
  return new Date(`${date}T00:00:00+07:00`);
}

export async function GET(request: Request) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();

    const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const where = {
      ...(isStudentRole(actor.role) ? { userId: actor.id } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            startsAt: {
              ...(query.dateFrom ? { gte: dayStartInBangkok(query.dateFrom) } : {}),
              ...(query.dateTo
                ? { lt: new Date(dayStartInBangkok(query.dateTo).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { bookingNo: { contains: query.search, mode: "insensitive" as const } },
              { purpose: { contains: query.search, mode: "insensitive" as const } },
              { room: { roomCode: { contains: query.search, mode: "insensitive" as const } } },
              { user: { firstName: { contains: query.search, mode: "insensitive" as const } } },
              { user: { lastName: { contains: query.search, mode: "insensitive" as const } } },
              { user: { studentId: { contains: query.search, mode: "insensitive" as const } } },
              { user: { employeeId: { contains: query.search, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [items, total, rooms] = await prisma.$transaction([
      prisma.roomBooking.findMany({
        where,
        include: {
          room: { select: { id: true, roomCode: true, roomName: true } },
          user: { select: { id: true, firstName: true, lastName: true, role: true, studentId: true, employeeId: true } },
          approvedBy: { select: { firstName: true, lastName: true } },
          rejectedBy: { select: { firstName: true, lastName: true } },
          returnedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.roomBooking.count({ where }),
      prisma.room.findMany({
        where: { deletedAt: null },
        select: { id: true, roomCode: true, roomName: true },
        orderBy: { roomCode: "asc" },
      }),
    ]);

    return Response.json({
      success: true,
      data: items,
      pagination: { page: query.page, pageSize: query.pageSize, total },
      rooms,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();
    const input = await parseJson(request, borrowingInputSchema);
    const booking = await createBorrowing(actor, input, auditRequest(request));
    return Response.json({
      success: true,
      message: "ส่งคำขอใช้ห้องแล้ว รอการอนุมัติ",
      data: booking,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
