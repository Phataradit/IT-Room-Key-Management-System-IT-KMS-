type ApiUser = { id: string } | null;
type Course = { courseCode: string; courseName: string } | null;

export function createCourseGetHandler(dependencies: {
  getApiUser: () => Promise<ApiUser>;
  findCourseByCode: (courseCode: string) => Promise<Course>;
  unauthorizedResponse: () => Response;
}): (request: Request) => Promise<Response>;
