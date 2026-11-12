-- =============================================================================
-- Atelier · 0002 · Phase 2 (moodboard power)
--
-- Adds, on top of 0001 (never edit 0001; migrations are append-only):
--   * atelier.inbox_items      the "Unsorted" inbox (phone share sheet, quick capture)
--   * assets.title / analysis_version / hidden, and kind 'gif'
--   * asset_usages             one row per (asset, board), index on board_id
--   * atelier.hamming()        bit distance of two perceptual hashes
--   * atelier.similar_assets() near-duplicate lookup, RLS-filtered to the caller
--
-- Conventions are those of 0001: RLS on, one `owner_all` policy, `anon` gets nothing,
-- functions set `search_path = ''`, every foreign key is covered by an index that starts
-- with it, and the file is re-runnable (if not exists / drop + create).
--
-- NOT applied automatically: applying it to Supabase is the owner's deploy step.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- assets: analysis columns, kind 'gif'
-- -----------------------------------------------------------------------------
alter table atelier.assets add column if not exists title text;
alter table atelier.assets add column if not exists analysis_version smallint not null default 0;
alter table atelier.assets add column if not exists hidden boolean not null default false;

-- title is capped like board titles.
alter table atelier.assets drop constraint if exists assets_title_check;
alter table atelier.assets add constraint assets_title_check
  check (title is null or char_length(title) <= 300);

-- 0 = no palette / perceptual hash yet, 1 = Phase 2 analysis done.
alter table atelier.assets drop constraint if exists assets_analysis_version_check;
alter table atelier.assets add constraint assets_analysis_version_check
  check (analysis_version >= 0);

-- Animated images are stored as kind 'gif' (0001 only allowed image / video / file).
alter table atelier.assets drop constraint if exists assets_kind_check;
alter table atelier.assets add constraint assets_kind_check
  check (kind in ('image', 'video', 'gif', 'file'));


-- -----------------------------------------------------------------------------
-- asset_usages: one row per (asset, board), and the board_id index
-- -----------------------------------------------------------------------------
-- 0001's primary key already is (asset_id, board_id); only add a unique index when nothing
-- unique covers exactly those two columns (e.g. someone dropped the key by hand).
do $$
begin
  if not exists (
    select 1
      from pg_index i
     where i.indrelid = 'atelier.asset_usages'::regclass
       and i.indisunique
       and i.indnatts = 2
       and i.indkey::int2[] @> array[
             (select attnum from pg_attribute where attrelid = 'atelier.asset_usages'::regclass and attname = 'asset_id'),
             (select attnum from pg_attribute where attrelid = 'atelier.asset_usages'::regclass and attname = 'board_id')]
  ) then
    create unique index asset_usages_asset_board_key on atelier.asset_usages (asset_id, board_id);
  end if;
end
$$;
create index if not exists asset_usages_board_idx on atelier.asset_usages (board_id);


-- -----------------------------------------------------------------------------
-- inbox_items
-- -----------------------------------------------------------------------------
create table if not exists atelier.inbox_items (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('image', 'video', 'url', 'text')),
  -- An image / video row cannot outlive its asset (the CHECK below needs asset_id), so deleting
  -- the asset removes the row instead of failing with a CHECK violation.
  asset_id    uuid references atelier.assets (id) on delete cascade,
  url         text check (url is null or char_length(url) <= 2048),
  text_body   text check (text_body is null or char_length(text_body) <= 10000),
  title       text check (title is null or char_length(title) <= 300),
  source_url  text check (source_url is null or char_length(source_url) <= 2048),
  credit      text check (credit is null or char_length(credit) <= 500),
  created_at  timestamptz not null default now(),
  placed_at   timestamptz,
  constraint inbox_items_payload_check check (
       (kind in ('image', 'video') and asset_id is not null)
    or (kind = 'url'  and url is not null)
    or (kind = 'text' and text_body is not null)
  )
);
create index if not exists inbox_items_owner_idx on atelier.inbox_items (owner_id, placed_at, created_at desc);
create index if not exists inbox_items_asset_idx on atelier.inbox_items (asset_id);

alter table atelier.inbox_items enable row level security;

-- Owner only; an attached asset must be the owner's too (a foreign key alone would only prove the id exists).
drop policy if exists owner_all on atelier.inbox_items;
create policy owner_all on atelier.inbox_items
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (
    atelier.is_owner(owner_id)
    and (asset_id is null or atelier.owns_asset(asset_id))
  );

revoke all on atelier.inbox_items from public, anon;
grant select, insert, update, delete on atelier.inbox_items to authenticated;
grant all on atelier.inbox_items to service_role;


-- -----------------------------------------------------------------------------
-- Perceptual-hash helpers
-- -----------------------------------------------------------------------------

-- Number of differing bits between two 16-hex-character (64-bit) hashes; 64 (the maximum, "nothing
-- alike") when either is null or not exactly 16 hex characters, so bad data never looks similar.
create or replace function atelier.hamming(a text, b text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when a is null or b is null
      or a !~ '^[0-9a-fA-F]{16}$' or b !~ '^[0-9a-fA-F]{16}$' then 64
    else pg_catalog.bit_count(('x' || a)::pg_catalog.bit(64) operator(pg_catalog.#) ('x' || b)::pg_catalog.bit(64))::integer
  end
$$;

-- The caller's own visible assets whose hash is within `max_dist` bits of `h`, nearest first.
-- SECURITY INVOKER: assets' RLS limits it to the caller's rows, so nobody sees another owner's hashes.
create or replace function atelier.similar_assets(h text, max_dist integer default 6)
returns table (id uuid, phash text, dist integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.phash, atelier.hamming(a.phash, h) as dist
    from atelier.assets a
   where not a.hidden
     and a.phash is not null
     and atelier.hamming(a.phash, h) <= max_dist
   order by dist, a.id
$$;

revoke all on function atelier.hamming(text, text)                from public, anon;
revoke all on function atelier.similar_assets(text, integer)      from public, anon;
grant execute on function atelier.hamming(text, text), atelier.similar_assets(text, integer)
  to authenticated, service_role;
