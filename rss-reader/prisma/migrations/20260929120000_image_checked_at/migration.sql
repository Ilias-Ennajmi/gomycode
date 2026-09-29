-- When a picture was last looked for on an article's page (lib/maintenance.ts).
ALTER TABLE "Article" ADD COLUMN "imageCheckedAt" TIMESTAMP(3);
