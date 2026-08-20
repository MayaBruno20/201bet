-- Integração Listas Brasil (sync de pilotos/listas/eventos). Aditivo/idempotente.

ALTER TABLE "BrazilList" ADD COLUMN IF NOT EXISTS "listasBrasilId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "BrazilList_listasBrasilId_key" ON "BrazilList"("listasBrasilId");

ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "listasBrasilId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Driver_listasBrasilId_key" ON "Driver"("listasBrasilId");

ALTER TABLE "ListEvent" ADD COLUMN IF NOT EXISTS "listasBrasilId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ListEvent_listasBrasilId_key" ON "ListEvent"("listasBrasilId");

CREATE TABLE IF NOT EXISTS "IntegrationSyncState" (
  "id" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "lastStatus" TEXT,
  "lastMessage" TEXT,
  "stats" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationSyncState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationSyncState_resource_key" ON "IntegrationSyncState"("resource");

CREATE TABLE IF NOT EXISTS "ExternalImageCache" (
  "id" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalImageCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalImageCache_sourceUrl_key" ON "ExternalImageCache"("sourceUrl");
