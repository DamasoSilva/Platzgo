-- Add per-establishment payment provider configuration.
ALTER TABLE "Establishment" ADD COLUMN "payment_provider" "PaymentProvider" NOT NULL DEFAULT 'ASAAS';
ALTER TABLE "Establishment" ADD COLUMN "payment_providers" "PaymentProvider"[] NOT NULL DEFAULT ARRAY[]::"PaymentProvider"[];
