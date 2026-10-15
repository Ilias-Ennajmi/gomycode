-- Daily review of highlights (spaced repetition) and tags on highlights.
ALTER TABLE "Highlight" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "reviewDueAt" TIMESTAMP(3),
ADD COLUMN "reviewInterval" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewDisabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Highlight_reviewDueAt_idx" ON "Highlight"("reviewDueAt");
