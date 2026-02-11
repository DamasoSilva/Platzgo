-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancel_fee_cents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "cancel_fee_fixed_cents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_fee_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancel_min_hours" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "EstablishmentHoliday" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT false,
    "opening_time" TEXT,
    "closing_time" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstablishmentHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstablishmentHoliday_establishmentId_date_idx" ON "EstablishmentHoliday"("establishmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentHoliday_establishmentId_date_key" ON "EstablishmentHoliday"("establishmentId", "date");

-- AddForeignKey
ALTER TABLE "EstablishmentHoliday" ADD CONSTRAINT "EstablishmentHoliday_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
