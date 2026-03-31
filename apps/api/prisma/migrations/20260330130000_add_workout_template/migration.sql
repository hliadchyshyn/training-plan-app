CREATE TABLE "WorkoutTemplate" (
    "id"        TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "sport"     "WatchSport" NOT NULL DEFAULT 'RUNNING',
    "steps"     JSONB NOT NULL,
    "notes"     TEXT,
    "isPublic"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkoutTemplate"
    ADD CONSTRAINT "WorkoutTemplate_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "WorkoutTemplate_creatorId_idx" ON "WorkoutTemplate"("creatorId");
CREATE INDEX "WorkoutTemplate_isPublic_idx"  ON "WorkoutTemplate"("isPublic");
