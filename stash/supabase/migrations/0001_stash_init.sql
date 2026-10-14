-- =============================================================================
-- Stash · 0001 · initial schema
--
-- Creates the `stash` schema with every table from docs/SPEC.md ("Data model"),
-- plus the job queue used by the processing pipeline and the per-user
-- `settings` row used by Settings -> Appearance.
--
-- Conventions
--   * Every table carries user_id (default auth.uid()) and is protected by RLS
--     with a single "owner_all" policy for the `authenticated` role.
--   * `anon` gets nothing in this schema. The worker uses `service_role`
--     (which bypasses RLS).
--   * Every function sets `search_path = ''` and uses fully-qualified names
--     (Supabase security advisor: function_search_path_mutable).
--   * Every FK column and every user_id is covered by an index whose leading
--     column is that column (Supabase performance advisor: unindexed_foreign_keys).
--   * Written to be re-runnable where reasonable (if not exists / drop+create).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create schema if not exists extensions;

create extension if not exists vector  with schema extensions;  -- embeddings
create extension if not exists pg_trgm with schema extensions;  -- fuzzy transcript search
create extension if not exists pg_net with schema extensions;                        -- HTTP calls from SQL (worker wake-ups)
create extension if not exists pg_cron;                         -- scheduled jobs (syntheses, reminders)


-- -----------------------------------------------------------------------------
-- Schema and base privileges
-- -----------------------------------------------------------------------------
create schema if not exists stash;

revoke all   on schema stash from public;
revoke all   on schema stash from anon;
grant  usage on schema stash to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Enums (guarded so the migration can be re-run)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'space_kind') then
    create type stash.space_kind as enum ('topic', 'project', 'inbox');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'platform') then
    create type stash.platform as enum ('instagram', 'tiktok', 'youtube', 'web', 'screenshot');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'save_status') then
    create type stash.save_status as enum ('queued', 'processing', 'ready', 'failed', 'dead_link');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'intent') then
    create type stash.intent as enum ('learn', 'try', 'visit', 'buy', 'inspire', 'fun');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'reminder_kind') then
    create type stash.reminder_kind as enum ('time', 'place', 'context');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'job_type') then
    create type stash.job_type as enum ('ingest', 'reprocess', 'synthesize', 'export');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'job_state') then
    create type stash.job_state as enum ('queued', 'running', 'done', 'failed');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'export_kind') then
    create type stash.export_kind as enum ('brief', 'moodboard', 'deck', 'collection');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'stash' and t.typname = 'theme_pref') then
    create type stash.theme_pref as enum ('system', 'dark', 'light', 'black');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function stash.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function stash.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at with now().';


-- =============================================================================
-- Tables
-- =============================================================================

-- -----------------------------------------------------------------------------
-- spaces: topics and projects; exactly one Inbox per user
-- -----------------------------------------------------------------------------
create table if not exists stash.spaces (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  kind        stash.space_kind not null default 'topic',
  color_token text not null default 'violet'
              check (color_token in ('violet', 'teal', 'amber', 'blue', 'rose',
                                     'green', 'cyan', 'sand', 'inbox')),
  icon        text,
  due_date    date,
  sort_order  int not null default 0,
  archived    boolean not null default false,
  description text,
  created_at  timestamptz not null default now()
);

comment on table stash.spaces is 'Topics and projects. One Inbox (kind = inbox) per user.';

-- One Inbox per user.
create unique index if not exists spaces_one_inbox_per_user
  on stash.spaces (user_id) where kind = 'inbox';
-- user_id lookup / FK index (the partial index above does not cover all rows).
create index if not exists spaces_user_sort_idx
  on stash.spaces (user_id, sort_order);


-- -----------------------------------------------------------------------------
-- saves: one saved item
-- -----------------------------------------------------------------------------
create table if not exists stash.saves (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id       uuid,  -- id generated offline on the phone (IndexedDB) for idempotent sync
  source_url      text not null,
  platform        stash.platform not null,
  space_id        uuid references stash.spaces (id) on delete set null,
  status          stash.save_status not null default 'queued',
  video_path      text,
  thumb_path      text,
  duration_s      numeric,
  creator_handle  text,
  caption         text,
  saved_at        timestamptz not null default now(),
  user_note       text,
  voice_note_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint saves_user_client_uniq unique (user_id, client_id)
);

comment on table  stash.saves is 'One saved item (video, page or screenshot).';
comment on column stash.saves.client_id is 'Client-generated id; unique per user so offline retries do not duplicate rows.';

create index if not exists saves_user_saved_at_idx on stash.saves (user_id, saved_at desc);
create index if not exists saves_space_id_idx      on stash.saves (space_id);
create index if not exists saves_status_idx        on stash.saves (status);


-- -----------------------------------------------------------------------------
-- insights: the AI's reading of a save (1:1 with saves)
-- -----------------------------------------------------------------------------
create table if not exists stash.insights (
  save_id            uuid primary key references stash.saves (id) on delete cascade,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title              text,
  key_idea           text,
  takeaways          jsonb not null default '[]'::jsonb,
  actions            jsonb not null default '[]'::jsonb,
  intent             stash.intent,
  tags               text[] not null default '{}',
  language           text,
  suggested_space_id uuid references stash.spaces (id) on delete set null,
  confidence         numeric check (confidence >= 0 and confidence <= 1),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table stash.insights is 'Structured AI reading of a save: key idea, takeaways, actions, intent, tags.';

create index if not exists insights_user_id_idx            on stash.insights (user_id);
create index if not exists insights_suggested_space_id_idx on stash.insights (suggested_space_id);


-- -----------------------------------------------------------------------------
-- transcripts: timestamped segments + full-text and trigram search
-- -----------------------------------------------------------------------------
create table if not exists stash.transcripts (
  save_id    uuid primary key references stash.saves (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  segments   jsonb not null default '[]'::jsonb,  -- [{ "start": s, "end": s, "text": "..." }]
  full_text  text not null default '',
  tsv        tsvector generated always as
               (to_tsvector('simple'::regconfig, coalesce(full_text, ''))) stored,
  created_at timestamptz not null default now()
);

comment on table stash.transcripts is 'Searchable, tappable transcript. segments = [{start, end, text}].';

create index if not exists transcripts_user_id_idx    on stash.transcripts (user_id);
create index if not exists transcripts_tsv_idx        on stash.transcripts using gin (tsv);
create index if not exists transcripts_full_text_trgm on stash.transcripts
  using gin (full_text extensions.gin_trgm_ops);


-- -----------------------------------------------------------------------------
-- embeddings: one vector per save for semantic search / related saves
-- -----------------------------------------------------------------------------
create table if not exists stash.embeddings (
  save_id    uuid primary key references stash.saves (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vector     extensions.vector(1024) not null,
  model      text not null,
  created_at timestamptz not null default now()
);

comment on table stash.embeddings is 'Embedding of title + key idea + transcript (1024 dims).';

create index if not exists embeddings_user_id_idx on stash.embeddings (user_id);
create index if not exists embeddings_vector_hnsw on stash.embeddings
  using hnsw (vector extensions.vector_cosine_ops);


-- -----------------------------------------------------------------------------
-- places: named venues mentioned in a save (Map pins)
-- -----------------------------------------------------------------------------
create table if not exists stash.places (
  id            uuid primary key default gen_random_uuid(),
  save_id       uuid not null references stash.saves (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name          text not null,
  lat           double precision,
  lng           double precision,
  address       text,
  maps_place_id text,
  created_at    timestamptz not null default now()
);

comment on table stash.places is 'Real, named venues extracted from a save.';

create index if not exists places_save_id_idx on stash.places (save_id);
create index if not exists places_user_id_idx on stash.places (user_id);


-- -----------------------------------------------------------------------------
-- states: where a save sits in the loop (1:1 with saves)
-- -----------------------------------------------------------------------------
create table if not exists stash.states (
  save_id       uuid primary key references stash.saves (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  watched_at    timestamptz,
  kept          boolean not null default false,
  archived_at   timestamptz,
  applied_at    timestamptz,
  skip_count    int not null default 0,
  last_shown_at timestamptz,
  created_at    timestamptz not null default now()
);

comment on table stash.states is 'Loop state of a save: watched, kept, archived, applied, skipped.';

create index if not exists states_user_id_idx on stash.states (user_id);


-- -----------------------------------------------------------------------------
-- cards: spaced-repetition recall cards (SM-2)
-- -----------------------------------------------------------------------------
create table if not exists stash.cards (
  id            uuid primary key default gen_random_uuid(),
  save_id       uuid not null references stash.saves (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prompt        text not null,
  answer        text not null,
  ease          numeric not null default 2.5,
  interval_days int not null default 0,
  repetitions   int not null default 0,
  due_at        timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on table stash.cards is 'SM-2 recall cards generated from a save.';

create index if not exists cards_user_due_idx on stash.cards (user_id, due_at);
create index if not exists cards_save_id_idx  on stash.cards (save_id);


-- -----------------------------------------------------------------------------
-- reviews: recall history
-- -----------------------------------------------------------------------------
create table if not exists stash.reviews (
  id                uuid primary key default gen_random_uuid(),
  card_id           uuid not null references stash.cards (id) on delete cascade,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  answered_at       timestamptz not null default now(),
  grade             smallint check (grade between 0 and 5),
  voice_answer_text text,
  created_at        timestamptz not null default now()
);

comment on table stash.reviews is 'One answer to a recall card (SM-2 grade 0..5).';

create index if not exists reviews_card_id_idx on stash.reviews (card_id);
create index if not exists reviews_user_id_idx on stash.reviews (user_id, answered_at desc);


-- -----------------------------------------------------------------------------
-- syntheses: cross-save summaries for a Space (space_id) or a tag (space_id null)
-- -----------------------------------------------------------------------------
create table if not exists stash.syntheses (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid references stash.spaces (id) on delete cascade,  -- null for tag syntheses
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic            text,
  points           jsonb not null default '[]'::jsonb,
  disagreements    jsonb not null default '[]'::jsonb,
  suggested_action text,
  source_save_ids  uuid[] not null default '{}',
  created_at       timestamptz not null default now()
);

comment on table stash.syntheses is 'Cross-save summary: agreements, disagreements (with save ids), one action.';

create index if not exists syntheses_space_id_idx on stash.syntheses (space_id);
create index if not exists syntheses_user_id_idx  on stash.syntheses (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- reminders: "remind me later" (time, place or context)
-- -----------------------------------------------------------------------------
create table if not exists stash.reminders (
  id         uuid primary key default gen_random_uuid(),
  save_id    uuid not null references stash.saves (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       stash.reminder_kind not null,
  fire_at    timestamptz,
  geofence   jsonb,
  fired      boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table stash.reminders is 'Remind-me-later entries; geofence used when kind = place.';

create index if not exists reminders_user_fired_fire_at_idx on stash.reminders (user_id, fired, fire_at);
create index if not exists reminders_save_id_idx            on stash.reminders (save_id);


-- -----------------------------------------------------------------------------
-- jobs: worker queue (ingest / reprocess / synthesize / export)
-- -----------------------------------------------------------------------------
create table if not exists stash.jobs (
  id         uuid primary key default gen_random_uuid(),
  save_id    uuid references stash.saves (id) on delete cascade,   -- null for synthesize/export
  space_id   uuid references stash.spaces (id) on delete cascade,  -- set for synthesize/export
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type       stash.job_type not null,
  state      stash.job_state not null default 'queued',
  attempts   int not null default 0,
  error      text,
  locked_at  timestamptz,
  run_after  timestamptz not null default now(),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table stash.jobs is 'Worker queue. Claimed by the worker (service_role) ordered by run_after.';

create index if not exists jobs_state_run_after_idx on stash.jobs (state, run_after);
create index if not exists jobs_save_id_idx         on stash.jobs (save_id);
create index if not exists jobs_space_id_idx        on stash.jobs (space_id);
create index if not exists jobs_user_id_idx         on stash.jobs (user_id);


-- -----------------------------------------------------------------------------
-- exports: brief / moodboard / deck / collection outputs for a Space
-- -----------------------------------------------------------------------------
create table if not exists stash.exports (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references stash.spaces (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       stash.export_kind not null,
  options    jsonb not null default '{}'::jsonb,
  file_path  text,
  share_slug text unique,
  created_at timestamptz not null default now()
);

comment on table stash.exports is 'Generated export files; share_slug enables a public share link (served by the worker).';

create index if not exists exports_space_id_idx on stash.exports (space_id);
create index if not exists exports_user_id_idx  on stash.exports (user_id);


-- -----------------------------------------------------------------------------
-- settings: one row per user (Appearance, queue, budget, quiet hours)
-- -----------------------------------------------------------------------------
create table if not exists stash.settings (
  user_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  theme              stash.theme_pref not null default 'system',
  accent             text not null default 'lime'
                     check (accent in ('lime', 'coral', 'sky', 'gold', 'mono', 'custom')),
  accent_custom      text
                     check (accent_custom is null or accent_custom ~ '^#[0-9A-Fa-f]{6}$'),
  text_scale         numeric not null default 1.0 check (text_scale between 0.9 and 1.3),
  density            smallint not null default 2 check (density in (2, 3)),
  reduce_motion      boolean not null default false,
  haptics            boolean not null default true,
  monthly_budget_usd numeric not null default 5,
  queue_time         time not null default '08:00',
  queue_minutes      int not null default 6,
  quiet_hours        jsonb not null default '{"start":"22:00","end":"08:00"}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table stash.settings is 'Per-user preferences, mirrored in localStorage so they follow the user to a new phone.';
-- user_id is the PK, so no extra index is needed.


-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
drop trigger if exists set_updated_at on stash.saves;
create trigger set_updated_at before update on stash.saves
  for each row execute function stash.set_updated_at();

drop trigger if exists set_updated_at on stash.insights;
create trigger set_updated_at before update on stash.insights
  for each row execute function stash.set_updated_at();

drop trigger if exists set_updated_at on stash.jobs;
create trigger set_updated_at before update on stash.jobs
  for each row execute function stash.set_updated_at();

drop trigger if exists set_updated_at on stash.settings;
create trigger set_updated_at before update on stash.settings
  for each row execute function stash.set_updated_at();


-- =============================================================================
-- Row-level security: owner-only access for `authenticated`
-- (select auth.uid()) is evaluated once per statement, not once per row
-- (Supabase performance advisor: auth_rls_initplan).
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'spaces', 'saves', 'insights', 'transcripts', 'embeddings', 'places',
    'states', 'cards', 'reviews', 'syntheses', 'reminders', 'jobs',
    'exports', 'settings'
  ]
  loop
    execute format('alter table stash.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on stash.%I', t);
    execute format(
      'create policy "owner_all" on stash.%I '
      'for all to authenticated '
      'using ((select auth.uid()) = user_id) '
      'with check ((select auth.uid()) = user_id)', t);
  end loop;
end
$$;


-- =============================================================================
-- Grants
-- =============================================================================
revoke all on all tables    in schema stash from anon;
revoke all on all sequences in schema stash from anon;
revoke all on all functions in schema stash from anon;

grant select, insert, update, delete on all tables in schema stash to authenticated;
grant all                            on all tables in schema stash to service_role;

-- No sequences today (uuid PKs), but keep future serial/identity columns usable.
grant usage, select on all sequences in schema stash to authenticated, service_role;

-- Objects created later in this schema (by the migration role) inherit the same grants.
alter default privileges in schema stash
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema stash
  grant all on tables to service_role;
alter default privileges in schema stash
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema stash
  revoke all on tables from anon;
alter default privileges in schema stash
  revoke all on sequences from anon;


-- =============================================================================
-- Realtime: the phone listens to saves/insights/jobs so the shimmer turns into
-- the key idea as soon as processing finishes. RLS applies to Realtime too.
-- =============================================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['saves', 'insights', 'jobs']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'stash' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table stash.%I', t);
      end if;
    end loop;
  end if;
end
$$;


-- =============================================================================
-- Expose `stash` through the Data API (PostgREST)
--
-- Dashboard alternative: Project Settings -> Data API -> "Exposed schemas",
-- add `stash`. On hosted projects the dashboard setting is the source of truth
-- and may overwrite this role setting, so also set it there. Locally, the
-- equivalent is `schemas = ["public", "graphql_public", "stash"]` under [api]
-- in supabase/config.toml.
-- =============================================================================
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, stash';
notify pgrst, 'reload config';
