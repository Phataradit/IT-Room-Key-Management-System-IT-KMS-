import { UserRole } from "@prisma/client";
import { getApiUser } from "@/lib/auth/api-user";
import { prisma } from "@/lib/db/prisma";
import { inspectRoomSchedulePdf } from "@/lib/room-timetable/pdf-import";
import { unauthorizedResponse } from "@/lib/borrowings/http";

export const maxDuration = 300;

function errorResponse(message: string, status: number) {
  return Response.json({ success: false, message }, { status });
}

function encodeEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: Request) {
  const actor = await getApiUser();
  if (!actor) return unauthorizedResponse();
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.TEACHER) {
    return errorResponse("ไม่มีสิทธิ์นำเข้าตารางประจำห้อง", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("ไม่สามารถอ่านข้อมูลไฟล์ที่อัปโหลดได้", 400);
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return errorResponse("กรุณาเลือกไฟล์ PDF", 400);
  const maxBytes = Number(process.env.NEXT_PUBLIC_ROOM_SCHEDULE_IMPORT_MAX_BYTES ?? 25 * 1024 * 1024);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    console.error("Invalid ROOM_SCHEDULE_IMPORT_MAX_BYTES configuration");
    return errorResponse("การตั้งค่าขนาดไฟล์นำเข้าไม่ถูกต้อง", 500);
  }
  if (file.size > maxBytes) return errorResponse(`ไฟล์มีขนาดเกิน ${Math.floor(maxBytes / (1024 * 1024))} MB`, 413);
  if (file.size < 8 || (await file.slice(0, 5).text()) !== "%PDF-") {
    return errorResponse("ไฟล์ที่เลือกไม่ใช่ PDF ที่ถูกต้อง", 415);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const filename = file.name.slice(0, 200);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => encodeEvent(controller, event, data);
      void (async () => {
        try {
          const result = await inspectRoomSchedulePdf(bytes, filename, (progress) => send("progress", progress));
          const rooms = await prisma.room.findMany({
            where: { deletedAt: null, status: { notIn: ["DISABLED", "MAINTENANCE"] } },
            select: { id: true, roomCode: true, roomName: true, building: true },
            orderBy: { roomCode: "asc" },
          });
          const roomByCode = new Map(rooms.map((room) => [room.roomCode, room]));
          const rows = await Promise.all(result.rows.map(async (row) => {
            const room = row.roomCode ? roomByCode.get(row.roomCode) : null;
            const duplicate = Boolean(await prisma.roomSchedule.findFirst({
              where: {
                sourceFileHash: result.fileHash,
                sourcePage: row.sourcePage,
                sourceCellKey: row.sourceCellKey,
              },
              select: { id: true },
            }));
            return {
              ...row,
              roomId: room?.id ?? null,
              duplicate,
            };
          }));
          send("complete", { ...result, rows, rooms });
        } catch (error) {
          console.error("Room schedule PDF preview error:", error);
          send("error", {
            message: error instanceof Error
              ? error.message
              : "ประมวลผล PDF ไม่สำเร็จ",
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
