ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROOM_ENDING_SOON';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROOM_USAGE_ENDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ROOM_USAGE_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCHEDULE_CHANGED';

CREATE TYPE "NotificationPriority" AS ENUM ('NORMAL', 'WARNING', 'CRITICAL');

ALTER TABLE "RoomSchedule"
    ADD COLUMN "teacherId" TEXT,
    ADD COLUMN "courseCode" TEXT,
    ADD COLUMN "effectiveFrom" DATE,
    ADD COLUMN "effectiveTo" DATE,
    ADD COLUMN "notes" TEXT;

ALTER TABLE "Notification"
    ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN "actionUrl" TEXT,
    ADD COLUMN "dedupeKey" TEXT;

CREATE TABLE "RoomScheduleException" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomScheduleException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_dedupeKey_key"
    ON "Notification"("dedupeKey");
CREATE INDEX "RoomSchedule_teacherId_status_idx"
    ON "RoomSchedule"("teacherId", "status");
CREATE INDEX "RoomSchedule_effectiveFrom_effectiveTo_idx"
    ON "RoomSchedule"("effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "RoomScheduleException_scheduleId_date_key"
    ON "RoomScheduleException"("scheduleId", "date");
CREATE INDEX "RoomScheduleException_date_idx"
    ON "RoomScheduleException"("date");

ALTER TABLE "RoomSchedule"
    ADD CONSTRAINT "RoomSchedule_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomScheduleException"
    ADD CONSTRAINT "RoomScheduleException_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "RoomSchedule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
