-- Shark Tank por chaves reusa o motor de eliminação do Armageddon.
-- Aditivo/idempotente: só acrescenta o valor SHARK_TANK ao enum de bracketType.
ALTER TYPE "ArmageddonBracketType" ADD VALUE IF NOT EXISTS 'SHARK_TANK';
