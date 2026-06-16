-- Mercado multi-vencedor "QUALIFY" (ex.: 32 classificados do resorteio do Armageddon)
ALTER TYPE "public"."MarketType" ADD VALUE IF NOT EXISTS 'QUALIFY';

-- Associa cada opção (odd) a um piloto, para apuração por driverId em mercados de roster.
ALTER TABLE "public"."Odd" ADD COLUMN IF NOT EXISTS "driverId" TEXT;
