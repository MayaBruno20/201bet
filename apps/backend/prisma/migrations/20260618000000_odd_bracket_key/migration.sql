-- AlterTable
ALTER TABLE "public"."Odd" ADD COLUMN     "bracketKey" TEXT;

-- CreateIndex
CREATE INDEX "Odd_marketId_bracketKey_idx" ON "public"."Odd"("marketId", "bracketKey");
