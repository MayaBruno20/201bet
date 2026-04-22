-- CreateEnum
CREATE TYPE "public"."ListFormat" AS ENUM ('TOP_10', 'TOP_20');

-- CreateEnum
CREATE TYPE "public"."ListRoundType" AS ENUM ('ODD', 'EVEN', 'SHARK_TANK');

-- CreateEnum
CREATE TYPE "public"."MatchupSide" AS ENUM ('LEFT', 'RIGHT');

-- CreateEnum
CREATE TYPE "public"."ListEventStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."SharkTankStatus" AS ENUM ('REGISTERED', 'ELIMINATED', 'FINALIST', 'PROMOTED');

-- AlterTable Driver: novos campos
ALTER TABLE "public"."Driver" ADD COLUMN "carNumber" TEXT;
ALTER TABLE "public"."Driver" ADD COLUMN "team" TEXT;
ALTER TABLE "public"."Driver" ADD COLUMN "hometown" TEXT;
ALTER TABLE "public"."Driver" ADD COLUMN "avatarUrl" TEXT;

-- CreateTable BrazilList
CREATE TABLE "public"."BrazilList" (
    "id" TEXT NOT NULL,
    "areaCode" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "format" "public"."ListFormat" NOT NULL DEFAULT 'TOP_20',
    "administratorName" TEXT,
    "hometown" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrazilList_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrazilList_areaCode_key" ON "public"."BrazilList"("areaCode");
CREATE INDEX "BrazilList_active_idx" ON "public"."BrazilList"("active");

-- CreateTable ListRoster
CREATE TABLE "public"."ListRoster" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isKing" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListRoster_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListRoster_listId_position_key" ON "public"."ListRoster"("listId", "position");
CREATE UNIQUE INDEX "ListRoster_listId_driverId_key" ON "public"."ListRoster"("listId", "driverId");
CREATE INDEX "ListRoster_listId_idx" ON "public"."ListRoster"("listId");
CREATE INDEX "ListRoster_driverId_idx" ON "public"."ListRoster"("driverId");

ALTER TABLE "public"."ListRoster" ADD CONSTRAINT "ListRoster_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."BrazilList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ListRoster" ADD CONSTRAINT "ListRoster_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable ListEvent
CREATE TABLE "public"."ListEvent" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."ListEventStatus" NOT NULL DEFAULT 'DRAFT',
    "eventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListEvent_listId_scheduledAt_idx" ON "public"."ListEvent"("listId", "scheduledAt");
CREATE INDEX "ListEvent_status_idx" ON "public"."ListEvent"("status");

ALTER TABLE "public"."ListEvent" ADD CONSTRAINT "ListEvent_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."BrazilList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ListMatchup
CREATE TABLE "public"."ListMatchup" (
    "id" TEXT NOT NULL,
    "listEventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "roundType" "public"."ListRoundType" NOT NULL,
    "order" INTEGER NOT NULL,
    "leftPosition" INTEGER,
    "rightPosition" INTEGER,
    "leftDriverId" TEXT,
    "rightDriverId" TEXT,
    "winnerSide" "public"."MatchupSide",
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListMatchup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListMatchup_listEventId_roundNumber_order_idx" ON "public"."ListMatchup"("listEventId", "roundNumber", "order");

ALTER TABLE "public"."ListMatchup" ADD CONSTRAINT "ListMatchup_listEventId_fkey" FOREIGN KEY ("listEventId") REFERENCES "public"."ListEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ListMatchup" ADD CONSTRAINT "ListMatchup_leftDriverId_fkey" FOREIGN KEY ("leftDriverId") REFERENCES "public"."Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."ListMatchup" ADD CONSTRAINT "ListMatchup_rightDriverId_fkey" FOREIGN KEY ("rightDriverId") REFERENCES "public"."Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable SharkTankEntry
CREATE TABLE "public"."SharkTankEntry" (
    "id" TEXT NOT NULL,
    "listEventId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "public"."SharkTankStatus" NOT NULL DEFAULT 'REGISTERED',
    "seed" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharkTankEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharkTankEntry_listEventId_driverId_key" ON "public"."SharkTankEntry"("listEventId", "driverId");
CREATE INDEX "SharkTankEntry_listEventId_status_idx" ON "public"."SharkTankEntry"("listEventId", "status");

ALTER TABLE "public"."SharkTankEntry" ADD CONSTRAINT "SharkTankEntry_listEventId_fkey" FOREIGN KEY ("listEventId") REFERENCES "public"."ListEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."SharkTankEntry" ADD CONSTRAINT "SharkTankEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
