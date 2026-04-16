-- CreateTable
CREATE TABLE "public"."DuelPoolState" (
    "duelId" TEXT NOT NULL,
    "leftPool" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "rightPool" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "leftTickets" INTEGER NOT NULL DEFAULT 0,
    "rightTickets" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DuelPoolState_pkey" PRIMARY KEY ("duelId")
);

-- AddForeignKey
ALTER TABLE "public"."DuelPoolState" ADD CONSTRAINT "DuelPoolState_duelId_fkey" FOREIGN KEY ("duelId") REFERENCES "public"."Duel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing duels with neutral starting pools
INSERT INTO "public"."DuelPoolState" ("duelId", "leftPool", "rightPool", "leftTickets", "rightTickets", "createdAt", "updatedAt")
SELECT
 d."id",
    1500,
    1500,
    18,
    18,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."Duel" d
WHERE NOT EXISTS (SELECT 1 FROM "public"."DuelPoolState" p WHERE p."duelId" = d."id");
