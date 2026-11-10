-- Highlight exports: where each highlight has been sent, so nothing goes twice.
ALTER TABLE "Highlight" ADD COLUMN "exportedTo" TEXT[] DEFAULT ARRAY[]::TEXT[];
