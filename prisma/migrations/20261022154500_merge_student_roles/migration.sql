CREATE TYPE "UserRole_new" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

ALTER TABLE "User"
ALTER COLUMN "role" DROP DEFAULT,
ALTER COLUMN "role" TYPE "UserRole_new"
USING (
  CASE
    WHEN "role"::text IN ('SCHOOL_STUDENT', 'STUDENT') THEN 'STUDENT'
    ELSE "role"::text
  END
)::"UserRole_new";

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "User"
ALTER COLUMN "role" SET DEFAULT 'STUDENT';
