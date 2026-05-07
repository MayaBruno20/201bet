-- AlterEnum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CategoryMatchupStatus') THEN
    ALTER TYPE "CategoryMatchupStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
  END IF;
END
$$;
