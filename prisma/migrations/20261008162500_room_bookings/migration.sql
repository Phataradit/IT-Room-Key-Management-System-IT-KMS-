CREATE TYPE "BookingStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'USING',
  'RETURNED',
  'CANCELLED',
  'REJECTED'
);

CREATE TABLE "RoomBooking" (
  "id" TEXT NOT NULL,
  "bookingNo" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
  "purpose" TEXT NOT NULL,
  "attendeeCount" INTEGER NOT NULL,
  "note" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "startedAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "returnNote" TEXT,
  "returnedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RoomBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RoomBooking_attendeeCount_check" CHECK ("attendeeCount" > 0),
  CONSTRAINT "RoomBooking_timeRange_check" CHECK ("startsAt" < "endsAt")
);

CREATE UNIQUE INDEX "RoomBooking_bookingNo_key" ON "RoomBooking"("bookingNo");
CREATE INDEX "RoomBooking_userId_startsAt_idx" ON "RoomBooking"("userId", "startsAt");
CREATE INDEX "RoomBooking_roomId_status_startsAt_endsAt_idx" ON "RoomBooking"("roomId", "status", "startsAt", "endsAt");
CREATE INDEX "RoomBooking_status_startsAt_idx" ON "RoomBooking"("status", "startsAt");

ALTER TABLE "RoomBooking"
  ADD CONSTRAINT "RoomBooking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomBooking"
  ADD CONSTRAINT "RoomBooking_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomBooking"
  ADD CONSTRAINT "RoomBooking_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoomBooking"
  ADD CONSTRAINT "RoomBooking_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RoomBooking"
  ADD CONSTRAINT "RoomBooking_returnedById_fkey"
  FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
