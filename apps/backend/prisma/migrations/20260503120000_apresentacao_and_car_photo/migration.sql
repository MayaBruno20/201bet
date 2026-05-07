-- AlterEnum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimeCategory') THEN
    ALTER TYPE "TimeCategory" ADD VALUE IF NOT EXISTS 'APRESENTACAO';
  END IF;
END
$$;

-- AlterTable
ALTER TABLE IF EXISTS "Car" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;
