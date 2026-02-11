-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AVAILABILITY_ALERT';

-- CreateTable
CREATE TABLE "AvailabilityAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityAlert_userId_createdAt_idx" ON "AvailabilityAlert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AvailabilityAlert_courtId_start_time_idx" ON "AvailabilityAlert"("courtId", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityAlert_userId_courtId_start_time_end_time_key" ON "AvailabilityAlert"("userId", "courtId", "start_time", "end_time");

-- AddForeignKey
ALTER TABLE "AvailabilityAlert" ADD CONSTRAINT "AvailabilityAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityAlert" ADD CONSTRAINT "AvailabilityAlert_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
