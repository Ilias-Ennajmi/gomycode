CREATE TYPE "public"."brand_tier" AS ENUM('Tier 1', 'Tier 2', 'Tier 3', 'Custom');--> statement-breakpoint
CREATE TYPE "public"."calendar_view" AS ENUM('week', 'month', 'list');--> statement-breakpoint
CREATE TYPE "public"."card_kind" AS ENUM('Feed', 'Story 1', 'Story 2', 'Story 3');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('Idée', 'En préparation', 'Prêt', 'Publié');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('Photo', 'Vidéo', 'Carousel', 'Reel', 'Texte');--> statement-breakpoint
CREATE TYPE "public"."idea_priority" AS ENUM('Haute', 'Moyenne', 'Basse');--> statement-breakpoint
CREATE TYPE "public"."idea_tag_type" AS ENUM('Produit', 'Campagne', 'Autre');--> statement-breakpoint
CREATE TYPE "public"."influencer_platform" AS ENUM('Instagram', 'TikTok', 'YouTube', 'Twitter/X', 'Autre');--> statement-breakpoint
CREATE TYPE "public"."influencer_status" AS ENUM('Prospection', 'Contacté', 'Négociation', 'Actif', 'Terminé', 'Refusé');--> statement-breakpoint
CREATE TYPE "public"."production_column" AS ENUM('todo', 'inprogress', 'ready');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"brand_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"tier" "brand_tier",
	"market_share_pct" numeric(4, 1),
	"is_catalog" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "calendar_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "card_kind" NOT NULL,
	"category" varchar(60) NOT NULL,
	"content_type" "content_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"format" varchar(120) DEFAULT '',
	"cta" varchar(120) DEFAULT '',
	"status" "card_status" DEFAULT 'Idée' NOT NULL,
	"responsable" varchar(60) DEFAULT 'À assigner' NOT NULL,
	"note" text DEFAULT '',
	"checklist" jsonb DEFAULT '[false,false,false]'::jsonb,
	"image" text,
	"link" text,
	"attention_dismissed_at" timestamp with time zone,
	"from_idea" boolean DEFAULT false NOT NULL,
	"campaign_id" uuid,
	"due_date" date,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" "card_status" DEFAULT 'Idée' NOT NULL,
	"date" date
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"period" varchar(120) DEFAULT '',
	"start" date,
	"end" date,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"note" text DEFAULT '',
	"image" text,
	"link" text,
	"tag_type" "idea_tag_type",
	"tag_detail" varchar(200) DEFAULT '',
	"priority" "idea_priority" DEFAULT 'Moyenne' NOT NULL,
	"sent_to_production_card_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influencers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"platform" "influencer_platform" NOT NULL,
	"category" varchar(60) NOT NULL,
	"campaign_id" uuid,
	"status" "influencer_status" DEFAULT 'Prospection' NOT NULL,
	"contact" varchar(200) DEFAULT '',
	"followers" varchar(60) DEFAULT '',
	"notes" text DEFAULT '',
	"follow_up_date" date,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"column" "production_column" DEFAULT 'todo' NOT NULL,
	"kind" "card_kind" NOT NULL,
	"category" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"brand_id" uuid,
	"format" varchar(120) DEFAULT '',
	"cta" varchar(120) DEFAULT '',
	"content_type" "content_type" NOT NULL,
	"responsable" varchar(60) DEFAULT 'À assigner' NOT NULL,
	"campaign_id" uuid,
	"due_date" date,
	"from_idea_id" uuid,
	"scheduled_card_id" uuid,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"dark" boolean DEFAULT false NOT NULL,
	"tab" varchar(30) DEFAULT 'calendar' NOT NULL,
	"view" "calendar_view" DEFAULT 'week' NOT NULL,
	"active_brand_id" uuid,
	"attention_collapsed" boolean DEFAULT false NOT NULL,
	"filter_search" varchar(200) DEFAULT '',
	"filter_status" varchar(30) DEFAULT '',
	"filter_resp" varchar(60) DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(120),
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_cards" ADD CONSTRAINT "calendar_cards_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_cards" ADD CONSTRAINT "calendar_cards_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_items" ADD CONSTRAINT "campaign_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_sent_to_production_card_id_production_cards_id_fk" FOREIGN KEY ("sent_to_production_card_id") REFERENCES "public"."production_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencers" ADD CONSTRAINT "influencers_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_cards" ADD CONSTRAINT "production_cards_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_cards" ADD CONSTRAINT "production_cards_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_cards" ADD CONSTRAINT "production_cards_from_idea_id_ideas_id_fk" FOREIGN KEY ("from_idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_cards" ADD CONSTRAINT "production_cards_scheduled_card_id_calendar_cards_id_fk" FOREIGN KEY ("scheduled_card_id") REFERENCES "public"."calendar_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_active_brand_id_brands_id_fk" FOREIGN KEY ("active_brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_cards_brand_date_idx" ON "calendar_cards" USING btree ("brand_id","date");