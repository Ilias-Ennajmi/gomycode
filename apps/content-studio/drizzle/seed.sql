-- Seed data for the brands catalog (ported from the legacy app's TIER1/TIER2/TIER3
-- constants and its default "Général" bucket). Run this once, after 0000_purple_karma.sql,
-- in the Supabase SQL Editor.
--
-- created_by is a placeholder ("system-seed") since these rows exist before any
-- Clerk user has signed in; it is plain text, not FK-constrained to the users table.

insert into brands (slug, name, tier, market_share_pct, is_catalog, created_by) values
  ('general', 'Général', null, null, true, 'system-seed'),
  ('adidas', 'Adidas', 'Tier 1', 36.3, true, 'system-seed'),
  ('puma', 'Puma', 'Tier 1', 30.5, true, 'system-seed'),
  ('new-balance', 'New Balance', 'Tier 1', 9.5, true, 'system-seed'),
  ('asics', 'Asics', 'Tier 1', 6.8, true, 'system-seed'),
  ('arena', 'Arena', 'Tier 2', 4.5, true, 'system-seed'),
  ('nox', 'Nox', 'Tier 2', 1.7, true, 'system-seed'),
  ('dunlop', 'Dunlop', 'Tier 2', 1.8, true, 'system-seed'),
  ('castelli', 'Castelli', 'Tier 2', 2.6, true, 'system-seed'),
  ('quiksilver', 'Quiksilver', 'Tier 3', 1.4, true, 'system-seed'),
  ('wilson', 'Wilson', 'Tier 3', 1.4, true, 'system-seed'),
  ('champion', 'Champion', 'Tier 3', 1.1, true, 'system-seed'),
  ('venum', 'Venum', 'Tier 3', 1.1, true, 'system-seed'),
  ('roxy', 'Roxy', 'Tier 3', 0.6, true, 'system-seed'),
  ('polar', 'Polar', 'Tier 3', 0.3, true, 'system-seed'),
  ('stiga', 'Stiga', 'Tier 3', 0.3, true, 'system-seed'),
  ('speedo', 'Speedo', 'Tier 3', 0.1, true, 'system-seed'),
  ('banana-moon', 'Banana Moon', 'Tier 3', 0.03, true, 'system-seed')
on conflict (slug) do nothing;
