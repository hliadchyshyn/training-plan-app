-- Drop team-related tables (cascade removes FK constraints)
DROP TABLE IF EXISTS "TeamMember";
ALTER TABLE "TrainingPlan" DROP COLUMN IF EXISTS "teamId";
DROP TABLE IF EXISTS "TrainerTeam";

-- Add trainer relationship to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "inviteCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "trainerId" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_inviteCode_key" UNIQUE ("inviteCode");
ALTER TABLE "User" ADD CONSTRAINT "User_trainerId_fkey"
  FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "User_trainerId_idx" ON "User"("trainerId");
