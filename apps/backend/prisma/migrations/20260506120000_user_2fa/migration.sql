-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "twoFactorSecret"      TEXT,
  ADD COLUMN "twoFactorEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "twoFactorBackupCodes" TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[];
