import { z } from "zod";
import { getApiUser } from "@/lib/auth/api-user";
import { getDashboardStatistics } from "@/lib/dashboard/statistics-service";
import { getBangkokCurrentDate, getBangkokCurrentMonth, getBangkokCurrentYear } from "@/lib/dashboard/statistics.mjs";

const querySchema = z.object({
  period: z.enum(["day", "month", "semester", "year"]).default("month"),
  date: z.string().optional(),
  month: z.string().optional(),
  year: z.string().optional(),
  term: z.string().optional(),
});

export async function GET(request: Request) {
  const actor = await getApiUser();
  if (!actor) return Response.json({ success: false, message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (actor.role !== "ADMIN") {
    return Response.json({ success: false, message: "ไม่มีสิทธิ์ดูสถิติภาพรวม" }, { status: 403 });
  }

  try {
    const params = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await getDashboardStatistics({
      ...params,
      date: params.date ?? getBangkokCurrentDate(),
      month: params.month ?? getBangkokCurrentMonth(),
      year: params.year ?? String(getBangkokCurrentYear()),
    });
    return Response.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, message: "ตัวกรองรายงานไม่ถูกต้อง" }, { status: 422 });
    }
    if (error instanceof Error && ["วันที่ไม่ถูกต้อง", "เดือนที่เลือกไม่ถูกต้อง", "ปีที่เลือกไม่ถูกต้อง"].includes(error.message)) {
      return Response.json({ success: false, message: error.message }, { status: 422 });
    }
    if (error instanceof Error && error.message.startsWith("ไม่พบปฏิทิน")) {
      return Response.json({ success: false, message: error.message }, { status: 422 });
    }
    console.error("Admin dashboard statistics error:", error);
    return Response.json({ success: false, message: "ไม่สามารถโหลดสถิติได้" }, { status: 500 });
  }
}
