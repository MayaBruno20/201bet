-- Permite cadastro via Google (CPF e data de nascimento completados depois).
ALTER TABLE "User" ALTER COLUMN "cpf" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "birthDate" DROP NOT NULL;
