-- Add payout status enum
CREATE TYPE "PayoutStatus" AS ENUM ('NONE', 'PENDING', 'TRANSFERRED', 'FAILED');

-- Establishment wallet id for Asaas repasse
ALTER TABLE "Establishment"
  ADD COLUMN "asaas_wallet_id" TEXT;

-- Payment payout tracking
ALTER TABLE "Payment"
  ADD COLUMN "payout_status" "PayoutStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "payout_provider_id" TEXT,
  ADD COLUMN "payout_amount_cents" INTEGER,
  ADD COLUMN "payout_error" TEXT;
