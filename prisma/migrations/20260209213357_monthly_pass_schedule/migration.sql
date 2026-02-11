-- AlterTable
ALTER TABLE "MonthlyPass" ADD COLUMN     "end_time" TEXT,
ADD COLUMN     "start_time" TEXT,
ADD COLUMN     "weekday" INTEGER;

-- CreateIndex
CREATE INDEX "MonthlyPass_courtId_month_weekday_idx" ON "MonthlyPass"("courtId", "month", "weekday");
