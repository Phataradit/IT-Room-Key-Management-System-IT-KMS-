CREATE TABLE "RoomScheduleImport" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "rawExtraction" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomScheduleImport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RoomSchedule"
    ADD COLUMN "scheduleImportId" TEXT,
    ADD COLUMN "sourceBounds" JSONB,
    ADD COLUMN "sourceWords" JSONB,
    ADD COLUMN "sourceStructured" JSONB;

CREATE UNIQUE INDEX "RoomScheduleImport_fileHash_key"
    ON "RoomScheduleImport"("fileHash");
CREATE INDEX "RoomScheduleImport_createdById_createdAt_idx"
    ON "RoomScheduleImport"("createdById", "createdAt");
CREATE INDEX "RoomSchedule_scheduleImportId_idx"
    ON "RoomSchedule"("scheduleImportId");

ALTER TABLE "RoomScheduleImport"
    ADD CONSTRAINT "RoomScheduleImport_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoomSchedule"
    ADD CONSTRAINT "RoomSchedule_scheduleImportId_fkey"
    FOREIGN KEY ("scheduleImportId") REFERENCES "RoomScheduleImport"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
