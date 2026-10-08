import { ZodError, type ZodType } from "zod";
import { BorrowingError } from "@/lib/borrowings/service";

export function auditRequest(request: Request) {
  return {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}

export function errorResponse(error: unknown) {
  if (error instanceof BorrowingError) {
    return Response.json({
      success: false,
      message: error.message,
      code: error.code,
    }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return Response.json({
      success: false,
      message: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
      code: "VALIDATION_ERROR",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    }, { status: 422 });
  }

  console.error("Borrowing API error:", error);
  return Response.json({
    success: false,
    message: "เกิดข้อผิดพลาดภายในระบบ",
    code: "INTERNAL_ERROR",
  }, { status: 500 });
}

export function unauthorizedResponse() {
  return Response.json({
    success: false,
    message: "กรุณาเข้าสู่ระบบ",
    code: "UNAUTHORIZED",
  }, { status: 401 });
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new BorrowingError("รูปแบบ JSON ไม่ถูกต้อง", "VALIDATION_ERROR", 400);
  }
  return schema.parse(body);
}

export function getRouteId(context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) => id);
}
