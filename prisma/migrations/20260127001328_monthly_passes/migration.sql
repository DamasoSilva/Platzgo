-- CreateEnum
CREATE TYPE "MonthlyPassStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "monthly_price_cents" INTEGER,
ADD COLUMN     "monthly_terms" TEXT;

-- CreateTable
CREATE TABLE "MonthlyPass" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "MonthlyPassStatus" NOT NULL DEFAULT 'PENDING',
    "price_cents" INTEGER NOT NULL,
    "terms_snapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyPass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyPass_courtId_month_idx" ON "MonthlyPass"("courtId", "month");

-- CreateIndex
CREATE INDEX "MonthlyPass_customerId_month_idx" ON "MonthlyPass"("customerId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyPass_courtId_customerId_month_key" ON "MonthlyPass"("courtId", "customerId", "month");

-- AddForeignKey
ALTER TABLE "MonthlyPass" ADD CONSTRAINT "MonthlyPass_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyPass" ADD CONSTRAINT "MonthlyPass_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
