-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "closing_time_by_weekday" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "opening_time_by_weekday" TEXT[] DEFAULT ARRAY[]::TEXT[];
