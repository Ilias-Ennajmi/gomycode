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

-- Starter campaign catalog, ported from the legacy app's CAMPAIGN_SEED
-- (auto-inserted there whenever the campaigns list was empty). Guarded so
-- re-running this file is a no-op once any campaign exists (there's no
-- unique constraint on campaigns.name to key an ON CONFLICT off of).
insert into campaigns (name, period, start, "end", created_by)
select * from (values
  ('Coupe du Monde 2026', '11 juin – 19 juillet', '2026-06-11'::date, '2026-07-19'::date, 'system-seed'),
  ('Summer Sales', '3 juillet – 17 août', '2026-07-03'::date, '2026-08-17'::date, 'system-seed'),
  ('Back to School', '28 août – 14 septembre', '2026-08-28'::date, '2026-09-14'::date, 'system-seed'),
  ('Reprise Botola', 'Fin août – septembre', '2026-08-24'::date, '2026-09-30'::date, 'system-seed'),
  ('Black Friday', 'Fin novembre', '2026-11-27'::date, '2026-11-30'::date, 'system-seed'),
  ('Collection Hiver', 'Décembre – janvier', '2026-12-01'::date, '2027-01-15'::date, 'system-seed'),
  ('Nouvel An / Nouveaux Objectifs', 'Fin décembre – début janvier', '2026-12-26'::date, '2027-01-10'::date, 'system-seed')
) as seed(name, period, start, "end", created_by)
where not exists (select 1 from campaigns);
