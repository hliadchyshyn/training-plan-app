-- CreateTable
CREATE TABLE "RaceRegistration" (
    "id" TEXT NOT NULL,
    "wpId" INTEGER NOT NULL,
    "wpUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "userName" TEXT,
    "anonsEventId" INTEGER NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "location" TEXT,
    "eventUrl" TEXT,
    "distance" TEXT NOT NULL,
    "raceDistanceCode" TEXT,
    "goalTimeRaw" TEXT,
    "goalSeconds" INTEGER,
    "notes" TEXT,
    "wpUpdatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaceResult" (
    "id" TEXT NOT NULL,
    "wpId" INTEGER NOT NULL,
    "wpUserId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "raceEventId" INTEGER NOT NULL,
    "eventTitle" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "distanceCode" TEXT NOT NULL,
    "distanceLabel" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "resultTimeRaw" TEXT NOT NULL,
    "resultSeconds" INTEGER NOT NULL,
    "resultStatus" TEXT NOT NULL,
    "isPersonalBest" BOOLEAN NOT NULL DEFAULT false,
    "isSeasonBest" BOOLEAN NOT NULL DEFAULT false,
    "registrationWpId" INTEGER,
    "wpUpdatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RaceRegistration_wpId_key" ON "RaceRegistration"("wpId");

-- CreateIndex
CREATE INDEX "RaceRegistration_email_eventDate_idx" ON "RaceRegistration"("email", "eventDate");

-- CreateIndex
CREATE INDEX "RaceRegistration_eventDate_idx" ON "RaceRegistration"("eventDate");

-- CreateIndex
CREATE UNIQUE INDEX "RaceResult_wpId_key" ON "RaceResult"("wpId");

-- CreateIndex
CREATE INDEX "RaceResult_email_eventDate_idx" ON "RaceResult"("email", "eventDate");

-- CreateIndex
CREATE INDEX "RaceResult_eventDate_idx" ON "RaceResult"("eventDate");

-- CreateIndex
CREATE INDEX "RaceResult_registrationWpId_idx" ON "RaceResult"("registrationWpId");

