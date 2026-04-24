-- Modelos Affiliate / AffiliateCommission e User.affiliateId (estavam no schema sem migração).

CREATE TABLE "public"."Affiliate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "commissionPct" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Affiliate_code_key" ON "public"."Affiliate"("code");
CREATE INDEX "Affiliate_code_idx" ON "public"."Affiliate"("code");
CREATE INDEX "Affiliate_active_idx" ON "public"."Affiliate"("active");

ALTER TABLE "public"."User" ADD COLUMN "affiliateId" TEXT;

CREATE INDEX "User_affiliateId_idx" ON "public"."User"("affiliateId");

ALTER TABLE "public"."User" ADD CONSTRAINT "User_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AffiliateCommission_affiliateId_createdAt_idx" ON "public"."AffiliateCommission"("affiliateId", "createdAt");
CREATE INDEX "AffiliateCommission_betId_idx" ON "public"."AffiliateCommission"("betId");
CREATE INDEX "AffiliateCommission_marketId_idx" ON "public"."AffiliateCommission"("marketId");

ALTER TABLE "public"."AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_betId_fkey" FOREIGN KEY ("betId") REFERENCES "public"."Bet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "public"."Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
