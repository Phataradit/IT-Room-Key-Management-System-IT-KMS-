import { normalizeCourseCode } from "./course-code.mjs";

function jsonNoStore(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function createCourseGetHandler({ getApiUser, findCourseByCode, unauthorizedResponse }) {
  return async function GET(request) {
    const actor = await getApiUser();
    if (!actor) return unauthorizedResponse();

    const rawCode = new URL(request.url).searchParams.get("courseCode") ?? "";
    const courseCode = normalizeCourseCode(rawCode);
    if (!courseCode) {
      return jsonNoStore({ success: false, message: "กรุณาระบุรหัสวิชาให้ถูกต้อง" }, 400);
    }

    const course = await findCourseByCode(courseCode);
    if (!course) {
      return jsonNoStore({ success: false, message: "ไม่พบรหัสวิชาในฐานข้อมูล" }, 404);
    }

    return jsonNoStore({
      success: true,
      data: { courseCode: course.courseCode, courseName: course.courseName },
    });
  };
}
