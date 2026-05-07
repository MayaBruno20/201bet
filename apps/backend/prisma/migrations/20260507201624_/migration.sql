/*
  Warnings:

  - A unique constraint covering the columns `[provider,providerRef]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."ListEventType" AS ENUM ('REGULAR', 'ARMAGEDDON', 'SHARK_TANK');

-- CreateEnum
CREATE TYPE "public"."CategoryEventStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'QUALIFYING', 'IN_PROGRESS', 'FINISHED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."TimeCategory" AS ENUM ('ORIGINAL_10S', 'CAT_9S', 'CAT_8_5S', 'CAT_8S', 'CAT_7_5S', 'CAT_7S', 'CAT_6_5S', 'CAT_6S', 'CAT_5_5S', 'TUDOKIDA', 'APRESENTACAO');

-- CreateEnum
CREATE TYPE "public"."CategoryMatchupStatus" AS ENUM ('PENDING', 'COMPLETED', 'INVALIDATED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."ArmageddonStatus" AS ENUM ('DRAFT', 'ROSTER_OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELED');

-- AlterEnum
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'UNKNOWN';

-- AlterEnum
ALTER TYPE "public"."WalletTransactionType" ADD VALUE 'AFFILIATE_COMMISSION';

-- AlterTable
ALTER TABLE "public"."Event" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."ListEvent" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "public"."ListEventType" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "pixKey" TEXT,
ADD COLUMN     "pixKeyType" TEXT;

-- CreateTable
CREATE TABLE "public"."CategoryEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "public"."CategoryEventStatus" NOT NULL DEFAULT 'DRAFT',
    "eventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CategoryBracket" (
    "id" TEXT NOT NULL,
    "categoryEventId" TEXT NOT NULL,
    "category" "public"."TimeCategory" NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 8,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CategoryCompetitor" (
    "id" TEXT NOT NULL,
    "bracketId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "carName" TEXT,
    "carNumber" TEXT,
    "qualifyingReaction" DECIMAL(8,3),
    "qualifyingTrack" DECIMAL(8,3),
    "qualifyingTotal" DECIMAL(8,3),
    "qualifyingPosition" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CategoryMatchup" (
    "id" TEXT NOT NULL,
    "bracketId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "isSuperFinal" BOOLEAN NOT NULL DEFAULT false,
    "duelId" TEXT,
    "marketOpen" BOOLEAN NOT NULL DEFAULT false,
    "leftCompetitorId" TEXT,
    "rightCompetitorId" TEXT,
    "leftReaction" DECIMAL(8,3),
    "leftTrack" DECIMAL(8,3),
    "leftQueimou" BOOLEAN NOT NULL DEFAULT false,
    "leftInvalid" BOOLEAN NOT NULL DEFAULT false,
    "rightReaction" DECIMAL(8,3),
    "rightTrack" DECIMAL(8,3),
    "rightQueimou" BOOLEAN NOT NULL DEFAULT false,
    "rightInvalid" BOOLEAN NOT NULL DEFAULT false,
    "winnerSide" "public"."MatchupSide",
    "status" "public"."CategoryMatchupStatus" NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryMatchup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArmageddonEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bannerUrl" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "format" "public"."ListFormat" NOT NULL DEFAULT 'TOP_20',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "public"."ArmageddonStatus" NOT NULL DEFAULT 'DRAFT',
    "eventId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArmageddonEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArmageddonRoster" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isKing" BOOLEAN NOT NULL DEFAULT false,
    "fromListId" TEXT,
    "fromAreaCode" INTEGER,
    "fromPosition" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArmageddonRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArmageddonMatchup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "roundType" "public"."ListRoundType" NOT NULL,
    "order" INTEGER NOT NULL,
    "leftPosition" INTEGER,
    "rightPosition" INTEGER,
    "leftDriverId" TEXT,
    "rightDriverId" TEXT,
    "winnerSide" "public"."MatchupSide",
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "marketOpen" BOOLEAN NOT NULL DEFAULT false,
    "duelId" TEXT,
    "settledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArmageddonMatchup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryEvent_status_idx" ON "public"."CategoryEvent"("status");

-- CreateIndex
CREATE INDEX "CategoryEvent_scheduledAt_idx" ON "public"."CategoryEvent"("scheduledAt");

-- CreateIndex
CREATE INDEX "CategoryEvent_featured_idx" ON "public"."CategoryEvent"("featured");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBracket_categoryEventId_category_key" ON "public"."CategoryBracket"("categoryEventId", "category");

-- CreateIndex
CREATE INDEX "CategoryCompetitor_bracketId_qualifyingPosition_idx" ON "public"."CategoryCompetitor"("bracketId", "qualifyingPosition");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryCompetitor_bracketId_driverId_key" ON "public"."CategoryCompetitor"("bracketId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMatchup_duelId_key" ON "public"."CategoryMatchup"("duelId");

-- CreateIndex
CREATE INDEX "CategoryMatchup_bracketId_roundNumber_idx" ON "public"."CategoryMatchup"("bracketId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMatchup_bracketId_roundNumber_position_key" ON "public"."CategoryMatchup"("bracketId", "roundNumber", "position");

-- CreateIndex
CREATE INDEX "ArmageddonEvent_status_idx" ON "public"."ArmageddonEvent"("status");

-- CreateIndex
CREATE INDEX "ArmageddonEvent_scheduledAt_idx" ON "public"."ArmageddonEvent"("scheduledAt");

-- CreateIndex
CREATE INDEX "ArmageddonEvent_featured_idx" ON "public"."ArmageddonEvent"("featured");

-- CreateIndex
CREATE INDEX "ArmageddonRoster_eventId_idx" ON "public"."ArmageddonRoster"("eventId");

-- CreateIndex
CREATE INDEX "ArmageddonRoster_driverId_idx" ON "public"."ArmageddonRoster"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ArmageddonRoster_eventId_position_key" ON "public"."ArmageddonRoster"("eventId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ArmageddonRoster_eventId_driverId_key" ON "public"."ArmageddonRoster"("eventId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "ArmageddonMatchup_duelId_key" ON "public"."ArmageddonMatchup"("duelId");

-- CreateIndex
CREATE INDEX "ArmageddonMatchup_eventId_roundNumber_order_idx" ON "public"."ArmageddonMatchup"("eventId", "roundNumber", "order");

-- CreateIndex
CREATE INDEX "ArmageddonMatchup_marketOpen_idx" ON "public"."ArmageddonMatchup"("marketOpen");

-- CreateIndex
CREATE INDEX "Event_featured_idx" ON "public"."Event"("featured");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON "public"."Payment"("provider", "providerRef");

-- AddForeignKey
ALTER TABLE "public"."CategoryBracket" ADD CONSTRAINT "CategoryBracket_categoryEventId_fkey" FOREIGN KEY ("categoryEventId") REFERENCES "public"."CategoryEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryCompetitor" ADD CONSTRAINT "CategoryCompetitor_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "public"."CategoryBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryCompetitor" ADD CONSTRAINT "CategoryCompetitor_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryMatchup" ADD CONSTRAINT "CategoryMatchup_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "public"."CategoryBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryMatchup" ADD CONSTRAINT "CategoryMatchup_leftCompetitorId_fkey" FOREIGN KEY ("leftCompetitorId") REFERENCES "public"."CategoryCompetitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CategoryMatchup" ADD CONSTRAINT "CategoryMatchup_rightCompetitorId_fkey" FOREIGN KEY ("rightCompetitorId") REFERENCES "public"."CategoryCompetitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArmageddonRoster" ADD CONSTRAINT "ArmageddonRoster_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."ArmageddonEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArmageddonRoster" ADD CONSTRAINT "ArmageddonRoster_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArmageddonMatchup" ADD CONSTRAINT "ArmageddonMatchup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."ArmageddonEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArmageddonMatchup" ADD CONSTRAINT "ArmageddonMatchup_leftDriverId_fkey" FOREIGN KEY ("leftDriverId") REFERENCES "public"."Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArmageddonMatchup" ADD CONSTRAINT "ArmageddonMatchup_rightDriverId_fkey" FOREIGN KEY ("rightDriverId") REFERENCES "public"."Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
