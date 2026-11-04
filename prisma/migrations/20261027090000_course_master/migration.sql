-- Add a central course catalogue and an optional exact-code relationship
-- from existing room schedules. Existing schedule rows remain unchanged.
ALTER TABLE "RoomSchedule" ADD COLUMN "courseId" TEXT;

CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_courseCode_key" ON "Course"("courseCode");
CREATE INDEX "Course_isActive_courseName_idx" ON "Course"("isActive", "courseName");
CREATE INDEX "RoomSchedule_courseId_idx" ON "RoomSchedule"("courseId");

ALTER TABLE "RoomSchedule"
    ADD CONSTRAINT "RoomSchedule_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
