-- CreateEnum
CREATE TYPE "WithdrawHoldReason" AS ENUM ('HIGH_AMOUNT', 'CPF_MISMATCH');

-- AlterTable
ALTER TABLE "Payment"
  ADD COLUMN "holdReason" "WithdrawHoldReason",
  ADD COLUMN "receiverDocument" TEXT;

-- DataFix: saques antigos pendentes já foram efetivados manualmente — marca como APROVADO.
-- Operação one-shot: futuros PENDING são gerados pelo novo fluxo (auto-hold com holdReason).
UPDATE "Payment"
SET "status" = 'APPROVED'
WHERE "type" = 'WITHDRAW' AND "status" = 'PENDING';
