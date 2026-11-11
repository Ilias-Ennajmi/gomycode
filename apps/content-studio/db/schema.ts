import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const cardKindEnum = pgEnum("card_kind", ["Feed", "Story 1", "Story 2", "Story 3"]);
export const cardStatusEnum = pgEnum("card_status", ["Idée", "En préparation", "Prêt", "Publié"]);
export const contentTypeEnum = pgEnum("content_type", ["Photo", "Vidéo", "Carousel", "Reel", "Texte"]);
export const brandTierEnum = pgEnum("brand_tier", ["Tier 1", "Tier 2", "Tier 3", "Custom"]);
export const ideaPriorityEnum = pgEnum("idea_priority", ["Haute", "Moyenne", "Basse"]);
export const ideaTagTypeEnum = pgEnum("idea_tag_type", ["Produit", "Campagne", "Autre"]);
export const productionColumnEnum = pgEnum("production_column", ["todo", "inprogress", "ready"]);
export const influencerPlatformEnum = pgEnum("influencer_platform", [
  "Instagram",
  "TikTok",
  "YouTube",
  "Twitter/X",
  "Autre",
]);
export const influencerStatusEnum = pgEnum("influencer_status", [
  "Prospection",
  "Contacté",
  "Négociation",
  "Actif",
  "Terminé",
  "Refusé",
]);
export const calendarViewEnum = pgEnum("calendar_view", ["week", "month", "list"]);

// category and responsable are left as free varchar (app-validated via zod), not enums,
// since they're controlled vocabulary that's likely to grow without a migration.

// ---------- users (local Clerk mirror, kept in sync via a Clerk webhook) ----------
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id, e.g. "user_2abc..."
  email: varchar("email", { length: 320 }).notNull(),
  displayName: varchar("display_name", { length: 120 }),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- brands ----------
export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  tier: brandTierEnum("tier"),
  marketSharePct: numeric("market_share_pct", { precision: 4, scale: 1 }),
  isCatalog: boolean("is_catalog").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- campaigns ----------
export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  period: varchar("period", { length: 120 }).default(""),
  start: date("start"),
  end: date("end"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- campaign_items (independent per-campaign content checklist) ----------
export const campaignItems = pgTable("campaign_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  status: cardStatusEnum("status").notNull().default("Idée"),
  date: date("date"),
});

// ---------- ideas ----------
export const ideas = pgTable("ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  note: text("note").default(""),
  image: text("image"),
  link: text("link"),
  tagType: ideaTagTypeEnum("tag_type"),
  tagDetail: varchar("tag_detail", { length: 200 }).default(""),
  priority: ideaPriorityEnum("priority").notNull().default("Moyenne"),
  sentToProductionCardId: uuid("sent_to_production_card_id").references(
    (): any => productionCards.id,
    { onDelete: "set null" },
  ),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- production_cards ----------
export const productionCards = pgTable("production_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  column: productionColumnEnum("column").notNull().default("todo"),
  kind: cardKindEnum("kind").notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  format: varchar("format", { length: 120 }).default(""),
  cta: varchar("cta", { length: 120 }).default(""),
  contentType: contentTypeEnum("content_type").notNull(),
  responsable: varchar("responsable", { length: 60 }).notNull().default("À assigner"),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  dueDate: date("due_date"),
  fromIdeaId: uuid("from_idea_id").references(() => ideas.id, { onDelete: "set null" }),
  scheduledCardId: uuid("scheduled_card_id").references((): any => calendarCards.id, {
    onDelete: "set null",
  }),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- calendar_cards ----------
export const calendarCards = pgTable(
  "calendar_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: cardKindEnum("kind").notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    contentType: contentTypeEnum("content_type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    format: varchar("format", { length: 120 }).default(""),
    cta: varchar("cta", { length: 120 }).default(""),
    status: cardStatusEnum("status").notNull().default("Idée"),
    responsable: varchar("responsable", { length: 60 }).notNull().default("À assigner"),
    note: text("note").default(""),
    checklist: jsonb("checklist").$type<boolean[]>().default([false, false, false]),
    image: text("image"),
    link: text("link"),
    attentionDismissedAt: timestamp("attention_dismissed_at", { withTimezone: true }),
    fromIdea: boolean("from_idea").notNull().default(false),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_cards_brand_date_idx").on(t.brandId, t.date)],
);

// ---------- assets (Bibliothèque reference links) ----------
export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  url: text("url").notNull(),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- influencers ----------
export const influencers = pgTable("influencers", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  platform: influencerPlatformEnum("platform").notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  status: influencerStatusEnum("status").notNull().default("Prospection"),
  contact: varchar("contact", { length: 200 }).default(""),
  followers: varchar("followers", { length: 60 }).default(""),
  notes: text("notes").default(""),
  followUpDate: date("follow_up_date"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- user_prefs (per-teammate, replaces the old shared prefs blob) ----------
export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  dark: boolean("dark").notNull().default(false),
  tab: varchar("tab", { length: 30 }).notNull().default("calendar"),
  view: calendarViewEnum("view").notNull().default("week"),
  activeBrandId: uuid("active_brand_id").references(() => brands.id, { onDelete: "set null" }),
  attentionCollapsed: boolean("attention_collapsed").notNull().default(false),
  filterSearch: varchar("filter_search", { length: 200 }).default(""),
  filterStatus: varchar("filter_status", { length: 30 }).default(""),
  filterResp: varchar("filter_resp", { length: 60 }).default(""),
});

// ---------- relations ----------
export const usersRelations = relations(users, ({ one }) => ({
  prefs: one(userPrefs, { fields: [users.id], references: [userPrefs.userId] }),
}));

export const userPrefsRelations = relations(userPrefs, ({ one }) => ({
  user: one(users, { fields: [userPrefs.userId], references: [users.id] }),
  activeBrand: one(brands, { fields: [userPrefs.activeBrandId], references: [brands.id] }),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  calendarCards: many(calendarCards),
  productionCards: many(productionCards),
  assets: many(assets),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  items: many(campaignItems),
  calendarCards: many(calendarCards),
  productionCards: many(productionCards),
  influencers: many(influencers),
}));

export const campaignItemsRelations = relations(campaignItems, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignItems.campaignId], references: [campaigns.id] }),
}));

export const ideasRelations = relations(ideas, ({ one }) => ({
  sentToProductionCard: one(productionCards, {
    fields: [ideas.sentToProductionCardId],
    references: [productionCards.id],
  }),
}));

export const productionCardsRelations = relations(productionCards, ({ one }) => ({
  brand: one(brands, { fields: [productionCards.brandId], references: [brands.id] }),
  campaign: one(campaigns, { fields: [productionCards.campaignId], references: [campaigns.id] }),
  fromIdea: one(ideas, { fields: [productionCards.fromIdeaId], references: [ideas.id] }),
  scheduledCard: one(calendarCards, {
    fields: [productionCards.scheduledCardId],
    references: [calendarCards.id],
  }),
}));

export const calendarCardsRelations = relations(calendarCards, ({ one }) => ({
  brand: one(brands, { fields: [calendarCards.brandId], references: [brands.id] }),
  campaign: one(campaigns, { fields: [calendarCards.campaignId], references: [campaigns.id] }),
}));

export const assetsRelations = relations(assets, ({ one }) => ({
  brand: one(brands, { fields: [assets.brandId], references: [brands.id] }),
}));

export const influencersRelations = relations(influencers, ({ one }) => ({
  campaign: one(campaigns, { fields: [influencers.campaignId], references: [campaigns.id] }),
}));
