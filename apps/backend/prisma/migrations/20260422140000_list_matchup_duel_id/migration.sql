ALTER TABLE "ListMatchup" ADD COLUMN "duelId" TEXT;
CREATE UNIQUE INDEX "ListMatchup_duelId_key" ON "ListMatchup"("duelId");
