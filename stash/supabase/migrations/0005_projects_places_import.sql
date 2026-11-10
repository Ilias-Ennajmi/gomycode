-- =============================================================================
-- Stash · 0005 · projects, places, import (Phase 3)
--
--   * exports: a status the phone can follow live (Realtime), and a trigger that
--     queues an `export` job for the worker. Collection links need no worker:
--     the slug is minted here and the row is ready at once.
--   * Private Storage bucket `stash-exports`, one folder per user.
--   * Public, read-only collection pages without a service key:
--     stash.get_collection(slug) returns only share-safe fields, and a Storage
--     policy lets anyone read the thumbnails of saves inside a shared
--     collection (and nothing else).
--   * places: geocoded_at (the worker geocodes names with OpenStreetMap) and
--     stash.nearby_places(lat, lng) ordered by distance.
--   * imports: history of Instagram / TikTok data-export imports.
--   * Backlog triage: settings.triage_daily_limit and states.triage_seen_at.
--   * usage.kind gains 'export' (brief / deck text written by the smart model).
--   * Function privileges for the whole schema, explicit per function (end of
--     file): the phone's role reaches only the RPCs the app calls.
--
-- Written to run after 0004 (Phase 2) and to be re-runnable.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;  -- gen_random_bytes for share slugs


-- -----------------------------------------------------------------------------
-- exports: status, error, files, updated_at
-- -----------------------------------------------------------------------------
alter table stash.exports add column if not exists status     text not null default 'queued';
alter table stash.exports add column if not exists error      text;
alter table stash.exports add column if not exists files      jsonb not null default '{}'::jsonb;  -- {"pdf": path, "docx": path}
alter table stash.exports add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exports_status_check'
                  and conrelid = 'stash.exports'::regclass) then
    alter table stash.exports add constraint exports_status_check
      check (status in ('queued', 'running', 'ready', 'failed'));
  end if;
end
$$;

comment on column stash.exports.status is 'queued → running → ready | failed. The phone follows it through Realtime.';
comment on column stash.exports.files  is 'Every file the job wrote, by extension (a brief has pdf + docx). file_path is the main one.';

drop trigger if exists set_updated_at on stash.exports;
create trigger set_updated_at before update on stash.exports
  for each row execute function stash.set_updated_at();




-- The phone chooses the Space, kind and options; everything else comes from the
-- worker (or from this trigger), so a client can't pick its own slug or point
-- file_path at someone else's file.
create or replace function stash.guard_export_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then
      new.file_path  := null;
      new.files      := '{}'::jsonb;
      new.share_slug := null;
      new.error      := null;
      new.status     := 'queued';
    else
      new.file_path  := old.file_path;
      new.files      := old.files;
      new.share_slug := old.share_slug;
      new.error      := old.error;
      new.status     := old.status;
      new.kind       := old.kind;
      new.space_id   := old.space_id;
    end if;
  end if;

  -- A collection is just a link: mint it now, no job needed.
  if tg_op = 'INSERT' and new.kind = 'collection'::stash.export_kind then
    -- An unguessable link id: 12 random bytes → 16 URL-safe characters. Inlined (not a helper
    -- function) because this trigger runs as the phone's role, which may execute no stash helpers.
    new.share_slug := coalesce(new.share_slug,
      pg_catalog.translate(pg_catalog.encode(extensions.gen_random_bytes(12), 'base64'), '+/=', '-_'));
    new.status     := 'ready';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_export_columns on stash.exports;
create trigger guard_export_columns
  before insert or update on stash.exports
  for each row execute function stash.guard_export_columns();


-- New export (brief / moodboard / deck) → an `export` job. The worker checks the
-- owner (OWNER_USER_IDS) and the monthly budget, exactly like ingest.
create or replace function stash.on_export_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'queued' then
    insert into stash.jobs (space_id, user_id, type, payload)
    values (new.space_id, new.user_id, 'export'::stash.job_type,
            pg_catalog.jsonb_build_object('export_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists on_export_created on stash.exports;
create trigger on_export_created
  after insert on stash.exports
  for each row execute function stash.on_export_created();

-- Old files are cleaned up with the export row.
create or replace function stash.on_export_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := old.user_id::text || '/';
  v_path   text;
begin
  for v_path in
    select distinct p from (
      select old.file_path as p
      union all
      select value from pg_catalog.jsonb_each_text(coalesce(old.files, '{}'::jsonb))
    ) x where p is not null
  loop
    if pg_catalog.starts_with(v_path, v_prefix) then
      insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-exports', v_path);
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists on_export_deleted on stash.exports;
create trigger on_export_deleted
  after delete on stash.exports
  for each row execute function stash.on_export_deleted();


-- -----------------------------------------------------------------------------
-- usage.kind: add 'export' while keeping whatever earlier migrations allowed
-- -----------------------------------------------------------------------------
do $$
declare
  v_con   text;
  v_def   text;
  v_kinds text[];
begin
  select c.conname, pg_catalog.pg_get_constraintdef(c.oid)
    into v_con, v_def
    from pg_constraint c
   where c.conrelid = 'stash.usage'::regclass and c.contype = 'c'
     and pg_catalog.pg_get_constraintdef(c.oid) like '%kind%'
   limit 1;

  if v_def is null then
    v_kinds := array['transcribe', 'understand', 'embed', 'synthesize', 'search'];
  elsif v_def like '%''export''%' then
    return;  -- already allowed
  else
    select array_agg(m[1]) into v_kinds
      from regexp_matches(v_def, '''([a-z_]+)''', 'g') as m;
    execute format('alter table stash.usage drop constraint %I', v_con);
  end if;

  v_kinds := array_append(v_kinds, 'export');
  execute format('alter table stash.usage add constraint usage_kind_check check (kind = any (%L::text[]))', v_kinds);
end
$$;


-- -----------------------------------------------------------------------------
-- Storage: private exports bucket, one folder per user (<user_id>/<export_id>.<ext>)
-- The worker uploads with service_role; the phone may read and delete its own.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stash-exports', 'stash-exports', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
on conflict (id) do nothing;

drop policy if exists "stash_exports_own_read" on storage.objects;
create policy "stash_exports_own_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'stash-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "stash_exports_own_delete" on storage.objects;
create policy "stash_exports_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'stash-exports' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- -----------------------------------------------------------------------------
-- Public collection link (/c/<slug>), read-only, no service key.
--
-- Which saves a collection shows: the Space's saves that aren't archived, and
-- with options.only_applied_kept only the applied or kept ones.
-- -----------------------------------------------------------------------------
create or replace function stash.collection_save_ids(p_slug text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
    from stash.exports e
    join stash.saves s   on s.space_id = e.space_id and s.user_id = e.user_id
    left join stash.states st on st.save_id = s.id
   where e.kind = 'collection'::stash.export_kind
     and e.share_slug is not null
     and e.share_slug = p_slug
     and pg_catalog.length(p_slug) >= 12
     and st.archived_at is null
     and (coalesce((e.options->>'only_applied_kept')::boolean, false) = false
          or st.applied_at is not null or coalesce(st.kept, false));
$$;

comment on function stash.collection_save_ids(text) is
  'Saves shown by a shared collection link. Internal helper; not callable through the API.';

revoke execute on function stash.collection_save_ids(text) from public, anon, authenticated;


create or replace function stash.get_collection(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'name',        sp.name,
           'color',       sp.color_token,
           'kind',        sp.kind,
           'description', sp.description,
           'created_at',  e.created_at,
           'saves', coalesce((
             select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                      'id',         s.id,
                      'title',      coalesce(i.title, s.title),
                      'key_idea',   i.key_idea,
                      'takeaways',  coalesce(i.takeaways, '[]'::jsonb),
                      'creator',    s.creator_handle,
                      'platform',   s.platform,
                      'source_url', s.source_url,
                      'thumb_path', s.thumb_path,
                      'applied',    st.applied_at is not null
                    ) order by (st.applied_at is not null) desc, s.saved_at desc)
               from stash.saves s
               left join stash.insights i on i.save_id = s.id
               left join stash.states  st on st.save_id = s.id
              where s.id in (select stash.collection_save_ids(p_slug))
           ), '[]'::jsonb)
         )
    from stash.exports e
    join stash.spaces sp on sp.id = e.space_id
   where e.kind = 'collection'::stash.export_kind
     and e.share_slug is not null
     and e.share_slug = p_slug
     and pg_catalog.length(p_slug) >= 12
     and not sp.archived
   limit 1;
$$;

comment on function stash.get_collection(text) is
  'Public read-only view of a shared collection: Space name/colour/description and, per save, '
  'title, key idea, takeaways, creator, platform, link and thumbnail path. Null when the slug is unknown.';


-- Thumbnails of saves inside a shared collection are readable by anyone who
-- has the link (the page signs short-lived URLs with the public key).
create or replace function stash.is_shared_thumb(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from stash.exports e
      join stash.saves s on s.space_id = e.space_id and s.user_id = e.user_id
     where e.kind = 'collection'::stash.export_kind
       and e.share_slug is not null
       and s.thumb_path = p_name
       and s.id in (select stash.collection_save_ids(e.share_slug))
  );
$$;

drop policy if exists "stash_shared_thumbs_read" on storage.objects;
create policy "stash_shared_thumbs_read" on storage.objects
  for select to anon
  using (bucket_id = 'stash-thumbs' and stash.is_shared_thumb(name));




-- -----------------------------------------------------------------------------
-- places: geocoding + nearby
-- -----------------------------------------------------------------------------
alter table stash.places add column if not exists geocoded_at timestamptz;
comment on column stash.places.geocoded_at is 'When the worker last tried to geocode this name (set even when nothing was found).';

create index if not exists places_user_geo_idx on stash.places (user_id) where lat is not null and lng is not null;

-- Haversine distance in metres from (p_lat, p_lng) to each of the caller's places.
create or replace function stash.nearby_places(
  p_lat   double precision,
  p_lng   double precision,
  p_limit int default 50
)
returns table (
  id         uuid,
  save_id    uuid,
  name       text,
  lat        double precision,
  lng        double precision,
  address    text,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.save_id, p.name, p.lat, p.lng, p.address,
         (2 * 6371000 * asin(sqrt(
            power(sin(radians(p.lat - p_lat) / 2), 2)
            + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - p_lng) / 2), 2)
         )))::double precision as distance_m
    from stash.places p
   where p.lat is not null and p.lng is not null
   order by distance_m
   limit greatest(1, least(p_limit, 500));
$$;



-- -----------------------------------------------------------------------------
-- imports: history of data-export imports
-- -----------------------------------------------------------------------------
create table if not exists stash.imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source     text not null check (source in ('instagram', 'tiktok')),
  file_name  text,
  total      int not null default 0 check (total >= 0),   -- links found in the file
  queued     int not null default 0 check (queued >= 0),  -- new links sent to the outbox (the rest were already saved)
  created_at timestamptz not null default now()
);

comment on table stash.imports is 'One row per Instagram / TikTok data-export import.';

create index if not exists imports_user_created_idx on stash.imports (user_id, created_at desc);

alter table stash.imports enable row level security;
drop policy if exists "owner_all" on stash.imports;
create policy "owner_all" on stash.imports
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on stash.imports to authenticated;
grant all on stash.imports to service_role;
revoke all on stash.imports from anon;


-- -----------------------------------------------------------------------------
-- Backlog triage
-- -----------------------------------------------------------------------------
alter table stash.settings add column if not exists triage_daily_limit int not null default 20;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_triage_daily_limit_check'
                  and conrelid = 'stash.settings'::regclass) then
    alter table stash.settings add constraint settings_triage_daily_limit_check
      check (triage_daily_limit between 0 and 200);
  end if;
end
$$;

alter table stash.states add column if not exists triage_seen_at timestamptz;
comment on column stash.states.triage_seen_at is 'Last time backlog triage showed this save (Let go or Keep).';


-- -----------------------------------------------------------------------------
-- Realtime: the export sheet follows its row until the file is ready
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'stash' and tablename = 'exports') then
    alter publication supabase_realtime add table stash.exports;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Function privileges for the whole schema (0001-0005), explicit per function.
--
-- Postgres lets PUBLIC execute every new function, and "alter default privileges
-- in schema … revoke … from public" can't undo that global default, so every
-- function created after 0004's revoke (and every one here) was executable by
-- anyone. Anonymous devices ARE role `authenticated`, so `authenticated` must
-- only reach what the app calls. This block runs last and leaves exactly:
--
--   authenticated: search_saves, related_saves, request_reprocess, mark_queue_done,
--                  save_push_subscription, vapid_public_key, nearby_places
--   anon:          vapid_public_key, cron_* (each checks the Vault secret),
--                  get_collection, is_shared_thumb (public collection page)
--   service_role:  everything (the worker; it bypasses RLS anyway)
--   nobody else:   wake_worker, claim_jobs, sweep, cron_ok, call_app,
--                  maybe_synthesize, collection_save_ids, guard and trigger
--                  functions (triggers fire without EXECUTE on their function).
--
-- Any later migration that adds a function must grant it here-style, explicitly.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema stash from public, anon, authenticated;
grant  execute on all functions in schema stash to service_role;

grant execute on function stash.search_saves(text, uuid, extensions.vector, int)               to authenticated;
grant execute on function stash.related_saves(uuid, int)                                       to authenticated;
grant execute on function stash.request_reprocess(uuid)                                        to authenticated;
grant execute on function stash.mark_queue_done(date, uuid)                                    to authenticated;
grant execute on function stash.save_push_subscription(text, text, text, text)                 to authenticated;
grant execute on function stash.vapid_public_key()                                             to authenticated, anon;
grant execute on function stash.nearby_places(double precision, double precision, int)         to authenticated;

grant execute on function stash.cron_vapid(text)                                               to anon;
grant execute on function stash.cron_set_vapid(text, text, text)                               to anon;
grant execute on function stash.cron_due_reminders(text)                                       to anon;
grant execute on function stash.cron_mark_fired(text, uuid[])                                  to anon;
grant execute on function stash.cron_drop_subscriptions(text, text[])                          to anon;
grant execute on function stash.cron_daily_candidates(text)                                    to anon;
grant execute on function stash.cron_store_daily(text, uuid, date, uuid[], int)                to anon;
grant execute on function stash.get_collection(text)                                           to anon;
grant execute on function stash.is_shared_thumb(text)                                          to anon;

-- anon sees the schema (for those RPCs) but no table or sequence in it.
grant usage on schema stash to anon;
revoke all on all tables    in schema stash from anon;
revoke all on all sequences in schema stash from anon;

notify pgrst, 'reload schema';
