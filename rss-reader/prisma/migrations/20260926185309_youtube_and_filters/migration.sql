-- CreateEnum
CREATE TYPE "FeedType" AS ENUM ('rss', 'youtube', 'newsletter');

-- CreateEnum
CREATE TYPE "FilterAction" AS ENUM ('hide', 'boost');

-- CreateEnum
CREATE TYPE "FilterMatch" AS ENUM ('keyword', 'feed');

-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "isVideo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Feed" ADD COLUMN     "type" "FeedType" NOT NULL DEFAULT 'rss';

-- CreateTable
CREATE TABLE "FilterRule" (
    "id" TEXT NOT NULL,
    "action" "FilterAction" NOT NULL,
    "match" "FilterMatch" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilterRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilterRule_action_match_value_key" ON "FilterRule"("action", "match", "value");
