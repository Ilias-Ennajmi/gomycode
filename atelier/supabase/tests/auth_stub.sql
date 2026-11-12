-- =============================================================================
-- Atelier test stub for the parts of Supabase that the migration depends on.
--
-- Used ONLY by scripts/test-rls.sh (CI and local). Never apply this to a real
-- Supabase project: Supabase already provides these roles, the `auth` schema
-- and auth.uid() / auth.jwt().
--
-- It mirrors Supabase's behaviour closely enough to test row-level security:
--   * roles anon, authenticated, service_role (the last bypasses RLS)
--   * auth.users (id only)
--   * auth.uid() reads the `sub` claim, auth.jwt() reads the claims object
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt() ->> 'sub'
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
