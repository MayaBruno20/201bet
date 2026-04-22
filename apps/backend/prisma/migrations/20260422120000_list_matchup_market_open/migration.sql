-- AlterTable
ALTER TABLE "ListMatchup" ADD COLUMN "marketOpen" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ListMatchup_marketOpen_idx" ON "ListMatchup"("marketOpen");
