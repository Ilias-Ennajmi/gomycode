-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "chapters" JSONB,
ADD COLUMN     "durationSeconds" INTEGER,
ADD COLUMN     "isShort" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "keyMoments" JSONB,
ADD COLUMN     "liveStatus" TEXT,
ADD COLUMN     "transcript" JSONB,
ADD COLUMN     "videoAiAt" TIMESTAMP(3),
ADD COLUMN     "videoAiAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "videoCheckedAt" TIMESTAMP(3),
ADD COLUMN     "watchedSeconds" INTEGER;

-- AlterTable
ALTER TABLE "Feed" ADD COLUMN     "videosScannedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Article_isShort_idx" ON "Article"("isShort");


-- Existing Shorts: their links say so.
UPDATE "Article" SET "isShort" = true WHERE "link" LIKE '%youtube.com/shorts/%';

-- Search also covers what's said in videos (the transcript), with the lowest weight.
CREATE OR REPLACE FUNCTION reader_article_search() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path FROM CURRENT
  AS $$
BEGIN
  NEW."search" :=
    setweight(to_tsvector('simple', reader_fold(NEW."title")), 'A') ||
    setweight(to_tsvector('simple', reader_fold(coalesce(NEW."summary", '') || ' ' || coalesce(NEW."aiSummary", '') || ' ' || coalesce(NEW."author", ''))), 'B') ||
    setweight(to_tsvector('simple', reader_fold(left(regexp_replace(coalesce(NEW."content", ''), '<[^>]*>', ' ', 'g'), 10000))), 'C') ||
    setweight(to_tsvector('simple', reader_fold(left(coalesce(
      (SELECT string_agg(chunk->>'text', ' ') FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(NEW."transcript") = 'array' THEN NEW."transcript" ELSE '[]'::jsonb END
      ) AS chunk), ''), 30000))), 'D');
  RETURN NEW;
END
$$;

DROP TRIGGER "Article_search_update" ON "Article";
CREATE TRIGGER "Article_search_update"
  BEFORE INSERT OR UPDATE OF "title", "summary", "aiSummary", "author", "content", "transcript" ON "Article"
  FOR EACH ROW EXECUTE FUNCTION reader_article_search();
