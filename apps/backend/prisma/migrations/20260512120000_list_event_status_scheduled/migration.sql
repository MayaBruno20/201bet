-- Adiciona o status SCHEDULED ao enum ListEventStatus.
-- Postgres exige ALTER TYPE fora de transação implícita.
-- O `IF NOT EXISTS` torna a migration idempotente (re-runs seguros).
ALTER TYPE "ListEventStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED' BEFORE 'IN_PROGRESS';
