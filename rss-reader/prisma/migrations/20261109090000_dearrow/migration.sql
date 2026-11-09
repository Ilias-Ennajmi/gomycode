-- DeArrow: clickbait-free YouTube titles from the community, the original kept.
ALTER TABLE "Article" ADD COLUMN "altTitle" TEXT;
ALTER TABLE "Article" ADD COLUMN "originalTitle" TEXT;
ALTER TABLE "Article" ADD COLUMN "brandingAt" TIMESTAMP(3);
