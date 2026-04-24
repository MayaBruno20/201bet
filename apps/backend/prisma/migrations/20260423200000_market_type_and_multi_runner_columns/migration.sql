-- Colunas de Market alinhadas ao schema (multi-runner / tipos de mercado); faltavam no init.

CREATE TYPE "public"."MarketType" AS ENUM ('DUEL', 'WINNER', 'BEST_REACTION', 'FALSE_START');

ALTER TABLE "public"."Market"
  ADD COLUMN "type" "public"."MarketType" NOT NULL DEFAULT 'DUEL',
  ADD COLUMN "rakePercent" DECIMAL(5,2),
  ADD COLUMN "winnerOddId" TEXT,
  ADD COLUMN "settledAt" TIMESTAMP(3),
  ADD COLUMN "duelId" TEXT,
  ADD COLUMN "bookingCloseAt" TIMESTAMP(3);

CREATE INDEX "Market_type_idx" ON "public"."Market"("type");
CREATE INDEX "Market_duelId_idx" ON "public"."Market"("duelId");

ALTER TABLE "public"."Market" ADD CONSTRAINT "Market_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "public"."Duel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
