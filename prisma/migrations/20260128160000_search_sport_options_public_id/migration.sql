-- AddColumn
ALTER TABLE "SearchSportOption" ADD COLUMN "public_id" INTEGER;

-- Backfill existing rows with 0-based sequential IDs (stable by createdAt)
WITH ordered AS (
  SELECT
    "id",
    (row_number() OVER (ORDER BY "createdAt" ASC) - 1) AS rn
  FROM "SearchSportOption"
)
UPDATE "SearchSportOption" s
SET "public_id" = o.rn
FROM ordered o
WHERE s."id" = o."id";

-- Make it required
ALTER TABLE "SearchSportOption" ALTER COLUMN "public_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SearchSportOption_public_id_key" ON "SearchSportOption"("public_id");
