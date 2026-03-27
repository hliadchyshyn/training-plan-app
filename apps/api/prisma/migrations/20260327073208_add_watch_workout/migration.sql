-- CreateEnum
CREATE TYPE "WatchSport" AS ENUM ('RUNNING', 'CYCLING', 'SWIMMING');

-- CreateTable
CREATE TABLE "WatchWorkout" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" "WatchSport" NOT NULL DEFAULT 'RUNNING',
    "steps" JSONB NOT NULL,
    "notes" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchWorkout_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WatchWorkout" ADD CONSTRAINT "WatchWorkout_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
