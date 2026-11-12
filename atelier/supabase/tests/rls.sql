-- =============================================================================
-- Atelier row-level-security tests.
--
-- Run by scripts/test-rls.sh after auth_stub.sql and the migrations. Everything
-- happens in ONE transaction that is rolled back at the end, so a run leaves
-- nothing behind. Any failed assertion raises an exception; the script runs
-- psql with ON_ERROR_STOP so the run then fails.
--
-- Cast of characters
--   A  the owner (authenticated)
--   B  another authenticated user, e.g. a Stash anonymous identity or a stranger
--   anon  the Supabase `anon` role
-- =============================================================================

begin;

create schema rls_test;
grant usage on schema rls_test to public;

-- Switch to a signed-in user (a JWT with this `sub`). `anonymous` mimics a Supabase
-- anonymous sign-in: role `authenticated`, claim is_anonymous = true.
create function rls_test.as_user(uid uuid, anonymous boolean default false)
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anonymous)::text, true);
  set local role authenticated;
end $$;

-- `authenticated` role but no `sub` claim at all.
create function rls_test.as_nobody()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  set local role authenticated;
end $$;

create function rls_test.as_anon()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
end $$;

create function rls_test.as_service()
returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
end $$;

-- Row count of a whole table as the current role.
create function rls_test.count_rows(tbl text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from atelier.%I', tbl) into n;
  return n;
end $$;

-- Run a DML statement and return how many rows it touched.
create function rls_test.affected(stmt text)
returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- The statement must be refused with insufficient_privilege (42501): both
-- "permission denied" and "new row violates row-level security policy" use it.
create function rls_test.expect_denied(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'FAIL: % was allowed (expected permission denied)', label;
end $$;

-- The statement must violate a CHECK constraint (23514).
create function rls_test.expect_check_violation(label text, stmt text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when check_violation then
    return;
  end;
  raise exception 'FAIL: % was allowed (expected check violation)', label;
end $$;

create function rls_test.assert_eq(label text, actual bigint, expected bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, actual;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Fixtures (as superuser): two users, nothing else.
-- -----------------------------------------------------------------------------
delete from auth.users
 where id in ('aaaaaaaa-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-00000000000b');
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b');


-- -----------------------------------------------------------------------------
-- (a) The owner can create, read, update and delete their own rows in every table.
-- -----------------------------------------------------------------------------
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  t text;
begin
  perform rls_test.as_user(a);

  -- owner_id defaults to auth.uid(), so the client never has to send it.
  insert into atelier.folders (id, name) values ('f0000000-0000-0000-0000-0000000000a1', 'Clients');
  insert into atelier.folders (id, name, parent_id, sort)
    values ('f0000000-0000-0000-0000-0000000000a2', 'Acme', 'f0000000-0000-0000-0000-0000000000a1', 2);
  insert into atelier.assets (id, owner_id, kind, mime, width, height, bytes, variants, palette, phash)
    values ('a5500000-0000-0000-0000-0000000000a1', a, 'image', 'image/webp', 800, 600, 12345,
            '{"thumb":"k/thumb.webp"}', '["#112233"]', 'abcd1234');
  insert into atelier.boards (id, owner_id, folder_id, title, preview)
    values ('b0a00000-0000-0000-0000-0000000000a1', a, 'f0000000-0000-0000-0000-0000000000a2',
            'Spring campaign', '["a5500000-0000-0000-0000-0000000000a1"]');
  insert into atelier.board_updates (board_id, update, device_id)
    values ('b0a00000-0000-0000-0000-0000000000a1', '\x0102'::bytea, 'laptop');
  insert into atelier.board_snapshots (board_id, state, upto_seq, kind, label)
    values ('b0a00000-0000-0000-0000-0000000000a1', '\x0a0b'::bytea, 1, 'compaction', null);
  insert into atelier.asset_usages (asset_id, board_id)
    values ('a5500000-0000-0000-0000-0000000000a1', 'b0a00000-0000-0000-0000-0000000000a1');
  insert into atelier.error_log (area, message, context)
    values ('sync', 'example', '{"k":1}');

  foreach t in array array['folders','boards','board_updates','board_snapshots','assets','asset_usages','error_log']
  loop
    perform rls_test.assert_eq('owner sees own rows in ' || t, rls_test.count_rows(t),
      case t when 'folders' then 2 else 1 end);
  end loop;

  -- seq is generated by the database and increases.
  insert into atelier.board_updates (board_id, update, device_id)
    values ('b0a00000-0000-0000-0000-0000000000a1', '\x03'::bytea, 'phone');
  perform rls_test.assert_eq('board_updates seq increases',
    (select max(seq) - min(seq) from atelier.board_updates), 1);

  -- update
  perform rls_test.assert_eq('owner updates own board',
    rls_test.affected($q$update atelier.boards set title = 'Spring v2', starred = true
                         where id = 'b0a00000-0000-0000-0000-0000000000a1'$q$), 1);
  perform rls_test.assert_eq('owner updates own folder',
    rls_test.affected($q$update atelier.folders set name = 'Clients 2'
                         where id = 'f0000000-0000-0000-0000-0000000000a1'$q$), 1);
  perform rls_test.assert_eq('owner updates own asset',
    rls_test.affected($q$update atelier.assets set credit = 'Photographer' where phash = 'abcd1234'$q$), 1);
  if (select updated_at from atelier.boards where id = 'b0a00000-0000-0000-0000-0000000000a1') is null then
    raise exception 'FAIL: boards.updated_at not maintained';
  end if;

  -- delete (children first, then a throwaway board that cascades)
  insert into atelier.boards (id, owner_id, title) values ('b0a00000-0000-0000-0000-0000000000a9', a, 'Throwaway');
  insert into atelier.board_updates (board_id, update, device_id)
    values ('b0a00000-0000-0000-0000-0000000000a9', '\x04'::bytea, 'laptop');
  perform rls_test.assert_eq('owner deletes own board',
    rls_test.affected($q$delete from atelier.boards where id = 'b0a00000-0000-0000-0000-0000000000a9'$q$), 1);
  perform rls_test.assert_eq('deleting a board cascades to its updates',
    (select count(*) from atelier.board_updates where board_id = 'b0a00000-0000-0000-0000-0000000000a9'), 0);
  perform rls_test.assert_eq('owner deletes own usage',
    rls_test.affected('delete from atelier.asset_usages'), 1);
  perform rls_test.assert_eq('owner deletes own snapshot',
    rls_test.affected('delete from atelier.board_snapshots'), 1);
  perform rls_test.assert_eq('owner deletes own error_log row',
    rls_test.affected('delete from atelier.error_log'), 1);

  -- put the usage/snapshot back for the later "other user" checks
  insert into atelier.board_snapshots (board_id, state, upto_seq, kind)
    values ('b0a00000-0000-0000-0000-0000000000a1', '\x0a0b'::bytea, 1, 'round');
  insert into atelier.asset_usages (asset_id, board_id)
    values ('a5500000-0000-0000-0000-0000000000a1', 'b0a00000-0000-0000-0000-0000000000a1');
  insert into atelier.error_log (area, message) values ('sync', 'example');

  reset role;
end $$;


-- -----------------------------------------------------------------------------
-- (b) Another authenticated user sees nothing of A's, and cannot change or add to it.
-- -----------------------------------------------------------------------------
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  t text;
begin
  perform rls_test.as_user(b);

  foreach t in array array['folders','boards','board_updates','board_snapshots','assets','asset_usages','error_log']
  loop
    perform rls_test.assert_eq('B sees 0 rows in ' || t, rls_test.count_rows(t), 0);
    perform rls_test.assert_eq('B cannot delete A''s rows in ' || t,
      rls_test.affected(format('delete from atelier.%I', t)), 0);
  end loop;

  -- Updates hit zero rows (the rows are invisible), including attempts to steal ownership.
  perform rls_test.assert_eq('B cannot update A''s board',
    rls_test.affected($q$update atelier.boards set title = 'pwned'$q$), 0);
  perform rls_test.assert_eq('B cannot take over A''s board',
    rls_test.affected(format($q$update atelier.boards set owner_id = %L$q$, b)), 0);
  perform rls_test.assert_eq('B cannot update A''s folder',
    rls_test.affected($q$update atelier.folders set name = 'pwned'$q$), 0);
  perform rls_test.assert_eq('B cannot update A''s asset',
    rls_test.affected($q$update atelier.assets set credit = 'pwned'$q$), 0);
  perform rls_test.assert_eq('B cannot update A''s updates',
    rls_test.affected($q$update atelier.board_updates set device_id = 'pwned'$q$), 0);
  perform rls_test.assert_eq('B cannot update A''s snapshots',
    rls_test.affected($q$update atelier.board_snapshots set label = 'pwned'$q$), 0);
  perform rls_test.assert_eq('B cannot update A''s error_log',
    rls_test.affected($q$update atelier.error_log set message = 'pwned'$q$), 0);

  -- Inserting rows that claim A as owner is refused.
  perform rls_test.expect_denied('B inserting a folder owned by A',
    format($q$insert into atelier.folders (owner_id, name) values (%L, 'x')$q$, a));
  perform rls_test.expect_denied('B inserting a board owned by A',
    format($q$insert into atelier.boards (owner_id, title) values (%L, 'x')$q$, a));
  perform rls_test.expect_denied('B inserting an asset owned by A',
    format($q$insert into atelier.assets (owner_id, kind, mime) values (%L, 'image', 'image/png')$q$, a));
  perform rls_test.expect_denied('B inserting an error_log row owned by A',
    format($q$insert into atelier.error_log (owner_id, area, message) values (%L, 'x', 'x')$q$, a));

  -- Child tables go through board ownership: B cannot attach anything to A's board.
  perform rls_test.expect_denied('B inserting an update into A''s board',
    $q$insert into atelier.board_updates (board_id, update, device_id)
       values ('b0a00000-0000-0000-0000-0000000000a1', '\x01'::bytea, 'evil')$q$);
  perform rls_test.expect_denied('B inserting a snapshot into A''s board',
    $q$insert into atelier.board_snapshots (board_id, state, upto_seq, kind)
       values ('b0a00000-0000-0000-0000-0000000000a1', '\x01'::bytea, 1, 'round')$q$);
  perform rls_test.expect_denied('B inserting a usage into A''s board',
    $q$insert into atelier.asset_usages (asset_id, board_id)
       values ('a5500000-0000-0000-0000-0000000000a1', 'b0a00000-0000-0000-0000-0000000000a1')$q$);

  -- Control: B can use the app for their own data.
  insert into atelier.folders (id, name) values ('f0000000-0000-0000-0000-0000000000b1', 'B folder');
  insert into atelier.assets (id, kind, mime) values ('a5500000-0000-0000-0000-0000000000b1', 'image', 'image/png');
  insert into atelier.boards (id, title) values ('b0a00000-0000-0000-0000-0000000000b1', 'B board');
  insert into atelier.board_updates (board_id, update, device_id)
    values ('b0a00000-0000-0000-0000-0000000000b1', '\x01'::bytea, 'b-device');
  perform rls_test.assert_eq('B sees exactly their own board', rls_test.count_rows('boards'), 1);

  -- Cross-links: B cannot point their rows at A's folder/asset (an owner check on the target).
  perform rls_test.expect_denied('B board in A''s folder',
    $q$insert into atelier.boards (title, folder_id) values ('x', 'f0000000-0000-0000-0000-0000000000a1')$q$);
  perform rls_test.expect_denied('B moving own board into A''s folder',
    $q$update atelier.boards set folder_id = 'f0000000-0000-0000-0000-0000000000a1'
        where id = 'b0a00000-0000-0000-0000-0000000000b1'$q$);
  perform rls_test.expect_denied('B folder under A''s folder',
    $q$insert into atelier.folders (name, parent_id) values ('x', 'f0000000-0000-0000-0000-0000000000a1')$q$);
  perform rls_test.expect_denied('B board thumbnail from A''s asset',
    $q$update atelier.boards set thumbnail_asset_id = 'a5500000-0000-0000-0000-0000000000a1'
        where id = 'b0a00000-0000-0000-0000-0000000000b1'$q$);
  perform rls_test.expect_denied('B usage of A''s asset on B''s board',
    $q$insert into atelier.asset_usages (asset_id, board_id)
       values ('a5500000-0000-0000-0000-0000000000a1', 'b0a00000-0000-0000-0000-0000000000b1')$q$);

  reset role;
end $$;

-- A is shut out of B's board in exactly the same way (and still sees only their own).
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);
  perform rls_test.expect_denied('A inserting an update into B''s board',
    $q$insert into atelier.board_updates (board_id, update, device_id)
       values ('b0a00000-0000-0000-0000-0000000000b1', '\x01'::bytea, 'laptop')$q$);
  perform rls_test.expect_denied('A inserting a snapshot into B''s board',
    $q$insert into atelier.board_snapshots (board_id, state, upto_seq, kind)
       values ('b0a00000-0000-0000-0000-0000000000b1', '\x01'::bytea, 1, 'round')$q$);
  perform rls_test.assert_eq('A does not see B''s board updates',
    (select count(*) from atelier.board_updates where board_id = 'b0a00000-0000-0000-0000-0000000000b1'), 0);
  perform rls_test.assert_eq('A does not see B''s boards', rls_test.count_rows('boards'), 1);
  reset role;
end $$;


-- -----------------------------------------------------------------------------
-- (c) The anon role has no access at all.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  perform rls_test.as_anon();
  foreach t in array array['folders','boards','board_updates','board_snapshots','assets','asset_usages','error_log']
  loop
    perform rls_test.expect_denied('anon select on ' || t, format('select count(*) from atelier.%I', t));
    perform rls_test.expect_denied('anon delete on ' || t, format('delete from atelier.%I', t));
  end loop;
  perform rls_test.expect_denied('anon insert into boards',
    $q$insert into atelier.boards (title) values ('x')$q$);
  perform rls_test.expect_denied('anon calling is_owner',
    $q$select atelier.is_owner('aaaaaaaa-0000-0000-0000-00000000000a')$q$);
  reset role;
end $$;


-- -----------------------------------------------------------------------------
-- (d) Authenticated identities that must get nothing: no subject, and Supabase
--     anonymous sign-ins (Stash uses them in the same project) even when the
--     subject matches the owner id.
-- -----------------------------------------------------------------------------
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  t text;
begin
  perform rls_test.as_nobody();
  foreach t in array array['folders','boards','board_updates','board_snapshots','assets','asset_usages','error_log']
  loop
    perform rls_test.assert_eq('no-subject token sees 0 rows in ' || t, rls_test.count_rows(t), 0);
  end loop;
  perform rls_test.expect_denied('no-subject token inserting a board',
    $q$insert into atelier.boards (title) values ('x')$q$);

  perform rls_test.as_user(a, true);
  foreach t in array array['folders','boards','board_updates','board_snapshots','assets','asset_usages','error_log']
  loop
    perform rls_test.assert_eq('anonymous sign-in sees 0 rows in ' || t, rls_test.count_rows(t), 0);
  end loop;
  perform rls_test.expect_denied('anonymous sign-in inserting a board',
    $q$insert into atelier.boards (title) values ('x')$q$);
  perform rls_test.assert_eq('anonymous sign-in cannot update',
    rls_test.affected($q$update atelier.boards set title = 'pwned'$q$), 0);
  reset role;
end $$;


-- -----------------------------------------------------------------------------
-- (e) The service role (server routes) bypasses RLS and sees everything.
-- -----------------------------------------------------------------------------
do $$
begin
  perform rls_test.as_service();
  perform rls_test.assert_eq('service role sees both users'' boards', rls_test.count_rows('boards'), 2);
  perform rls_test.assert_eq('service role sees both users'' folders', rls_test.count_rows('folders'), 3);
  reset role;
end $$;


-- -----------------------------------------------------------------------------
-- (f) Data-shape constraints.
-- -----------------------------------------------------------------------------
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);
  perform rls_test.expect_check_violation('snapshot kind outside the list',
    $q$insert into atelier.board_snapshots (board_id, state, upto_seq, kind)
       values ('b0a00000-0000-0000-0000-0000000000a1', '\x01'::bytea, 1, 'other')$q$);
  perform rls_test.expect_check_violation('more than 4 preview ids',
    $q$update atelier.boards set preview = '[1,2,3,4,5]' where id = 'b0a00000-0000-0000-0000-0000000000a1'$q$);
  perform rls_test.expect_check_violation('preview that is not an array',
    $q$update atelier.boards set preview = '{"a":1}' where id = 'b0a00000-0000-0000-0000-0000000000a1'$q$);
  perform rls_test.expect_check_violation('unknown asset kind',
    $q$insert into atelier.assets (kind, mime) values ('weird', 'x/y')$q$);
  reset role;
end $$;


-- -----------------------------------------------------------------------------
-- (g) Every atelier table has RLS enabled and forced for nobody by accident:
--     catches a future table added without `enable row level security`.
-- -----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'atelier' and c.relkind = 'r' and not c.relrowsecurity
  loop
    raise exception 'FAIL: atelier.% has row level security disabled', r.relname;
  end loop;
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'atelier' and c.relkind = 'r'
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  loop
    raise exception 'FAIL: atelier.% has no policy', r.relname;
  end loop;
  if has_schema_privilege('anon', 'atelier', 'usage') then
    raise exception 'FAIL: anon can use schema atelier';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- (h) Phase 2 (0002): inbox_items, asset analysis columns, hamming / similar_assets,
--     one usage row per (asset, board).
-- -----------------------------------------------------------------------------

-- (h1) Owner A: inbox rows (url, text and an image row pointing at A's own asset).
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);

  insert into atelier.inbox_items (id, kind, url, title, source_url, credit)
    values ('1b000000-0000-0000-0000-0000000000a1', 'url', 'https://example.com/post', 'A post',
            'https://example.com/', 'Jo');
  insert into atelier.inbox_items (id, kind, asset_id)
    values ('1b000000-0000-0000-0000-0000000000a2', 'image', 'a5500000-0000-0000-0000-0000000000a1');
  insert into atelier.inbox_items (id, kind, text_body)
    values ('1b000000-0000-0000-0000-0000000000a3', 'text', 'remember the grain');

  perform rls_test.assert_eq('owner sees own inbox rows', rls_test.count_rows('inbox_items'), 3);
  perform rls_test.assert_eq('inbox owner_id defaults to auth.uid()',
    (select count(*) from atelier.inbox_items where owner_id = a), 3);
  if (select placed_at from atelier.inbox_items where id = '1b000000-0000-0000-0000-0000000000a1') is not null then
    raise exception 'FAIL: new inbox row is already placed';
  end if;
  perform rls_test.assert_eq('owner marks an inbox row placed',
    rls_test.affected($q$update atelier.inbox_items set placed_at = now()
                          where id = '1b000000-0000-0000-0000-0000000000a1'$q$), 1);

  -- The video kind needs an asset too; an owner-owned video asset is fine.
  insert into atelier.assets (id, owner_id, kind, mime) values ('a5500000-0000-0000-0000-0000000000a5', a, 'video', 'video/mp4');
  insert into atelier.inbox_items (kind, asset_id) values ('video', 'a5500000-0000-0000-0000-0000000000a5');
  perform rls_test.assert_eq('owner deletes own inbox row',
    rls_test.affected($q$delete from atelier.inbox_items where kind = 'video'$q$), 1);
  reset role;
end $$;

-- (h2) User B: sees none of it, cannot change it, cannot add rows in A's name.
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
begin
  perform rls_test.as_user(b);
  perform rls_test.assert_eq('B sees 0 inbox rows', rls_test.count_rows('inbox_items'), 0);
  perform rls_test.assert_eq('B cannot update A''s inbox rows',
    rls_test.affected($q$update atelier.inbox_items set title = 'pwned'$q$), 0);
  perform rls_test.assert_eq('B cannot take over A''s inbox rows',
    rls_test.affected(format($q$update atelier.inbox_items set owner_id = %L$q$, b)), 0);
  perform rls_test.assert_eq('B cannot delete A''s inbox rows',
    rls_test.affected('delete from atelier.inbox_items'), 0);
  perform rls_test.expect_denied('B inserting an inbox row owned by A',
    format($q$insert into atelier.inbox_items (owner_id, kind, url) values (%L, 'url', 'https://x.test')$q$, a));

  -- Control: B can use their own inbox.
  insert into atelier.inbox_items (kind, url) values ('url', 'https://b.example/');
  perform rls_test.assert_eq('B sees exactly their own inbox row', rls_test.count_rows('inbox_items'), 1);
  reset role;
end $$;

-- (h3) An inbox row cannot point at someone else's asset (and A cannot move a row onto B's asset).
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);
  perform rls_test.expect_denied('A inbox row with B''s asset',
    $q$insert into atelier.inbox_items (kind, asset_id)
       values ('image', 'a5500000-0000-0000-0000-0000000000b1')$q$);
  perform rls_test.expect_denied('A re-pointing an inbox row at B''s asset',
    $q$update atelier.inbox_items set asset_id = 'a5500000-0000-0000-0000-0000000000b1'
        where id = '1b000000-0000-0000-0000-0000000000a2'$q$);
  reset role;
end $$;

-- (h4) anon, no-subject token and anonymous sign-in get nothing.
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_anon();
  perform rls_test.expect_denied('anon select on inbox_items', 'select count(*) from atelier.inbox_items');
  perform rls_test.expect_denied('anon insert into inbox_items',
    $q$insert into atelier.inbox_items (kind, url) values ('url', 'https://x.test')$q$);
  perform rls_test.expect_denied('anon calling hamming', $q$select atelier.hamming('0000000000000000','0000000000000000')$q$);
  perform rls_test.expect_denied('anon calling similar_assets', $q$select * from atelier.similar_assets('0000000000000000')$q$);

  perform rls_test.as_nobody();
  perform rls_test.assert_eq('no-subject token sees 0 inbox rows', rls_test.count_rows('inbox_items'), 0);
  perform rls_test.as_user(a, true);
  perform rls_test.assert_eq('anonymous sign-in sees 0 inbox rows', rls_test.count_rows('inbox_items'), 0);
  perform rls_test.expect_denied('anonymous sign-in inserting an inbox row',
    $q$insert into atelier.inbox_items (kind, url) values ('url', 'https://x.test')$q$);
  reset role;
end $$;

-- (h5) Data-shape constraints on inbox_items and the new asset columns.
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);
  perform rls_test.expect_check_violation('image row without asset_id',
    $q$insert into atelier.inbox_items (kind) values ('image')$q$);
  perform rls_test.expect_check_violation('video row without asset_id',
    $q$insert into atelier.inbox_items (kind, url) values ('video', 'https://x.test')$q$);
  perform rls_test.expect_check_violation('url row without url',
    $q$insert into atelier.inbox_items (kind, text_body) values ('url', 'x')$q$);
  perform rls_test.expect_check_violation('text row without text_body',
    $q$insert into atelier.inbox_items (kind, url) values ('text', 'https://x.test')$q$);
  perform rls_test.expect_check_violation('text row with 20,000 characters',
    $q$insert into atelier.inbox_items (kind, text_body) values ('text', repeat('x', 20000))$q$);
  perform rls_test.expect_check_violation('url longer than 2048',
    $q$insert into atelier.inbox_items (kind, url) values ('url', 'https://x.test/' || repeat('a', 2100))$q$);
  perform rls_test.expect_check_violation('title longer than 300',
    $q$insert into atelier.inbox_items (kind, url, title) values ('url', 'https://x.test', repeat('t', 301))$q$);
  perform rls_test.expect_check_violation('unknown inbox kind',
    $q$insert into atelier.inbox_items (kind, url) values ('audio', 'https://x.test')$q$);
  perform rls_test.expect_check_violation('asset title longer than 300',
    $q$update atelier.assets set title = repeat('t', 301) where id = 'a5500000-0000-0000-0000-0000000000a1'$q$);

  -- New asset columns and defaults; a gif asset kind is allowed (Phase 2 animated images).
  perform rls_test.assert_eq('assets.analysis_version defaults to 0',
    (select analysis_version from atelier.assets where id = 'a5500000-0000-0000-0000-0000000000a1')::bigint, 0);
  if (select hidden from atelier.assets where id = 'a5500000-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: assets.hidden should default to false';
  end if;
  insert into atelier.assets (id, kind, mime) values ('a5500000-0000-0000-0000-0000000000a6', 'gif', 'image/gif');
  perform rls_test.assert_eq('owner sets title and analysis_version',
    rls_test.affected($q$update atelier.assets set title = 'Moodboard hero', analysis_version = 1
                          where id = 'a5500000-0000-0000-0000-0000000000a6'$q$), 1);
  reset role;
end $$;

-- (h6) Deleting an asset removes inbox rows that point at it (an image row cannot survive without it).
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);
  insert into atelier.assets (id, kind, mime) values ('a5500000-0000-0000-0000-0000000000a7', 'image', 'image/png');
  insert into atelier.inbox_items (id, kind, asset_id)
    values ('1b000000-0000-0000-0000-0000000000a7', 'image', 'a5500000-0000-0000-0000-0000000000a7');
  perform rls_test.assert_eq('owner deletes an asset', rls_test.affected(
    $q$delete from atelier.assets where id = 'a5500000-0000-0000-0000-0000000000a7'$q$), 1);
  perform rls_test.assert_eq('the inbox row went with it',
    (select count(*) from atelier.inbox_items where id = '1b000000-0000-0000-0000-0000000000a7'), 0);
  reset role;
end $$;

-- (h7) atelier.hamming: bit count of the XOR of two 16-hex-char hashes; 64 when unusable.
do $$
begin
  perform rls_test.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
  perform rls_test.assert_eq('hamming 4 bits', atelier.hamming('0000000000000000', '000000000000000f'), 4);
  perform rls_test.assert_eq('hamming 64 bits', atelier.hamming('ffffffffffffffff', '0000000000000000'), 64);
  perform rls_test.assert_eq('hamming identical', atelier.hamming('0123456789abcdef', '0123456789abcdef'), 0);
  perform rls_test.assert_eq('hamming is case-insensitive', atelier.hamming('00000000000000ff', '00000000000000FF'), 0);
  perform rls_test.assert_eq('hamming null is 64', atelier.hamming(null, '0000000000000000'), 64);
  perform rls_test.assert_eq('hamming null (right) is 64', atelier.hamming('0000000000000000', null), 64);
  perform rls_test.assert_eq('hamming short hash is 64', atelier.hamming('abcd1234', 'abcd1234'), 64);
  perform rls_test.assert_eq('hamming non-hex is 64', atelier.hamming('zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz'), 64);
  reset role;
end $$;

-- (h8) atelier.similar_assets: only the caller's own, visible assets within max_dist.
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
  b constant uuid := 'bbbbbbbb-0000-0000-0000-00000000000b';
  r record;
  n bigint;
begin
  perform rls_test.as_user(a);
  insert into atelier.assets (id, kind, mime, phash) values
    ('a5500000-0000-0000-0000-0000000000c1', 'image', 'image/webp', '000000000000000f'),  -- dist 4
    ('a5500000-0000-0000-0000-0000000000c2', 'image', 'image/webp', '00000000000003ff');  -- dist 10
  insert into atelier.assets (id, kind, mime, phash, hidden) values
    ('a5500000-0000-0000-0000-0000000000c3', 'image', 'image/webp', '0000000000000001', true); -- dist 1 but hidden

  select count(*) into n from atelier.similar_assets('0000000000000000', 6);
  perform rls_test.assert_eq('A finds exactly one similar asset', n, 1);
  select * into r from atelier.similar_assets('0000000000000000', 6);
  if r.id <> 'a5500000-0000-0000-0000-0000000000c1' or r.phash <> '000000000000000f' or r.dist <> 4 then
    raise exception 'FAIL: similar_assets returned % / % / %', r.id, r.phash, r.dist;
  end if;
  select count(*) into n from atelier.similar_assets('0000000000000000', 10);
  perform rls_test.assert_eq('a wider radius adds the dist-10 asset (still not the hidden one)', n, 2);
  select count(*) into n from atelier.similar_assets('0000000000000000');
  perform rls_test.assert_eq('default radius is 6', n, 1);
  select count(*) into n from atelier.similar_assets(null, 6);
  perform rls_test.assert_eq('a null hash finds nothing', n, 0);
  -- Ordered nearest first.
  if (select id from atelier.similar_assets('0000000000000000', 10) order by dist limit 1)
     <> 'a5500000-0000-0000-0000-0000000000c1' then
    raise exception 'FAIL: nearest asset not first';
  end if;

  perform rls_test.as_user(b);
  select count(*) into n from atelier.similar_assets('0000000000000000', 6);
  perform rls_test.assert_eq('B finds none of A''s assets', n, 0);
  select count(*) into n from atelier.similar_assets('0000000000000000', 64);
  perform rls_test.assert_eq('B finds none of A''s assets even at radius 64', n, 0);
  -- ... but does find their own.
  insert into atelier.assets (id, kind, mime, phash) values ('a5500000-0000-0000-0000-0000000000d1', 'image', 'image/webp', '0000000000000003');
  select count(*) into n from atelier.similar_assets('0000000000000000', 6);
  perform rls_test.assert_eq('B finds their own', n, 1);
  reset role;
end $$;

-- (h9) One usage row per (asset, board).
do $$
declare a constant uuid := 'aaaaaaaa-0000-0000-0000-00000000000a';
begin
  perform rls_test.as_user(a);
  begin
    insert into atelier.asset_usages (asset_id, board_id)
      values ('a5500000-0000-0000-0000-0000000000a1', 'b0a00000-0000-0000-0000-0000000000a1');
  exception when unique_violation then
    reset role;
    return;
  end;
  raise exception 'FAIL: duplicate (asset_id, board_id) usage was allowed';
end $$;

-- (h10) The service role sees the inbox of every owner.
do $$
begin
  perform rls_test.as_service();
  perform rls_test.assert_eq('service role sees both users'' inbox rows', rls_test.count_rows('inbox_items'), 4);
  reset role;
end $$;


-- Deleting a user removes everything they own (ON DELETE CASCADE all the way down).
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$
begin
  perform rls_test.assert_eq('cascade: no boards left for A',
    (select count(*) from atelier.boards where owner_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0);
  perform rls_test.assert_eq('cascade: no inbox rows left for A',
    (select count(*) from atelier.inbox_items where owner_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0);
  perform rls_test.assert_eq('cascade: no updates left for A''s board',
    (select count(*) from atelier.board_updates where board_id = 'b0a00000-0000-0000-0000-0000000000a1'), 0);
end $$;

rollback;

\echo 'RLS tests passed'
