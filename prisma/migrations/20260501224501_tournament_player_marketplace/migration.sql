-- CreateTable
CREATE TABLE "TournamentPlayerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "birth_year" INTEGER NOT NULL,
    "preferred_position" TEXT NOT NULL,
    "height_cm" INTEGER NOT NULL,
    "weight_kg" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentPlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPlayerAvailability" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentPlayerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentTeamRecruitmentPosting" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "whatsapp_number" TEXT NOT NULL,
    "desired_position" TEXT NOT NULL,
    "average_age" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentTeamRecruitmentPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayerProfile_userId_key" ON "TournamentPlayerProfile"("userId");

-- CreateIndex
CREATE INDEX "TournamentPlayerProfile_preferred_position_idx" ON "TournamentPlayerProfile"("preferred_position");

-- CreateIndex
CREATE INDEX "TournamentPlayerAvailability_tournamentId_createdAt_idx" ON "TournamentPlayerAvailability"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentPlayerAvailability_userId_idx" ON "TournamentPlayerAvailability"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPlayerAvailability_tournamentId_userId_key" ON "TournamentPlayerAvailability"("tournamentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentTeamRecruitmentPosting_teamId_key" ON "TournamentTeamRecruitmentPosting"("teamId");

-- CreateIndex
CREATE INDEX "TournamentTeamRecruitmentPosting_tournamentId_createdAt_idx" ON "TournamentTeamRecruitmentPosting"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "TournamentTeamRecruitmentPosting_createdById_idx" ON "TournamentTeamRecruitmentPosting"("createdById");

-- CreateIndex
CREATE INDEX "TournamentTeamRecruitmentPosting_desired_position_idx" ON "TournamentTeamRecruitmentPosting"("desired_position");

-- AddForeignKey
ALTER TABLE "TournamentPlayerProfile" ADD CONSTRAINT "TournamentPlayerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayerAvailability" ADD CONSTRAINT "TournamentPlayerAvailability_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayerAvailability" ADD CONSTRAINT "TournamentPlayerAvailability_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPlayerAvailability" ADD CONSTRAINT "TournamentPlayerAvailability_profile_fkey" FOREIGN KEY ("userId") REFERENCES "TournamentPlayerProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamRecruitmentPosting" ADD CONSTRAINT "TournamentTeamRecruitmentPosting_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamRecruitmentPosting" ADD CONSTRAINT "TournamentTeamRecruitmentPosting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentTeamRecruitmentPosting" ADD CONSTRAINT "TournamentTeamRecruitmentPosting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
