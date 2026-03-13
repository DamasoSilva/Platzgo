-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "level_label" TEXT;

-- CreateTable
CREATE TABLE "TournamentLevel" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentLevel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentLevel_tournamentId_idx" ON "TournamentLevel"("tournamentId");

-- AddForeignKey
ALTER TABLE "TournamentLevel" ADD CONSTRAINT "TournamentLevel_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
