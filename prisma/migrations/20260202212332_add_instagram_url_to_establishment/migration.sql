-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SportType" ADD VALUE 'POLIESPORTIVA';
ALTER TYPE "SportType" ADD VALUE 'SOCIETY';
ALTER TYPE "SportType" ADD VALUE 'SQUASH';
ALTER TYPE "SportType" ADD VALUE 'TABLE_TENNIS';
ALTER TYPE "SportType" ADD VALUE 'BADMINTON';
ALTER TYPE "SportType" ADD VALUE 'VOLLEYBALL';
ALTER TYPE "SportType" ADD VALUE 'BASKETBALL';
ALTER TYPE "SportType" ADD VALUE 'GOLF';
ALTER TYPE "SportType" ADD VALUE 'RACQUETBALL';
ALTER TYPE "SportType" ADD VALUE 'HANDBALL';
ALTER TYPE "SportType" ADD VALUE 'CAMPO';
ALTER TYPE "SportType" ADD VALUE 'PISCINA';
ALTER TYPE "SportType" ADD VALUE 'CUSTOM';
ALTER TYPE "SportType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Establishment" ADD COLUMN     "instagram_url" TEXT;
