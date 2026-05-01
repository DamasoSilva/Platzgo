-- CreateEnum
CREATE TYPE "TournamentConnectionKind" AS ENUM ('APPLICATION', 'INVITATION');

-- CreateEnum
CREATE TYPE "TournamentConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TournamentConnectionRequest" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "TournamentConnectionKind" NOT NULL,
    "status" "TournamentConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "response_note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentConnectionRequest_tournamentId_status_kind_idx" ON "TournamentConnectionRequest"("tournamentId", "status", "kind");

-- CreateIndex
CREATE INDEX "TournamentConnectionRequest_teamId_status_idx" ON "TournamentConnectionRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "TournamentConnectionRequest_playerUserId_status_idx" ON "TournamentConnectionRequest"("playerUserId", "status");

-- CreateIndex
CREATE INDEX "TournamentConnectionRequest_createdById_idx" ON "TournamentConnectionRequest"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentConnectionRequest_tournamentId_teamId_playerUserI_key" ON "TournamentConnectionRequest"("tournamentId", "teamId", "playerUserId", "kind");

-- AddForeignKey
ALTER TABLE "TournamentConnectionRequest" ADD CONSTRAINT "TournamentConnectionRequest_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentConnectionRequest" ADD CONSTRAINT "TournamentConnectionRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentConnectionRequest" ADD CONSTRAINT "TournamentConnectionRequest_playerUserId_fkey" FOREIGN KEY ("playerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentConnectionRequest" ADD CONSTRAINT "TournamentConnectionRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
