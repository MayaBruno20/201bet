-- CreateTable
CREATE TABLE "SiteDisclaimer" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "variant" TEXT NOT NULL DEFAULT 'amber',
    "scrolling" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDisclaimer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteDisclaimer_active_priority_idx" ON "SiteDisclaimer"("active", "priority");
