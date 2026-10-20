-- Snips: a moment of an episode saved as a highlight.
ALTER TABLE "Highlight" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "Highlight" ADD COLUMN "title" TEXT;
ALTER TABLE "Highlight" ADD COLUMN "startSeconds" INTEGER;
ALTER TABLE "Highlight" ADD COLUMN "endSeconds" INTEGER;
