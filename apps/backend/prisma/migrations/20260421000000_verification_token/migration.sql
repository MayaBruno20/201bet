-- CreateEnum
CREATE TYPE "public"."VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "public"."VerificationTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "public"."VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_type_idx" ON "public"."VerificationToken"("userId", "type");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "public"."VerificationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
