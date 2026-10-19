-- Smart features: near-duplicate articles hidden, and translations of an article's body.
ALTER TABLE "Article" ADD COLUMN "duplicateOf" TEXT,
ADD COLUMN "translations" JSONB;

CREATE INDEX "Article_duplicateOf_idx" ON "Article"("duplicateOf");
