-- Leva Tudo (2 chaves de 32 → semi/final/3º) reusa o motor do Armageddon.
-- Aditivo/idempotente: só acrescenta o valor LEVA_TUDO ao enum de bracketType.
ALTER TYPE "ArmageddonBracketType" ADD VALUE IF NOT EXISTS 'LEVA_TUDO';
