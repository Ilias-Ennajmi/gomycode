-- =============================================================================
-- Atelier · 0003 · Phase 3 (present & share)
--
-- Adds, on top of 0001 and 0002 (migrations are append-only; never edit them):
--   * atelier.rounds               published rounds: one frozen snapshot + preview images + diff
--   * atelier.share_links          no-account review links (token stored as SHA-256 only)
--   * atelier.visitors             cookie-identified reviewers of one link
--   * atelier.reactions            pick / reject / more-like-this per visitor and object
--   * atelier.comments             owner and visitor comments, optionally pinned
--   * atelier.approvals            "approve this direction" per visitor and frame
--   * atelier.link_views           per-link analytics (when, who, time per frame)
--   * atelier.push_subscriptions   owner web-push endpoints
--   * atelier.owner_notifications  the in-app inbox behind the push notifications
--   * atelier.share_auth_attempts  durable password-attempt counters (per link and IP hash)
--   * board_snapshots (id, board_id) unique, so a round can only point at a snapshot of its own board
--
-- Security model (docs/SPEC.md section 4 and 5)
--   * Visitors have NO database role. They never read or write these tables directly:
--     every visitor action runs in a server route with the service role, after the link guard.
--     So there is no policy for anon, and no policy that lets a visitor-data row be inserted or
--     changed by `authenticated` either.
--   * The owner (authenticated, atelier.is_owner) gets:
--       - owner_all      on rounds, share_links, push_subscriptions, owner_notifications
--       - select/delete  on visitors, reactions, approvals, link_views, share_auth_attempts
--                        (rows the owner's links produced; the owner can never fabricate a
--                        visitor, a vote or an approval)
--       - select/insert/update/delete on comments, but an owner can only INSERT author_kind = 'owner'
--   * Ownership of every child row goes through the board or the share link (SECURITY DEFINER helpers
--     that only answer "does the current user own this id").
--   * Cross-links are enforced by the database where they can be, as composite foreign keys: a round
--     belongs to its board's snapshot, a link's round belongs to the link's board, a reaction's visitor
--     belongs to the reaction's link, a reply lives on its parent's board.
--   * Every function sets `search_path = ''`; every foreign key column is covered by an index that
--     starts with it; the file is re-runnable (if not exists / drop + create).
--
-- NOT applied automatically: applying it to Supabase is the owner's deploy step.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- board_snapshots: `id` is already the uuid primary key (0001), so this is a no-op kept for the record.
-- (id, board_id) must be unique for rounds' composite foreign key.
-- -----------------------------------------------------------------------------
alter table atelier.board_snapshots add column if not exists id uuid not null default gen_random_uuid();
create unique index if not exists board_snapshots_id_board_key on atelier.board_snapshots (id, board_id);


-- -----------------------------------------------------------------------------
-- rounds
-- -----------------------------------------------------------------------------
create table if not exists atelier.rounds (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references atelier.boards (id) on delete cascade,
  number        integer not null check (number >= 1),
  label         text check (label is null or length(label) <= 120),
  snapshot_id   uuid not null,
  previews      jsonb not null default '{}'::jsonb check (jsonb_typeof(previews) = 'object'),
  diff          jsonb not null default '{}'::jsonb check (jsonb_typeof(diff) = 'object'),
  published_at  timestamptz not null default now(),
  unique (board_id, number),
  unique (id, board_id),
  -- The snapshot must be one of THIS board's (a bare reference to board_snapshots(id) would accept any board's).
  foreign key (snapshot_id, board_id) references atelier.board_snapshots (id, board_id)
);
create index if not exists rounds_snapshot_idx on atelier.rounds (snapshot_id, board_id);


-- -----------------------------------------------------------------------------
-- share_links
-- -----------------------------------------------------------------------------
create table if not exists atelier.share_links (
  id              uuid primary key default gen_random_uuid(),
  board_id        uuid not null references atelier.boards (id) on delete cascade,
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text check (name is null or length(name) <= 80),
  token_hash      text not null unique,                    -- SHA-256 hex of the token; the token itself is never stored
  mode            text not null check (mode in ('round', 'live')),
  round_id        uuid,
  scope           text not null check (scope in ('board', 'frames')),
  frame_ids       text[] not null default '{}',
  permission      text not null check (permission in ('view', 'react', 'comment')),
  password_hash   text,                                    -- argon2id (PHC string), null = no password
  expires_at      timestamptz,
  welcome_note    text check (welcome_note is null or length(welcome_note) <= 1000),
  allow_download  boolean not null default false,
  watermark       boolean not null default false,
  show_credits    boolean not null default false,
  blind_votes     boolean not null default false,
  votes_revealed  boolean not null default false,
  cookie_epoch    integer not null default 0,              -- bump to invalidate every visitor cookie of this link
  created_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  constraint share_links_frames_check check (
    cardinality(frame_ids) <= 100
    and (scope <> 'frames' or cardinality(frame_ids) between 1 and 100)
  ),
  constraint share_links_round_check check (mode <> 'round' or round_id is not null),
  -- A link's round belongs to the link's board.
  foreign key (round_id, board_id) references atelier.rounds (id, board_id)
);
create index if not exists share_links_board_idx on atelier.share_links (board_id, created_at desc);
create index if not exists share_links_owner_idx on atelier.share_links (owner_id);
create index if not exists share_links_round_idx on atelier.share_links (round_id, board_id);


-- -----------------------------------------------------------------------------
-- Ownership helper for rows that hang off a share link (SECURITY DEFINER: the lookup must not be
-- filtered by share_links' own RLS; it only answers "does the current user own this link id").
-- -----------------------------------------------------------------------------
create or replace function atelier.owns_share_link(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from atelier.share_links l where l.id = target and atelier.is_owner(l.owner_id));
end
$$;

revoke all on function atelier.owns_share_link(uuid) from public, anon;
grant execute on function atelier.owns_share_link(uuid) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- visitors
-- -----------------------------------------------------------------------------
create table if not exists atelier.visitors (
  id             uuid primary key default gen_random_uuid(),
  share_link_id  uuid not null references atelier.share_links (id) on delete cascade,
  display_name   text check (display_name is null or length(display_name) <= 60),
  ip_hash        text,                                      -- HMAC of the IP: abuse caps only, never shown
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  last_round_id  uuid references atelier.rounds (id) on delete set null,
  unique (id, share_link_id)
);
create index if not exists visitors_link_ip_idx    on atelier.visitors (share_link_id, ip_hash, created_at);
create index if not exists visitors_last_round_idx on atelier.visitors (last_round_id);


-- -----------------------------------------------------------------------------
-- reactions
-- -----------------------------------------------------------------------------
create table if not exists atelier.reactions (
  id             uuid primary key default gen_random_uuid(),
  share_link_id  uuid not null references atelier.share_links (id) on delete cascade,
  visitor_id     uuid not null,
  round_id       uuid references atelier.rounds (id) on delete cascade,
  object_id      text not null check (char_length(object_id) between 1 and 100),
  kind           text not null check (kind in ('pick', 'reject', 'more')),
  created_at     timestamptz not null default now(),
  unique nulls not distinct (visitor_id, object_id, kind, round_id),
  -- The visitor belongs to the reaction's link.
  foreign key (visitor_id, share_link_id) references atelier.visitors (id, share_link_id) on delete cascade
);
create index if not exists reactions_link_idx  on atelier.reactions (share_link_id, created_at);
create index if not exists reactions_round_idx on atelier.reactions (round_id);


-- -----------------------------------------------------------------------------
-- comments
-- -----------------------------------------------------------------------------
create table if not exists atelier.comments (
  id             uuid primary key default gen_random_uuid(),
  board_id       uuid not null references atelier.boards (id) on delete cascade,
  share_link_id  uuid references atelier.share_links (id) on delete set null,
  -- A visitor's comments go with the visitor (so with their link when the owner deletes it; revoking a link keeps them).
  visitor_id     uuid references atelier.visitors (id) on delete cascade,
  author_kind    text not null check (author_kind in ('owner', 'visitor')),
  object_id      text check (object_id is null or char_length(object_id) between 1 and 100),
  frame_id       text check (frame_id is null or char_length(frame_id) between 1 and 100),
  pin_space      text check (pin_space is null or pin_space in ('object', 'canvas')),
  pin_x          double precision check (pin_x is null or pin_x between -1e7 and 1e7),   -- NaN / infinity fail the BETWEEN
  pin_y          double precision check (pin_y is null or pin_y between -1e7 and 1e7),
  round_id       uuid references atelier.rounds (id) on delete set null,
  -- 1..2,000 characters with at least one non-whitespace one (btrim alone only strips spaces, not newlines or tabs).
  body           text not null check (char_length(body) <= 2000 and body ~ '\S'),
  parent_id      uuid,
  resolved_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (id, board_id),
  constraint comments_visitor_check check (author_kind <> 'visitor' or visitor_id is not null),
  constraint comments_pin_check check ((pin_x is null) = (pin_y is null)),
  -- A reply lives on its parent's board.
  foreign key (parent_id, board_id) references atelier.comments (id, board_id) on delete cascade
);
create index if not exists comments_board_idx   on atelier.comments (board_id, created_at);
create index if not exists comments_link_idx    on atelier.comments (share_link_id, created_at);
create index if not exists comments_visitor_idx on atelier.comments (visitor_id);
create index if not exists comments_round_idx   on atelier.comments (round_id);
create index if not exists comments_parent_idx  on atelier.comments (parent_id, board_id);


-- -----------------------------------------------------------------------------
-- approvals
-- -----------------------------------------------------------------------------
create table if not exists atelier.approvals (
  id             uuid primary key default gen_random_uuid(),
  share_link_id  uuid not null references atelier.share_links (id) on delete cascade,
  visitor_id     uuid not null,
  frame_id       text not null check (char_length(frame_id) between 1 and 100),
  round_id       uuid references atelier.rounds (id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique nulls not distinct (visitor_id, frame_id, round_id),
  foreign key (visitor_id, share_link_id) references atelier.visitors (id, share_link_id) on delete cascade
);
create index if not exists approvals_link_idx  on atelier.approvals (share_link_id, created_at);
create index if not exists approvals_round_idx on atelier.approvals (round_id);


-- -----------------------------------------------------------------------------
-- link_views
-- -----------------------------------------------------------------------------
create table if not exists atelier.link_views (
  id             bigserial primary key,
  share_link_id  uuid not null references atelier.share_links (id) on delete cascade,
  visitor_id     uuid,
  frame_id       text check (frame_id is null or char_length(frame_id) <= 100),
  started_at     timestamptz not null default now(),
  duration_ms    integer check (duration_ms is null or duration_ms between 0 and 600000),
  foreign key (visitor_id, share_link_id) references atelier.visitors (id, share_link_id) on delete cascade
);
create index if not exists link_views_link_idx    on atelier.link_views (share_link_id, started_at);
create index if not exists link_views_visitor_idx on atelier.link_views (visitor_id);


-- -----------------------------------------------------------------------------
-- push_subscriptions, owner_notifications
-- -----------------------------------------------------------------------------
create table if not exists atelier.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint         text not null unique check (endpoint like 'https://%' and length(endpoint) <= 2048),
  p256dh           text not null check (length(p256dh) <= 512),
  auth             text not null check (length(auth) <= 512),
  user_agent       text check (user_agent is null or length(user_agent) <= 500),
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failed_count     integer not null default 0 check (failed_count >= 0)
);
create index if not exists push_subscriptions_owner_idx on atelier.push_subscriptions (owner_id);

create table if not exists atelier.owner_notifications (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind           text not null check (kind in ('comment', 'approval', 'reaction')),
  board_id       uuid not null references atelier.boards (id) on delete cascade,
  share_link_id  uuid references atelier.share_links (id) on delete cascade,
  ref_id         uuid,
  summary        text not null default '' check (length(summary) <= 200),
  created_at     timestamptz not null default now(),
  read_at        timestamptz,
  pushed_at      timestamptz
);
create index if not exists owner_notifications_owner_idx on atelier.owner_notifications (owner_id, created_at desc);
create index if not exists owner_notifications_board_idx on atelier.owner_notifications (board_id);
create index if not exists owner_notifications_link_idx  on atelier.owner_notifications (share_link_id);


-- -----------------------------------------------------------------------------
-- share_auth_attempts (password backoff that survives cold starts)
-- -----------------------------------------------------------------------------
create table if not exists atelier.share_auth_attempts (
  share_link_id  uuid not null references atelier.share_links (id) on delete cascade,
  ip_hash        text not null,
  fails          integer not null default 0 check (fails >= 0),
  locked_until   timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (share_link_id, ip_hash)
);


-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------
alter table atelier.rounds               enable row level security;
alter table atelier.share_links          enable row level security;
alter table atelier.visitors             enable row level security;
alter table atelier.reactions            enable row level security;
alter table atelier.comments             enable row level security;
alter table atelier.approvals            enable row level security;
alter table atelier.link_views           enable row level security;
alter table atelier.push_subscriptions   enable row level security;
alter table atelier.owner_notifications  enable row level security;
alter table atelier.share_auth_attempts  enable row level security;

-- Owner tables ---------------------------------------------------------------

drop policy if exists owner_all on atelier.rounds;
create policy owner_all on atelier.rounds
  for all to authenticated
  using (atelier.owns_board(board_id))
  with check (atelier.owns_board(board_id));

-- A link is the owner's, on the owner's board.
drop policy if exists owner_all on atelier.share_links;
create policy owner_all on atelier.share_links
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (atelier.is_owner(owner_id) and atelier.owns_board(board_id));

drop policy if exists owner_all on atelier.push_subscriptions;
create policy owner_all on atelier.push_subscriptions
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (atelier.is_owner(owner_id));

-- A notification is the owner's, about the owner's board (and link).
drop policy if exists owner_all on atelier.owner_notifications;
create policy owner_all on atelier.owner_notifications
  for all to authenticated
  using (atelier.is_owner(owner_id))
  with check (
    atelier.is_owner(owner_id)
    and atelier.owns_board(board_id)
    and (share_link_id is null or atelier.owns_share_link(share_link_id))
  );

-- Visitor data: the owner may read it and delete it, never write it -------------

drop policy if exists owner_select on atelier.visitors;
create policy owner_select on atelier.visitors
  for select to authenticated using (atelier.owns_share_link(share_link_id));
drop policy if exists owner_delete on atelier.visitors;
create policy owner_delete on atelier.visitors
  for delete to authenticated using (atelier.owns_share_link(share_link_id));

drop policy if exists owner_select on atelier.reactions;
create policy owner_select on atelier.reactions
  for select to authenticated using (atelier.owns_share_link(share_link_id));
drop policy if exists owner_delete on atelier.reactions;
create policy owner_delete on atelier.reactions
  for delete to authenticated using (atelier.owns_share_link(share_link_id));

drop policy if exists owner_select on atelier.approvals;
create policy owner_select on atelier.approvals
  for select to authenticated using (atelier.owns_share_link(share_link_id));
drop policy if exists owner_delete on atelier.approvals;
create policy owner_delete on atelier.approvals
  for delete to authenticated using (atelier.owns_share_link(share_link_id));

drop policy if exists owner_select on atelier.link_views;
create policy owner_select on atelier.link_views
  for select to authenticated using (atelier.owns_share_link(share_link_id));
drop policy if exists owner_delete on atelier.link_views;
create policy owner_delete on atelier.link_views
  for delete to authenticated using (atelier.owns_share_link(share_link_id));

drop policy if exists owner_select on atelier.share_auth_attempts;
create policy owner_select on atelier.share_auth_attempts
  for select to authenticated using (atelier.owns_share_link(share_link_id));
drop policy if exists owner_delete on atelier.share_auth_attempts;
create policy owner_delete on atelier.share_auth_attempts
  for delete to authenticated using (atelier.owns_share_link(share_link_id));

-- Comments: the owner reads all comments on their boards, writes only their own (author_kind = 'owner',
-- no visitor attached), may resolve / edit and delete any of them.
drop policy if exists owner_select on atelier.comments;
create policy owner_select on atelier.comments
  for select to authenticated using (atelier.owns_board(board_id));

drop policy if exists owner_insert on atelier.comments;
create policy owner_insert on atelier.comments
  for insert to authenticated
  with check (
    atelier.owns_board(board_id)
    and author_kind = 'owner'
    and visitor_id is null
    and (share_link_id is null or atelier.owns_share_link(share_link_id))
  );

-- An update cannot turn a comment into someone else's (author_kind / visitor_id stay as they were
-- is enforced by the column grant below: only body, resolved_at stay writable).
drop policy if exists owner_update on atelier.comments;
create policy owner_update on atelier.comments
  for update to authenticated
  using (atelier.owns_board(board_id))
  with check (atelier.owns_board(board_id));

drop policy if exists owner_delete on atelier.comments;
create policy owner_delete on atelier.comments
  for delete to authenticated using (atelier.owns_board(board_id));


-- -----------------------------------------------------------------------------
-- Table privileges. `anon` gets nothing. `authenticated` gets only what a policy above can allow;
-- visitor-data tables are read/delete only. service_role bypasses RLS but needs privileges.
-- (0001's blanket "grant ... on all tables" re-runs in the test harness's second pass and would
-- re-widen these, so they are re-narrowed here: this file is always applied after it.)
-- -----------------------------------------------------------------------------
revoke all on atelier.rounds, atelier.share_links, atelier.visitors, atelier.reactions, atelier.comments,
              atelier.approvals, atelier.link_views, atelier.push_subscriptions, atelier.owner_notifications,
              atelier.share_auth_attempts
  from public, anon, authenticated;
revoke all on sequence atelier.link_views_id_seq from public, anon, authenticated;

grant select, insert, update, delete on atelier.rounds, atelier.share_links, atelier.push_subscriptions,
                                        atelier.owner_notifications
  to authenticated;
grant select, delete on atelier.visitors, atelier.reactions, atelier.approvals, atelier.link_views,
                        atelier.share_auth_attempts
  to authenticated;

-- Comments: insert / delete as a whole, but an update may only touch the body and the resolved flag.
grant select, insert, delete on atelier.comments to authenticated;
grant update (body, resolved_at) on atelier.comments to authenticated;

grant all on atelier.rounds, atelier.share_links, atelier.visitors, atelier.reactions, atelier.comments,
             atelier.approvals, atelier.link_views, atelier.push_subscriptions, atelier.owner_notifications,
             atelier.share_auth_attempts
  to service_role;
grant all on sequence atelier.link_views_id_seq to service_role;
