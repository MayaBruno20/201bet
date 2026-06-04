-- CreateEnum
CREATE TYPE "public"."ArmageddonBracketType" AS ENUM ('LADDER', 'ELIMINATION_144');

-- CreateEnum
CREATE TYPE "public"."ArmageddonStage" AS ENUM ('FIRST_DRAW', 'SECOND_DRAW');

-- DropIndex
DROP INDEX "public"."ArmageddonRoster_eventId_position_key";

-- AlterTable
ALTER TABLE "public"."ArmageddonEvent" ADD COLUMN     "bracketType" "public"."ArmageddonBracketType" NOT NULL DEFAULT 'LADDER';

-- AlterTable
ALTER TABLE "public"."ArmageddonRoster" ADD COLUMN     "bracketKey" TEXT;

-- AlterTable
ALTER TABLE "public"."ArmageddonMatchup" ADD COLUMN     "bracketKey" TEXT,
ADD COLUMN     "isFinal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isThirdPlace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loserToMatchupId" TEXT,
ADD COLUMN     "loserToSlotSide" "public"."MatchupSide",
ADD COLUMN     "nextMatchupId" TEXT,
ADD COLUMN     "nextSlotSide" "public"."MatchupSide",
ADD COLUMN     "stage" "public"."ArmageddonStage",
ALTER COLUMN "roundType" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ArmageddonRoster_eventId_bracketKey_idx" ON "public"."ArmageddonRoster"("eventId", "bracketKey");

-- CreateIndex
CREATE UNIQUE INDEX "ArmageddonRoster_eventId_bracketKey_position_key" ON "public"."ArmageddonRoster"("eventId", "bracketKey", "position");

-- CreateIndex
CREATE INDEX "ArmageddonMatchup_eventId_stage_bracketKey_roundNumber_orde_idx" ON "public"."ArmageddonMatchup"("eventId", "stage", "bracketKey", "roundNumber", "order");

