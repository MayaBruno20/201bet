-- AlterTable
ALTER TABLE "Duel" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Duel" ADD COLUMN "customTitle" TEXT;
ALTER TABLE "Duel" ADD COLUMN "bannerUrl" TEXT;

-- CreateIndex
CREATE INDEX "Duel_isCustom_startsAt_idx" ON "Duel"("isCustom", "startsAt");
