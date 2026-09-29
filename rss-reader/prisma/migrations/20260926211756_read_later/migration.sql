-- AlterEnum
ALTER TYPE "FeedType" ADD VALUE 'manual';

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "readProgress" INTEGER NOT NULL DEFAULT 0;
