-- CreateTable
CREATE TABLE "EstablishmentReview" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstablishmentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstablishmentFavorite" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstablishmentFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstablishmentReview_establishmentId_createdAt_idx" ON "EstablishmentReview"("establishmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentReview_establishmentId_userId_key" ON "EstablishmentReview"("establishmentId", "userId");

-- CreateIndex
CREATE INDEX "EstablishmentFavorite_userId_createdAt_idx" ON "EstablishmentFavorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EstablishmentFavorite_establishmentId_userId_key" ON "EstablishmentFavorite"("establishmentId", "userId");

-- AddForeignKey
ALTER TABLE "EstablishmentReview" ADD CONSTRAINT "EstablishmentReview_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentReview" ADD CONSTRAINT "EstablishmentReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentFavorite" ADD CONSTRAINT "EstablishmentFavorite_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentFavorite" ADD CONSTRAINT "EstablishmentFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
