import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { createCourseGetHandler } from "../lib/courses/api-handler.mjs";

const prisma = new PrismaClient();
try {
  const handler = createCourseGetHandler({
    getApiUser: async () => ({ id: "integration-test-user" }),
    findCourseByCode: (courseCode) => prisma.course.findFirst({
      where: { courseCode, isActive: true },
      select: { courseCode: true, courseName: true },
    }),
    unauthorizedResponse: () => Response.json({ success: false }, { status: 401 }),
  });

  const lookups = [
    ["21910-2021", "สื่อโมชันกราฟิก"],
    ["21910-1001", "พื้นฐานธุรกิจดิจิทัล"],
    ["21910-1002", "วิเคราะห์ความต้องการทางธุรกิจ"],
    ["00000-0000", "HomeRoom"],
  ];
  for (const [courseCode, courseName] of lookups) {
    const response = await handler(new Request(`http://localhost/api/courses?courseCode=${encodeURIComponent(courseCode)}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { success: true, data: { courseCode, courseName } });
  }

  const thaiDigits = await handler(new Request("http://localhost/api/courses?courseCode=%E0%B9%92%E0%B9%91%E0%B9%99%E0%B9%91%E0%B9%90%20%E2%80%93%20%E0%B9%92%E0%B9%90%E0%B9%92%E0%B9%91"));
  assert.equal(thaiDigits.status, 200);
  assert.equal((await thaiDigits.json()).data.courseName, "สื่อโมชันกราฟิก");

  const unknown = await handler(new Request("http://localhost/api/courses?courseCode=99999-9999"));
  assert.equal(unknown.status, 404);
  const invalid = await handler(new Request("http://localhost/api/courses?courseCode=21910-202"));
  assert.equal(invalid.status, 400);

  console.info(`Course API integration passed: ${lookups.length + 1} live PostgreSQL lookups, Thai digits, 404 unknown code, and 400 invalid code.`);
} finally {
  await prisma.$disconnect();
}
