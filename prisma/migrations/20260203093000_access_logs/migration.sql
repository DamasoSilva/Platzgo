-- Create AccessLog table
CREATE TABLE "AccessLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "establishmentId" TEXT,
  "courtId" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "referer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AccessLog" ADD CONSTRAINT "AccessLog_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccessLog_createdAt_idx" ON "AccessLog"("createdAt");
CREATE INDEX "AccessLog_userId_createdAt_idx" ON "AccessLog"("userId", "createdAt");
CREATE INDEX "AccessLog_establishmentId_createdAt_idx" ON "AccessLog"("establishmentId", "createdAt");
CREATE INDEX "AccessLog_courtId_createdAt_idx" ON "AccessLog"("courtId", "createdAt");
