-- Rules that notify (alert) or save to Later (save) as new articles arrive.
ALTER TYPE "FilterAction" ADD VALUE IF NOT EXISTS 'alert';
ALTER TYPE "FilterAction" ADD VALUE IF NOT EXISTS 'save';

ALTER TABLE "Article" ADD COLUMN "alertedAt" TIMESTAMP(3);

CREATE INDEX "Article_alertedAt_idx" ON "Article"("alertedAt");
