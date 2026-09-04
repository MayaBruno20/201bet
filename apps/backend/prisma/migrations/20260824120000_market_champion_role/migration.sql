-- Papel do mercado no pódio do Leva Tudo (CHAMPION | RUNNER_UP | THIRD).
-- Habilita auto-fechamento e auto-liquidação de Campeão/2º/3º.
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "championRole" TEXT;
