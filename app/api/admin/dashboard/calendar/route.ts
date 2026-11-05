import { z } from "zod";
import { getApiUser } from "@/lib/auth/api-user";
import { getSemesterCalendar, saveSemesterCalendar, semesterCalendarSchema } from "@/lib/dashboard/calendar";

export async function GET() {
  const actor = await getApiUser();
  if (!actor) return Response.json({ success: false, message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (actor.role !== "ADMIN" && actor.role !== "TEACHER") {
    return Response.json({ success: false, message: "ไม่มีสิทธิ์ดูปฏิทินภาคเรียน" }, { status: 403 });
  }
  try {
    return Response.json({ success: true, data: await getSemesterCalendar() });
  } catch (error) {
    console.error("Semester calendar read error:", error);
    return Response.json({ success: false, message: "อ่านข้อมูลปฏิทินภาคเรียนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const actor = await getApiUser();
  if (!actor) return Response.json({ success: false, message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (actor.role !== "ADMIN") {
    return Response.json({ success: false, message: "ไม่มีสิทธิ์จัดการปฏิทินภาคเรียน" }, { status: 403 });
  }
  try {
    const body: unknown = await request.json();
    const calendar = semesterCalendarSchema.parse(body);
    await saveSemesterCalendar(calendar);
    return Response.json({ success: true, data: calendar });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({
        success: false,
        message: "ข้อมูลปฏิทินไม่ถูกต้องหรือมีช่วงวันซ้ำซ้อน",
        errors: error.issues.map(({ path, message }) => ({ field: path.join("."), message })),
      }, { status: 422 });
    }
    console.error("Semester calendar save error:", error);
    return Response.json({ success: false, message: "บันทึกปฏิทินภาคเรียนไม่สำเร็จ" }, { status: 500 });
  }
}
