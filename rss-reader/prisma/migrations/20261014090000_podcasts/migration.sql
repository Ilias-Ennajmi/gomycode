-- Podcasts: a feed type, and the audio file of each episode.
ALTER TYPE "FeedType" ADD VALUE IF NOT EXISTS 'podcast';

ALTER TABLE "Article" ADD COLUMN "audioUrl" TEXT,
ADD COLUMN "audioType" TEXT;
