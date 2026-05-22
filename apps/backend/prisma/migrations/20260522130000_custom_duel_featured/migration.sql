-- AlterTable
ALTER TABLE "Duel" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Duel_isFeatured_isCustom_idx" ON "Duel"("isFeatured", "isCustom");
