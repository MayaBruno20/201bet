-- CreateEnum
CREATE TYPE "public"."PromoBonusStatus" AS ENUM ('PENDING', 'GRANTED');

-- CreateTable
CREATE TABLE "public"."PromoCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "bonusAmount" DECIMAL(20,4) NOT NULL DEFAULT 5,
    "minDeposit" DECIMAL(20,4) NOT NULL DEFAULT 20,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromoEnrollment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bonusStatus" "public"."PromoBonusStatus" NOT NULL DEFAULT 'PENDING',
    "bonusAmount" DECIMAL(20,4),
    "qualifyingPaymentId" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bonusGrantedAt" TIMESTAMP(3),

    CONSTRAINT "PromoEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCampaign_code_key" ON "public"."PromoCampaign"("code");

-- CreateIndex
CREATE INDEX "PromoCampaign_code_idx" ON "public"."PromoCampaign"("code");

-- CreateIndex
CREATE INDEX "PromoCampaign_active_idx" ON "public"."PromoCampaign"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PromoEnrollment_userId_key" ON "public"."PromoEnrollment"("userId");

-- CreateIndex
CREATE INDEX "PromoEnrollment_campaignId_bonusStatus_idx" ON "public"."PromoEnrollment"("campaignId", "bonusStatus");

-- CreateIndex
CREATE INDEX "PromoEnrollment_userId_idx" ON "public"."PromoEnrollment"("userId");

-- AddForeignKey
ALTER TABLE "public"."PromoEnrollment" ADD CONSTRAINT "PromoEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."PromoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoEnrollment" ADD CONSTRAINT "PromoEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
