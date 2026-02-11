-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[];
