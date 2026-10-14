-- =============================================================================
-- Stash · 0002 · per-user bootstrap
--
-- Every user gets a `stash.settings` row and an Inbox space the moment their
-- auth.users row is created. Existing users are backfilled at the end.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Trigger function
-- security definer: runs as the owner (postgres) so it can write the user's
-- rows while the auth service inserts into auth.users. search_path is pinned
-- to '' and every name is fully qualified.
-- -----------------------------------------------------------------------------
create or replace function stash.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into stash.settings (user_id)
  values (new.id)
  on conflict do nothing;

  -- One Inbox per user is enforced by the partial unique index
  -- spaces_one_inbox_per_user, so "on conflict do nothing" keeps this idempotent.
  insert into stash.spaces (user_id, name, kind, color_token, sort_order)
  values (new.id, 'Inbox', 'inbox'::stash.space_kind, 'inbox', -1)
  on conflict do nothing;

  return new;
end;
$$;

comment on function stash.handle_new_user() is
  'AFTER INSERT on auth.users: creates the stash.settings row and the Inbox space.';

-- Only the trigger should run this; nobody may call it through the API.
revoke execute on function stash.handle_new_user() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Trigger on auth.users
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created_stash on auth.users;
create trigger on_auth_user_created_stash
  after insert on auth.users
  for each row execute function stash.handle_new_user();


-- -----------------------------------------------------------------------------
-- Backfill users that existed before this migration
-- -----------------------------------------------------------------------------
insert into stash.settings (user_id)
select u.id
from auth.users u
where not exists (select 1 from stash.settings s where s.user_id = u.id)
on conflict do nothing;

insert into stash.spaces (user_id, name, kind, color_token, sort_order)
select u.id, 'Inbox', 'inbox'::stash.space_kind, 'inbox', -1
from auth.users u
where not exists (
  select 1 from stash.spaces sp
  where sp.user_id = u.id and sp.kind = 'inbox'::stash.space_kind
)
on conflict do nothing;
