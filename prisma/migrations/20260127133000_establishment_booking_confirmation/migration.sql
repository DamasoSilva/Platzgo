-- Add booking confirmation requirement flag to Establishment
ALTER TABLE "Establishment"
ADD COLUMN "requires_booking_confirmation" BOOLEAN NOT NULL DEFAULT true;
