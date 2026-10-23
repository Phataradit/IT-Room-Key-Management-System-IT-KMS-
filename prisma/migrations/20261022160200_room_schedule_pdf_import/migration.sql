ALTER TABLE "RoomSchedule"
    ALTER COLUMN "subject" DROP NOT NULL,
    ALTER COLUMN "teacherName" DROP NOT NULL,
    ALTER COLUMN "className" DROP NOT NULL,
    ALTER COLUMN "semester" DROP NOT NULL,
    ALTER COLUMN "academicYear" DROP NOT NULL;

ALTER TABLE "RoomSchedule"
    ADD COLUMN "sourceFileHash" TEXT,
    ADD COLUMN "sourceFileName" TEXT,
    ADD COLUMN "sourcePage" INTEGER,
    ADD COLUMN "sourceCellKey" TEXT,
    ADD COLUMN "sourceCellText" TEXT,
    ADD COLUMN "sourceBuilding" TEXT,
    ADD COLUMN "sourceConfidence" DOUBLE PRECISION;

CREATE UNIQUE INDEX "RoomSchedule_sourceFileHash_sourcePage_sourceCellKey_key"
    ON "RoomSchedule"("sourceFileHash", "sourcePage", "sourceCellKey");
