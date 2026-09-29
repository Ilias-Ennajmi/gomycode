-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- Full-text search. reader_fold lowercases and drops accents, so "etat" finds "État".
CREATE OR REPLACE FUNCTION reader_fold(value text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT translate(lower(coalesce(value, '')), 'àáâãäåāăąçćčďèéêëēėęěğìíîïīįıłľñńňòóôõöøōřśšşťţùúûüūůűýÿźżž', 'aaaaaaaaacccdeeeeeeeegiiiiiiillnnnooooooorsssttuuuuuuuyyzzz') $$;

-- The "simple" configuration (no stemming) works the same for French and English; the app
-- searches word prefixes, so "econom" finds économie and economy. A trigger rather than a
-- generated column, which Prisma would try to alter in later migrations.
ALTER TABLE "Article" ADD COLUMN "search" tsvector;

-- Pinned to this schema: the trigger also runs on connections whose search_path doesn't
-- include it (Supabase keeps the app's tables in "rss").
CREATE OR REPLACE FUNCTION reader_article_search() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path FROM CURRENT
  AS $$
BEGIN
  NEW."search" :=
    setweight(to_tsvector('simple', reader_fold(NEW."title")), 'A') ||
    setweight(to_tsvector('simple', reader_fold(coalesce(NEW."summary", '') || ' ' || coalesce(NEW."aiSummary", '') || ' ' || coalesce(NEW."author", ''))), 'B') ||
    setweight(to_tsvector('simple', reader_fold(left(regexp_replace(coalesce(NEW."content", ''), '<[^>]*>', ' ', 'g'), 10000))), 'C');
  RETURN NEW;
END
$$;

CREATE TRIGGER "Article_search_update"
  BEFORE INSERT OR UPDATE OF "title", "summary", "aiSummary", "author", "content" ON "Article"
  FOR EACH ROW EXECUTE FUNCTION reader_article_search();

-- Existing articles: rewriting the title fires the trigger.
UPDATE "Article" SET "title" = "title";

-- AlterTable
ALTER TABLE "Feed" ADD COLUMN     "email" TEXT,
ADD COLUMN     "platform" TEXT;

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Highlight_articleId_idx" ON "Highlight"("articleId");

-- CreateIndex
CREATE INDEX "Highlight_createdAt_idx" ON "Highlight"("createdAt");

-- CreateIndex
CREATE INDEX "Article_snoozedUntil_idx" ON "Article"("snoozedUntil");

-- CreateIndex
CREATE INDEX "Article_search_idx" ON "Article" USING GIN ("search");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Newsletters that were followed before platforms were recorded.
UPDATE "Feed" SET "platform" = 'substack' WHERE "type" = 'newsletter' AND "url" ILIKE '%substack.com%';
UPDATE "Feed" SET "platform" = 'beehiiv' WHERE "type" = 'newsletter' AND "url" ILIKE '%beehiiv.com%';
UPDATE "Feed" SET "platform" = 'buttondown' WHERE "type" = 'newsletter' AND "url" ~* 'buttondown\.(email|com)';
UPDATE "Feed" SET "type" = 'newsletter', "platform" = 'substack' WHERE "type" = 'rss' AND "newsDesk" IS NULL AND "url" ILIKE '%.substack.com/%';
