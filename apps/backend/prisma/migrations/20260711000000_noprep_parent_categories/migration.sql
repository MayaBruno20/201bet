-- Categorias-pai da Copa MT No Prep (evento unificado por grupo). Aditivo/idempotente.
ALTER TYPE "TimeCategory" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "TimeCategory" ADD VALUE IF NOT EXISTS 'RACING';
ALTER TYPE "TimeCategory" ADD VALUE IF NOT EXISTS 'STREET';
