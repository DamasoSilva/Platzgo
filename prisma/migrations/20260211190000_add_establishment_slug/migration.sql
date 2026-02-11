-- Add slug for public establishment URLs.
ALTER TABLE "Establishment" ADD COLUMN "slug" TEXT;

CREATE UNIQUE INDEX "Establishment_slug_key" ON "Establishment"("slug");
