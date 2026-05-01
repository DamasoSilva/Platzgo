-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_REGISTRATION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_REGISTRATION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_REGISTRATION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_INVITATION';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "cover_image_url" TEXT;

-- CreateTable
CREATE TABLE "EstablishmentCustomerBlock" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "userId" TEXT,
    "cpf_cnpj" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstablishmentCustomerBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstablishmentCustomerBlock_establishmentId_createdAt_idx" ON "EstablishmentCustomerBlock"("establishmentId", "createdAt");

-- CreateIndex
CREATE INDEX "EstablishmentCustomerBlock_userId_idx" ON "EstablishmentCustomerBlock"("userId");

-- CreateIndex
CREATE INDEX "EstablishmentCustomerBlock_cpf_cnpj_idx" ON "EstablishmentCustomerBlock"("cpf_cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentCustomerBlock_establishmentId_userId_key" ON "EstablishmentCustomerBlock"("establishmentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentCustomerBlock_establishmentId_cpf_cnpj_key" ON "EstablishmentCustomerBlock"("establishmentId", "cpf_cnpj");

-- CreateIndex
CREATE INDEX "Booking_customerId_start_time_end_time_idx" ON "Booking"("customerId", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "Court_establishmentId_is_active_idx" ON "Court"("establishmentId", "is_active");

-- CreateIndex
CREATE INDEX "CourtBlock_courtId_start_time_end_time_idx" ON "CourtBlock"("courtId", "start_time", "end_time");

-- AddForeignKey
ALTER TABLE "EstablishmentCustomerBlock" ADD CONSTRAINT "EstablishmentCustomerBlock_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentCustomerBlock" ADD CONSTRAINT "EstablishmentCustomerBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentCustomerBlock" ADD CONSTRAINT "EstablishmentCustomerBlock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
