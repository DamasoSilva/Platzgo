-- Add online payments toggle per establishment
ALTER TABLE "Establishment" ADD COLUMN "online_payments_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Keep existing establishments enabled to avoid breaking current behavior
UPDATE "Establishment" SET "online_payments_enabled" = true;
