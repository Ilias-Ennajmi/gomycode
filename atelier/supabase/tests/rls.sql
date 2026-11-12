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


-- Deleting a user removes everything they own (ON DELETE CASCADE all the way down).
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$
begin
  perform rls_test.assert_eq('cascade: no boards left for A',
    (select count(*) from atelier.boards where owner_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), 0);
  perform rls_test.assert_eq('cascade: no updates left for A''s board',
    (select count(*) from atelier.board_updates where board_id = 'b0a00000-0000-0000-0000-0000000000a1'), 0);
end $$;

rollback;

\echo 'RLS tests passed'
