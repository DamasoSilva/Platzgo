-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SYSADMIN';

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "inactive_reason_id" TEXT,
ADD COLUMN     "inactive_reason_note" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CourtInactivationReason" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtInactivationReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourtInactivationReason_createdById_idx" ON "CourtInactivationReason"("createdById");

-- CreateIndex
CREATE INDEX "CourtInactivationReason_is_active_idx" ON "CourtInactivationReason"("is_active");

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_inactive_reason_id_fkey" FOREIGN KEY ("inactive_reason_id") REFERENCES "CourtInactivationReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtInactivationReason" ADD CONSTRAINT "CourtInactivationReason_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
