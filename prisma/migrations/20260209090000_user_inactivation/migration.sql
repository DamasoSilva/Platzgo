-- Add user inactivation fields
ALTER TABLE "User"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inactive_reason" TEXT,
  ADD COLUMN "inactivatedAt" TIMESTAMP(3),
  ADD COLUMN "inactivatedById" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_inactivatedById_fkey" FOREIGN KEY ("inactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_is_active_idx" ON "User"("is_active");
CREATE INDEX "User_inactivatedById_idx" ON "User"("inactivatedById");
