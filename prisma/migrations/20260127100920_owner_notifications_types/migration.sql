-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_RESCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_AUTO_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE 'MONTHLY_PASS_PENDING';
