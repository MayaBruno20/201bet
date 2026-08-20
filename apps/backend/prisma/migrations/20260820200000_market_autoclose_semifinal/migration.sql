-- Marcador p/ multi-mercados que fecham na semifinal (ex.: 2º/3º do Leva Tudo).
ALTER TABLE "Market" ADD COLUMN IF NOT EXISTS "autoCloseAtSemifinal" BOOLEAN NOT NULL DEFAULT false;
