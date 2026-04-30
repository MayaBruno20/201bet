-- Make CategoryCompetitor.carName optional (Excel imports may not include the car name).
ALTER TABLE "CategoryCompetitor" ALTER COLUMN "carName" DROP NOT NULL;
