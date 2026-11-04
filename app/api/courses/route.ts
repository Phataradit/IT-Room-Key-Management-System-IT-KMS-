import { getApiUser } from "@/lib/auth/api-user";
import { unauthorizedResponse } from "@/lib/borrowings/http";
import { findCourseByCode } from "@/lib/courses/service";
import { createCourseGetHandler } from "@/lib/courses/api-handler.mjs";

export const GET = createCourseGetHandler({ getApiUser, findCourseByCode, unauthorizedResponse });
