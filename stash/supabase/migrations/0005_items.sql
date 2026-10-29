-- =============================================================================
-- Stash · 0005 · Items (Phase 1 of the Albo-style rebuild)
--
--   * `items`: every app or tool, book, film, show, game, product, place, person
--     or other named thing in a save, with the moment it appears (at_s), how it
--     was found (said / on screen / caption) and a logo or cover.
--   * `item_entities`: the same thing across saves merged into one row
--     ("Notion · in 3 of your saves"), for the type lists on Home.
--   * `corrections`: what the owner fixed (moved a save, renamed, retyped or
--     removed an item). The worker shows the latest ones to the model, and
--     applies renames and removals directly to new saves.
--   * insights.format + insights.steps: tutorials get ordered steps with times.
--   * platform 'note': a written note saved from the + button.
-- Additive: safe to run more than once.
-- =============================================================================

alter type stash.platform add value if not exists 'note';

alter table stash.insights add column if not exists format text;
alter table stash.insights add column if not exists steps  jsonb not null default '[]'::jsonb;
comment on column stash.insights.format is 'tutorial | list | review | talk | story | other';
comment on column stash.insights.steps  is '[{ "text": "...", "at": seconds | null }] for tutorials';


-- -----------------------------------------------------------------------------
-- The key that merges the same thing across saves: kind + normalised name
-- -----------------------------------------------------------------------------
create or replace function stash.entity_key(p_kind text, p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_kind || ':' || pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(pg_catalog.lower(coalesce(p_name, '')), '[^[:alnum:]]+', ' ', 'g'),
      ' (app|ai app|application)$', ''))
$$;
comment on function stash.entity_key(text, text) is 'kind:normalised name, e.g. software:notion';


-- -----------------------------------------------------------------------------
-- items
-- -----------------------------------------------------------------------------
create table if not exists stash.items (
  id          uuid primary key default gen_random_uuid(),
  save_id     uuid not null references stash.saves (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('software', 'book', 'film', 'show', 'game', 'product',
                                            'place', 'person', 'music', 'other')),
  name        text not null check (char_length(name) between 1 and 160),
  what        text,            -- one line: what it is / why it's in the video
  creator     text,            -- author, director, developer, brand, artist
  year        int,
  price       text,
  address     text,            -- places: text only (no map)
  link        text,            -- official site or store page
  image_url   text,            -- logo, icon or cover (public https)
  at_s        numeric,         -- seconds into the video where it appears
  evidence    text check (evidence in ('said', 'on_screen', 'caption', 'title')),
  quote       text,            -- the words or screen text it was found in
  entity_key  text not null default '',
  position    int not null default 0,
  hidden      boolean not null default false,  -- removed by the owner (kept so a reprocess doesn't bring it back)
  edited      boolean not null default false,  -- renamed or retyped by the owner
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table stash.items is 'Named things found in a save (apps, books, films, products, places…).';

create index if not exists items_save_id_idx    on stash.items (save_id, position);
create index if not exists items_user_kind_idx  on stash.items (user_id, kind, entity_key) where not hidden;
create index if not exists items_name_trgm_idx  on stash.items using gin (name extensions.gin_trgm_ops);

alter table stash.items enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'stash' and tablename = 'items' and policyname = 'owner_all') then
    create policy "owner_all" on stash.items for all to authenticated
      using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end;
$$;
grant select, insert, update, delete on stash.items to authenticated;
grant all on stash.items to service_role;


-- -----------------------------------------------------------------------------
-- corrections: the owner's fixes, read back by the worker
-- -----------------------------------------------------------------------------
create table if not exists stash.corrections (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  save_id     uuid references stash.saves (id) on delete set null,
  kind        text not null check (kind in ('space', 'item')),
  before      jsonb not null default '{}'::jsonb,
  after       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
comment on table stash.corrections is 'What the owner fixed; the worker learns from the latest ones.';
create index if not exists corrections_user_idx on stash.corrections (user_id, created_at desc);

alter table stash.corrections enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'stash' and tablename = 'corrections' and policyname = 'owner_read') then
    create policy "owner_read" on stash.corrections for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end;
$$;
grant select on stash.corrections to authenticated;  -- no write policy: written by triggers only
grant all on stash.corrections to service_role;


-- -----------------------------------------------------------------------------
-- items: keep entity_key in step; the phone may change only name, kind, hidden
-- -----------------------------------------------------------------------------
create or replace function stash.items_before_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and coalesce(auth.role(), '') = 'authenticated' then
    new.save_id    := old.save_id;
    new.user_id    := old.user_id;
    new.at_s       := old.at_s;
    new.evidence   := old.evidence;
    new.quote      := old.quote;
    new.position   := old.position;
    new.created_at := old.created_at;
    if new.name is distinct from old.name or new.kind is distinct from old.kind then
      new.edited := true;
    end if;
  end if;
  new.name       := pg_catalog.btrim(new.name);
  new.entity_key := stash.entity_key(new.kind, new.name);
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create or replace trigger items_before_write
  before insert or update on stash.items
  for each row execute function stash.items_before_write();


create or replace function stash.items_log_correction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;  -- the worker's own writes aren't corrections
  end if;
  if new.name is distinct from old.name or new.kind is distinct from old.kind or new.hidden is distinct from old.hidden then
    insert into stash.corrections (user_id, save_id, kind, before, after)
    values (old.user_id, old.save_id, 'item',
            jsonb_build_object('name', old.name, 'kind', old.kind, 'key', old.entity_key),
            jsonb_build_object('name', new.name, 'kind', new.kind, 'removed', new.hidden));
  end if;
  return new;
end;
$$;

create or replace trigger items_log_correction
  after update on stash.items
  for each row execute function stash.items_log_correction();


-- -----------------------------------------------------------------------------
-- saves: the owner moving a save to another Space is a correction too
-- -----------------------------------------------------------------------------
create or replace function stash.saves_log_space_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_tags  text[];
begin
  if coalesce(auth.role(), '') <> 'authenticated' or new.space_id is not distinct from old.space_id then
    return new;
  end if;
  select i.title, i.tags into v_title, v_tags from stash.insights i where i.save_id = new.id;
  insert into stash.corrections (user_id, save_id, kind, before, after)
  values (new.user_id, new.id, 'space',
          jsonb_build_object('space', (select s.name from stash.spaces s where s.id = old.space_id),
                             'title', coalesce(v_title, new.title), 'tags', to_jsonb(coalesce(v_tags, '{}'))),
          jsonb_build_object('space', (select s.name from stash.spaces s where s.id = new.space_id)));
  return new;
end;
$$;

create or replace trigger saves_log_space_move
  after update of space_id on stash.saves
  for each row execute function stash.saves_log_space_move();


-- -----------------------------------------------------------------------------
-- item_entities: one row per thing, merged across saves (RLS of items applies)
-- -----------------------------------------------------------------------------
create or replace view stash.item_entities
with (security_invoker = true)
as
select
  i.user_id,
  i.kind,
  i.entity_key,
  (array_agg(i.name      order by s.saved_at desc))[1]                                  as name,
  (array_agg(i.what      order by s.saved_at desc) filter (where i.what is not null))[1] as what,
  (array_agg(i.creator   order by s.saved_at desc) filter (where i.creator is not null))[1] as creator,
  (array_agg(i.image_url order by s.saved_at desc) filter (where i.image_url is not null))[1] as image_url,
  (array_agg(i.link      order by s.saved_at desc) filter (where i.link is not null))[1] as link,
  count(distinct i.save_id)::int                                                         as save_count,
  max(s.saved_at)                                                                        as last_saved_at
from stash.items i
join stash.saves s on s.id = i.save_id
where not i.hidden
group by i.user_id, i.kind, i.entity_key;
comment on view stash.item_entities is 'Items merged across saves: name, logo, how many saves mention it.';
grant select on stash.item_entities to authenticated, service_role;
