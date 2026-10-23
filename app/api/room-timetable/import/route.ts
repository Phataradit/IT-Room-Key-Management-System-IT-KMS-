import { ZodError, z } from "zod";
import { DayOfWeek, UserRole } from "@prisma/client";
import { getApiUser } from "@/lib/auth/api-user";
import { auditRequest, unauthorizedResponse } from "@/lib/borrowings/http";
import { prisma } from "@/lib/db/prisma";
import { roomScheduleInputSchema } from "@/lib/room-timetable/schemas";
import { createRoomSchedule, RoomScheduleError } from "@/lib/room-timetable/service";

const importRowSchema = z.object({
  sourcePage: z.number().int().positive().max(100),
  sourceCellKey: z.string().trim().min(1).max(200),
  sourceCellText: z.string().max(4000),
  sourceConfidence: z.number().min(0).max(100).nullable(),
  sourceBounds: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }).strict(),
  sourceWords: z.array(z.object({
    text: z.string().max(1000),
    confidence: z.number().min(0).max(100).nullable(),
    source: z.enum(["PDF_TEXT", "OCR"]),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0).max(1),
    height: z.number().min(0).max(1),
  }).strict()).max(1000),
  sourceStructured: z.object({
    courseCode: z.string().nullable(),
    subject: z.string().nullable(),
    teacherName: z.string().nullable(),
    className: z.string().nullable(),
    dayOfWeek: z.nativeEnum(DayOfWeek).nullable(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    semester: z.string().nullable(),
    academicYear: z.string().nullable(),
  }).strict(),
  sourceBuilding: z.string().trim().max(100).nullable(),
  roomId: z.string().min(1).max(30),
  dayOfWeek: z.nativeEnum(DayOfWeek),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  courseCode: z.string().trim().max(50).nullable(),
  subject: z.string().trim().max(200).nullable(),
  teacherName: z.string().trim().max(200).nullable(),
  className: z.string().trim().max(100).nullable(),
  semester: z.string().trim().max(20).nullable(),
  academicYear: z.string().trim().max(20).nullable(),
  effectiveFrom: z.iso.date().nullable(),
  effectiveTo: z.iso.date().nullable(),
}).refine((row) => row.startTime < row.endTime, {
  path: ["endTime"],
  message: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
}).refine((row) => !row.effectiveTo || !row.effectiveFrom || row.effectiveFrom <= row.effectiveTo, {
  path: ["effectiveTo"],
  message: "วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม",
});

const importSchema = z.object({
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  fileName: z.string().trim().min(1).max(200),
  pageCount: z.number().int().positive().max(100),
  rawExtraction: z.object({
    pages: z.array(z.json()).max(100),
    courseCatalog: z.array(z.json()).max(1000),
  }).strict(),
  rows: z.array(importRowSchema).min(1).max(500),
}).strict();

export async function POST(request: Request) {
  const actor = await getApiUser();
  if (!actor) return unauthorizedResponse();
  if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.TEACHER) {
    return Response.json({ success: false, message: "ไม่มีสิทธิ์นำเข้าตารางประจำห้อง" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, message: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const input = importSchema.parse(body);
    if (JSON.stringify(input.rawExtraction).length > 12 * 1024 * 1024) {
      return Response.json({ success: false, message: "ข้อมูลต้นฉบับที่สกัดมีขนาดเกินกำหนด กรุณาแบ่ง PDF แล้วนำเข้าเป็นชุด" }, { status: 413 });
    }
    if (input.rawExtraction.pages.length !== input.pageCount) {
      return Response.json({ success: false, message: "จำนวนหน้าของข้อมูลต้นฉบับไม่ตรงกับเอกสาร" }, { status: 422 });
    }
    const importedDocument = await prisma.roomScheduleImport.upsert({
      where: { fileHash: input.fileHash },
      update: {},
      create: {
        fileHash: input.fileHash,
        fileName: input.fileName,
        pageCount: input.pageCount,
        rawExtraction: input.rawExtraction,
        createdById: actor.id,
      },
      select: { id: true },
    });
    const results: Array<{ sourcePage: number; sourceCellKey: string; status: "IMPORTED" | "DUPLICATE" | "FAILED"; message?: string }> = [];
    for (const row of input.rows) {
      try {
        const room = await prisma.room.findFirst({
          where: {
            id: row.roomId,
            deletedAt: null,
            status: { notIn: ["DISABLED", "MAINTENANCE"] },
          },
          select: { id: true },
        });
        if (!room) {
          results.push({ sourcePage: row.sourcePage, sourceCellKey: row.sourceCellKey, status: "FAILED", message: "ไม่พบห้องหรือห้องปิดใช้งานแล้ว" });
          continue;
        }
        const scheduleInput = roomScheduleInputSchema.parse({
          ...row,
          teacherId: null,
          status: "ACTIVE",
          notes: null,
        });
        await createRoomSchedule(actor, scheduleInput, auditRequest(request), {
          scheduleImportId: importedDocument.id,
          sourceFileHash: input.fileHash,
          sourceFileName: input.fileName,
          sourcePage: row.sourcePage,
          sourceCellKey: row.sourceCellKey,
          sourceCellText: row.sourceCellText,
          sourceBounds: row.sourceBounds,
          sourceWords: row.sourceWords,
          sourceStructured: row.sourceStructured,
          sourceBuilding: row.sourceBuilding,
          sourceConfidence: row.sourceConfidence,
        });
        results.push({ sourcePage: row.sourcePage, sourceCellKey: row.sourceCellKey, status: "IMPORTED" });
      } catch (error) {
        if (error instanceof RoomScheduleError && error.code === "IMPORT_DUPLICATE") {
          results.push({ sourcePage: row.sourcePage, sourceCellKey: row.sourceCellKey, status: "DUPLICATE", message: error.message });
        } else {
          results.push({
            sourcePage: row.sourcePage,
            sourceCellKey: row.sourceCellKey,
            status: "FAILED",
            message: error instanceof Error ? error.message : "บันทึกรายการไม่สำเร็จ",
          });
        }
      }
    }
    const imported = results.filter((result) => result.status === "IMPORTED").length;
    const duplicates = results.filter((result) => result.status === "DUPLICATE").length;
    const failed = results.length - imported - duplicates;
    return Response.json({
      success: true,
      data: { imported, duplicates, failed, results },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({
        success: false,
        message: "ข้อมูลที่ยืนยันนำเข้าไม่ถูกต้อง กรุณาตรวจสอบรายการอีกครั้ง",
        errors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      }, { status: 422 });
    }
    console.error("Room schedule PDF import error:", error);
    return Response.json({ success: false, message: "นำเข้าตารางประจำห้องไม่สำเร็จ" }, { status: 500 });
  }
}
