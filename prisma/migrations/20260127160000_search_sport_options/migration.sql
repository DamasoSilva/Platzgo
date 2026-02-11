-- CreateTable
CREATE TABLE "SearchSportOption" (
  "id" TEXT NOT NULL,
  "sport_type" "SportType" NOT NULL,
  "label" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SearchSportOption_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SearchSportOption"
ADD CONSTRAINT "SearchSportOption_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "SearchSportOption_sport_type_key" ON "SearchSportOption"("sport_type");
CREATE INDEX "SearchSportOption_is_active_idx" ON "SearchSportOption"("is_active");
CREATE INDEX "SearchSportOption_createdById_idx" ON "SearchSportOption"("createdById");
