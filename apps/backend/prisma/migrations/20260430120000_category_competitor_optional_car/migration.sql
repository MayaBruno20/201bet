-- Make CategoryCompetitor.carName optional (Excel imports may not include the car name).
ALTER TABLE IF EXISTS "CategoryCompetitor" ALTER COLUMN "carName" DROP NOT NULL;
