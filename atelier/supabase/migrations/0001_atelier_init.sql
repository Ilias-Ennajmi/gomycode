-- =============================================================================
-- Atelier · 0001 · initial schema
--
-- Creates the `atelier` schema with the Phase 1 tables from docs/SPEC.md §4:
-- folders, boards, board_updates, board_snapshots, assets, asset_usages, error_log.
-- (Share links, review rounds, comments etc. arrive with Phase 3.)
--
-- Conventions
--   * RLS is enabled on every table. The `authenticated` role gets one `owner_all`
--     policy per table; `anon` gets nothing. Server routes that must act for visitors
--     or run maintenance use `service_role` (bypasses RLS).
--   * Ownership = atelier.is_owner(owner_id): the JWT subject must equal the row's
--     owner, and Supabase anonymous sign-ins (Stash uses them in the same project)
--     never count. The app additionally rejects every user but ATELIER_OWNER_ID
--     (proxy.ts and requireOwner); RLS repeats the per-row check.
--   * Child tables (board_updates, board_snapshots, asset_usages) have no owner column:
--     their policies go through the owning board.
--   * Cross-links are owner-checked too: a board cannot be filed in someone else's folder,
--     nor point at someone else's asset (foreign keys alone would only prove the id exists).
--   * Every function sets `search_path = ''` and uses qualified names.
--   * Every foreign key column is covered by an index that starts with it.
--   * Re-runnable: create ... if not exists / drop policy if exists + create.
--
-- NOT applied automatically. Applying this to Supabase and exposing the `atelier`
-- schema in the Data API is the owner's deploy step (Phase 1, Task 23).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Schema and base privileges
-- -----------------------------------------------------------------------------
create schema if not exists atelier;

revoke all   on schema atelier from public;
revoke all   on schema atelier from anon;
grant  usage on schema atelier to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

-- True when the signed-in user owns the row. Anonymous sign-ins never own anything.
create or replace function atelier.is_owner(row_owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select row_owner is not null
     and row_owner = (select auth.uid())
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
$$;

-- Ownership of a related row (folder / asset / board). SECURITY DEFINER so the lookup is not itself
-- filtered by RLS: a policy on `folders` that selected from `folders` would recurse forever.
-- (plpgsql, so they can be created before the tables exist.) They only ever answer "does the current user own this id", which reveals nothing else.
create or replace function atelier.owns_folder(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from atelier.folders f where f.id = target and atelier.is_owner(f.owner_id));
end
$$;

create or replace function atelier.owns_asset(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from atelier.assets a where a.id = target and atelier.is_owner(a.owner_id));
end
$$;

create or replace function atelier.owns_board(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from atelier.boards b where b.id = target and atelier.is_owner(b.owner_id));
end
$$;

-- Keeps updated_at honest without the client having to send it.
create or replace function atelier.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

revoke all on function atelier.is_owner(uuid)      from public;
revoke all on function atelier.owns_folder(uuid)   from public;
revoke all on function atelier.owns_asset(uuid)    from public;
revoke all on function atelier.owns_board(uuid)    from public;
revoke all on function atelier.touch_updated_at()  from public;
grant execute on function atelier.is_owner(uuid), atelier.owns_folder(uuid),
                          atelier.owns_asset(uuid), atelier.owns_board(uuid)
  to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table if not exists atelier.folders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  parent_id   uuid references atelier.folders (id) on delete cascade,
  sort        double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists folders_owner_idx  on atelier.folders (owner_id, parent_id);
create index if not exists folders_parent_idx on atelier.folders (parent_id);

create table if not exists atelier.assets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('image', 'video', 'file')),
  mime        text not null,
  width       integer check (width is null or width > 0),
  height      integer check (height is null or height > 0),
  bytes       bigint check (bytes is null or bytes >= 0),
  variants    jsonb not null default '{}'::jsonb,   -- {thumb, medium, original...} -> object keys
  palette     jsonb not null default '[]'::jsonb,   -- dominant colours
  phash       text,                                  -- perceptual hash for duplicate detection
  source_url  text,
  credit      text,
  licence     text,
  captured_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists assets_owner_phash_idx on atelier.assets (owner_id, phash);

create table if not exists atelier.boards (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id           uuid references atelier.folders (id) on delete set null,
  title               text not null default 'Untitled' check (char_length(title) <= 300),
  starred             boolean not null default false,
  thumbnail_asset_id  uuid references atelier.assets (id) on delete set null,
  -- Up to four asset ids shown as the board's preview tile on the home screen.
  preview             jsonb not null default '[]'::jsonb
                      check (jsonb_typeof(preview) = 'array' and jsonb_array_length(preview) <= 4),
  last_opened_at      timestamptz,
  deleted_at          timestamptz,                   -- trash; purged after 30 days
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists boards_owner_deleted_idx on atelier.boards (owner_id, deleted_at);
create index if not exists boards_folder_idx        on atelier.boards (folder_id);
create index if not exists boards_thumbnail_idx     on atelier.boards (thumbnail_asset_id);

-- Yjs updates, append-only per board; seq gives a total order for catch-up reads.
create table if not exists atelier.board_updates (
  board_id    uuid not null references atelier.boards (id) on delete cascade,
  seq         bigserial,
  update      bytea not null,
  device_id   text not null,
  created_at  timestamptz not null default now(),
  primary key (board_id, seq)
);

create table if not exists atelier.board_snapshots (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references atelier.boards (id) on delete cascade,
  state       bytea not null,
  upto_seq    bigint not null,
  kind        text not null check (kind in ('compaction', 'round')),
  label       text,
  created_at  timestamptz not null default now()
);
create index if not exists board_snapshots_board_idx on atelier.board_snapshots (board_id, upto_seq);

create table if not exists atelier.asset_usages (
  asset_id    uuid not null references atelier.assets (id) on delete cascade,
  board_id    uuid not null references atelier.boards (id) on delete cascade,
  primary key (asset_id, board_id)
);
create index if not exists asset_usages_board_idx on atelier.asset_usages (board_id);

-- Client and server errors worth keeping. owner_id is null for rows written by the server
-- with no signed-in user (service role only).
create table if not exists atelier.error_log (
  id          bigserial primary key,
  owner_id    uuid default auth.uid() references auth.users (id) on delete set null,
  area        text not null,
  message     text not null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists error_log_owner_idx on atelier.error_log (owner_id, created_at desc);


-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
drop trigger if exists folders_touch on atelier.folders;
create trigger folders_touch before update on atelier.folders
  for each row execute function atelier.touch_updated_at();

drop trigger if exists boards_touch on atelier.boards;
create trigger boards_touch before update on atelier.boards
  for each row execute function atelier.touch_updated_at();


-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table atelier.folders         enable row level security;
alter table atelier.assets          enable row level security;
alter table atelier.boards          enable row level security;
alter table atelier.board_updates   enable row level security;
alter table atelier.board_snapshots enable row level security;
alter table atelier.asset_usages    enable row level security;
alter table atelier.error_log       enable row level security;

-- Tables with their own owner column.
drop policy if exists owner_all on atelier.error_log;
create policy owner_all on atelier.error_log
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (atelier.is_owner(owner_id));

drop policy if exists owner_all on atelier.assets;
create policy owner_all on atelier.assets
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (atelier.is_owner(owner_id));

-- A folder's parent must be the owner's too.
drop policy if exists owner_all on atelier.folders;
create policy owner_all on atelier.folders
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (
    atelier.is_owner(owner_id)
    and (parent_id is null or atelier.owns_folder(parent_id))
  );

-- A board's folder and thumbnail asset must be the owner's too.
drop policy if exists owner_all on atelier.boards;
create policy owner_all on atelier.boards
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (
    atelier.is_owner(owner_id)
    and (folder_id is null or atelier.owns_folder(folder_id))
    and (thumbnail_asset_id is null or atelier.owns_asset(thumbnail_asset_id))
  );

-- Child tables: ownership comes from the board.
drop policy if exists owner_all on atelier.board_updates;
create policy owner_all on atelier.board_updates
  for all to authenticated
  using (atelier.owns_board(board_id))
  with check (atelier.owns_board(board_id));

drop policy if exists owner_all on atelier.board_snapshots;
create policy owner_all on atelier.board_snapshots
  for all to authenticated
  using (atelier.owns_board(board_id))
  with check (atelier.owns_board(board_id));

-- A usage links the owner's board to the owner's asset.
drop policy if exists owner_all on atelier.asset_usages;
create policy owner_all on atelier.asset_usages
  for all to authenticated
  using (atelier.owns_board(board_id))
  with check (atelier.owns_board(board_id) and atelier.owns_asset(asset_id));


-- -----------------------------------------------------------------------------
-- Table privileges: authenticated is limited by the policies above; anon gets nothing.
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema atelier from public, anon;
revoke all on all sequences in schema atelier from public, anon;

grant select, insert, update, delete on all tables in schema atelier to authenticated;
grant usage, select on all sequences in schema atelier to authenticated;

-- service_role bypasses RLS but still needs table privileges in a new schema.
grant all on all tables    in schema atelier to service_role;
grant all on all sequences in schema atelier to service_role;
