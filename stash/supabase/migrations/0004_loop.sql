-- =============================================================================
-- Stash · 0004 · the loop (Phase 2)
--
--   * daily_queues: "Your 5 for today", one row per user per local day.
--   * push_subscriptions: Web Push endpoints per device.
--   * settings.timezone, job types `grade` / `card_gen`, usage kind `grade`.
--   * A kept save schedules its (never reviewed) recall cards 3 days out.
--   * A Space that gains 5+ ready saves since its last synthesis queues a
--     `synthesize` job (the worker only runs it for owner ids, like ingest).
--   * Cron (pg_cron + pg_net) calls the app's own routes every 5 minutes
--     (/api/cron/reminders) and every hour (/api/cron/daily), sending
--     `Authorization: Bearer <stash_cron_secret>`.
--
-- Secrets never pass through a person or through Vercel:
--   * `stash_cron_secret` is generated here (random) and `stash_app_url` set,
--     both in Supabase Vault, only when missing.
--   * The routes don't know the secret: they pass the bearer token they got to
--     the `cron_*` functions below, which compare it to Vault and refuse
--     otherwise. Those functions are SECURITY DEFINER and callable by `anon`
--     (the app's publishable key), so Vercel needs no service-role key.
--   * VAPID keys live in Vault too (`stash_vapid_public`, `stash_vapid_private`);
--     the first cron run generates them. Browsers read only the public key
--     through `vapid_public_key()`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enum values. Added inside the migration's transaction, so nothing below
-- uses them (Postgres refuses a new enum value before it commits).
-- -----------------------------------------------------------------------------
alter type stash.job_type add value if not exists 'grade';
alter type stash.job_type add value if not exists 'card_gen';


-- -----------------------------------------------------------------------------
-- New columns
-- -----------------------------------------------------------------------------
alter table stash.settings add column if not exists timezone text not null default 'Africa/Casablanca';
comment on column stash.settings.timezone is 'IANA time zone; queue_time and quiet_hours are read in it.';

-- The grader's one-line feedback ("You missed the decoy tier.").
alter table stash.reviews add column if not exists feedback text;

-- Cost log learns the grading step.
alter table stash.usage drop constraint if exists usage_kind_check;
alter table stash.usage add constraint usage_kind_check
  check (kind in ('transcribe', 'understand', 'embed', 'synthesize', 'search', 'grade'));


-- -----------------------------------------------------------------------------
-- daily_queues: the daily queue, frozen for the day (built by the app or cron)
-- -----------------------------------------------------------------------------
create table if not exists stash.daily_queues (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day       date not null,
  save_ids  uuid[] not null default '{}',
  minutes   int not null default 6 check (minutes between 1 and 120),
  built_at  timestamptz not null default now(),
  done_ids  uuid[] not null default '{}',
  constraint daily_queues_user_day_uniq unique (user_id, day)
);

comment on table stash.daily_queues is 'Your N for today: the ordered save ids for one local day and which are done.';
-- (user_id, day) unique index covers the user_id FK.


-- -----------------------------------------------------------------------------
-- push_subscriptions: one row per browser push endpoint
-- -----------------------------------------------------------------------------
create table if not exists stash.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table stash.push_subscriptions is 'Web Push subscriptions (VAPID). Endpoint is unique across users.';

-- The cron route POSTs to every stored endpoint, so only the browsers' real push
-- services are accepted (no http, no arbitrary hosts). Same list as
-- lib/pushHosts.ts, which the app checks before saving and before sending.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_endpoint_host'
                  and conrelid = 'stash.push_subscriptions'::regclass) then
    alter table stash.push_subscriptions add constraint push_subscriptions_endpoint_host check (
      length(endpoint) <= 1000
      and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+notify\.windows\.com|web\.push\.apple\.com|([a-z0-9-]+\.)+push\.apple\.com)(:443)?/[^[:space:]]*$'
    );
  end if;
end
$$;

create index if not exists push_subscriptions_user_id_idx on stash.push_subscriptions (user_id);


-- RLS + grants like 0001 (default privileges already grant the table rights).
do $$
declare
  t text;
begin
  foreach t in array array['daily_queues', 'push_subscriptions']
  loop
    execute format('alter table stash.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on stash.%I', t);
    execute format(
      'create policy "owner_all" on stash.%I '
      'for all to authenticated '
      'using ((select auth.uid()) = user_id) '
      'with check ((select auth.uid()) = user_id)', t);
    execute format('grant select, insert, update, delete on stash.%I to authenticated', t);
    execute format('grant all on stash.%I to service_role', t);
    execute format('revoke all on stash.%I from anon', t);
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- settings.timezone must be a real IANA zone: `now() at time zone <bad>` throws,
-- and one bad row would break the cron queries for every user.
-- -----------------------------------------------------------------------------
create or replace function stash.guard_settings_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.timezone is null
     or pg_catalog.length(new.timezone) > 64
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function stash.guard_settings_timezone() is
  'BEFORE INSERT/UPDATE OF timezone on settings: only names listed in pg_timezone_names.';

drop trigger if exists guard_settings_timezone on stash.settings;
create trigger guard_settings_timezone
  before insert or update of timezone on stash.settings
  for each row execute function stash.guard_settings_timezone();


-- -----------------------------------------------------------------------------
-- Same owner on every reference. RLS checks a row's user_id, not the ids it
-- points at, so without this a device could insert a job, reminder or card
-- that names another identity's save or Space (the worker would then read it).
-- One generic BEFORE trigger: each argument is a referencing column; the row
-- it names must belong to NEW.user_id. `<col>[]` checks every id in an array.
-- SECURITY DEFINER because the phone's RLS hides other identities' rows (an
-- invisible row would look like a missing one). Named zz_ so it runs after the
-- other BEFORE triggers that rewrite NEW.
-- -----------------------------------------------------------------------------
create or replace function stash.guard_same_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new   jsonb := pg_catalog.to_jsonb(new);
  v_old   jsonb := case when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old) else null end;
  v_user  uuid  := (v_new->>'user_id')::uuid;
  v_arg   text;
  v_col   text;
  v_array boolean;
  v_table text;
  v_id    uuid;
  v_owner uuid;
begin
  foreach v_arg in array tg_argv
  loop
    v_array := pg_catalog.right(v_arg, 2) = '[]';
    v_col   := case when v_array then pg_catalog.left(v_arg, -2) else v_arg end;
    -- Unchanged reference and unchanged owner: nothing to check.
    continue when tg_op = 'UPDATE'
              and (v_old->v_col) is not distinct from (v_new->v_col)
              and (v_old->'user_id') is not distinct from (v_new->'user_id');
    v_table := case
                 when v_col in ('save_id', 'save_ids', 'done_ids', 'source_save_ids') then 'saves'
                 when v_col in ('space_id', 'suggested_space_id') then 'spaces'
                 when v_col = 'card_id' then 'cards'
               end;
    if v_table is null then
      raise exception 'guard_same_owner: unknown column %', v_col;
    end if;

    if v_array then
      if pg_catalog.jsonb_typeof(v_new->v_col) = 'array' then
        execute pg_catalog.format(
          'select t.user_id from stash.%I t where t.id = any ($1) and t.user_id <> $2 limit 1', v_table)
          into v_owner
          using (select pg_catalog.array_agg(x::uuid) from pg_catalog.jsonb_array_elements_text(v_new->v_col) x),
                v_user;
        if v_owner is not null then
          raise exception 'reference to another owner''s row' using errcode = '42501';
        end if;
      end if;
    else
      v_id := (v_new->>v_col)::uuid;
      continue when v_id is null;
      v_owner := null;
      execute pg_catalog.format('select t.user_id from stash.%I t where t.id = $1', v_table)
        into v_owner using v_id;
      -- A missing row is the foreign key's job; another owner's row is ours.
      if v_owner is not null and v_owner is distinct from v_user then
        raise exception 'reference to another owner''s row' using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

comment on function stash.guard_same_owner() is
  'BEFORE INSERT/UPDATE trigger: every save/space/card the row references belongs to NEW.user_id.';

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('saves',        array['space_id']),
      ('insights',     array['save_id', 'suggested_space_id']),
      ('transcripts',  array['save_id']),
      ('embeddings',   array['save_id']),
      ('places',       array['save_id']),
      ('states',       array['save_id']),
      ('cards',        array['save_id']),
      ('reviews',      array['card_id']),
      ('syntheses',    array['space_id', 'source_save_ids[]']),
      ('reminders',    array['save_id']),
      ('jobs',         array['save_id', 'space_id']),
      ('exports',      array['space_id']),
      ('usage',        array['save_id']),
      ('daily_queues', array['save_ids[]', 'done_ids[]'])
    ) as t(tbl, cols)
  loop
    execute pg_catalog.format('drop trigger if exists zz_same_owner on stash.%I', r.tbl);
    execute pg_catalog.format(
      'create trigger zz_same_owner before insert or update on stash.%I '
      'for each row execute function stash.guard_same_owner(%s)',
      r.tbl, (select pg_catalog.string_agg(pg_catalog.quote_literal(c), ', ') from pg_catalog.unnest(r.cols) c));
  end loop;
end
$$;


-- -----------------------------------------------------------------------------
-- Owner ids for server-side work (cron pushes, daily queues, cleanup), from the
-- Vault secret `stash_owner_ids`: comma-separated device ids, the same value as
-- the worker's OWNER_USER_IDS. The owner creates it (Settings shows the device
-- id); while it is missing or empty the cron functions return nothing.
-- -----------------------------------------------------------------------------
create or replace function stash.owner_ids()
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw text;
begin
  select decrypted_secret into v_raw
    from vault.decrypted_secrets where name = 'stash_owner_ids' limit 1;
  if v_raw is null or pg_catalog.btrim(v_raw) = '' then
    return '{}'::uuid[];
  end if;
  return coalesce((
    select pg_catalog.array_agg(distinct pg_catalog.lower(x)::uuid)
      from (select pg_catalog.btrim(p) as x
              from pg_catalog.regexp_split_to_table(v_raw, '[,\s]+') p) s
     where x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ), '{}'::uuid[]);
end;
$$;

comment on function stash.owner_ids() is
  'Owner device ids from Vault secret stash_owner_ids (comma-separated). Empty when unset.';

revoke execute on function stash.owner_ids() from public, anon, authenticated;
grant execute on function stash.owner_ids() to service_role;


-- -----------------------------------------------------------------------------
-- Function privileges. `anon` gets schema usage so it can call the cron_*
-- functions through the Data API; tables stay closed to it (no grants, RLS).
-- Postgres grants EXECUTE to PUBLIC by default, so take that away first and
-- grant each callable function explicitly.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema stash from public, anon;
alter default privileges in schema stash revoke execute on functions from public;
alter default privileges in schema stash revoke execute on functions from anon;
grant usage on schema stash to anon;

-- Phase 1 functions the phone calls (re-granted: they relied on explicit grants already).
grant execute on function stash.search_saves(text, uuid, extensions.vector, int) to authenticated, service_role;
grant execute on function stash.related_saves(uuid, int) to authenticated, service_role;
grant execute on function stash.request_reprocess(uuid) to authenticated;
grant execute on function stash.claim_jobs(int) to service_role;
grant execute on function stash.sweep() to service_role;


-- -----------------------------------------------------------------------------
-- Kept → schedule recall cards 3 days out (only cards never reviewed).
-- The worker creates cards at ingest; Learn shows cards of kept saves only.
-- -----------------------------------------------------------------------------
create or replace function stash.on_state_kept()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kept and not coalesce(old.kept, false) then
    update stash.cards c
       set due_at = pg_catalog.now() + interval '3 days'
     where c.save_id = new.save_id
       and c.repetitions = 0
       and not exists (select 1 from stash.reviews r where r.card_id = c.id);
  end if;
  return new;
end;
$$;

comment on function stash.on_state_kept() is
  'AFTER UPDATE OF kept on states: a newly kept save''s unreviewed cards fall due in 3 days.';

drop trigger if exists on_state_kept on stash.states;
create trigger on_state_kept
  after update of kept on stash.states
  for each row execute function stash.on_state_kept();


-- -----------------------------------------------------------------------------
-- Syntheses: queue a `synthesize` job when a Space gains 5+ ready saves since
-- its last synthesis (and none is already waiting).
-- -----------------------------------------------------------------------------
create or replace function stash.maybe_synthesize(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_kind  stash.space_kind;
  v_since timestamptz;
  v_new   int;
begin
  select sp.user_id, sp.kind into v_user, v_kind
    from stash.spaces sp where sp.id = p_space_id and not sp.archived;
  if v_user is null or v_kind = 'inbox'::stash.space_kind then
    return;
  end if;

  if exists (select 1 from stash.jobs j
              where j.space_id = p_space_id
                and j.type = 'synthesize'::stash.job_type
                and j.state in ('queued'::stash.job_state, 'running'::stash.job_state)) then
    return;
  end if;

  select max(sy.created_at) into v_since from stash.syntheses sy where sy.space_id = p_space_id;

  select count(*) into v_new
    from stash.saves s
   where s.space_id = p_space_id
     and s.status = 'ready'::stash.save_status
     and coalesce(s.processed_at, s.saved_at) > coalesce(v_since, '-infinity'::timestamptz);

  if v_new >= 5 then
    insert into stash.jobs (space_id, user_id, type)
    values (p_space_id, v_user, 'synthesize'::stash.job_type);
  end if;
end;
$$;

comment on function stash.maybe_synthesize(uuid) is
  'Queues a synthesize job for a Space with 5+ ready saves since its last synthesis.';

create or replace function stash.on_save_ready_or_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.space_id is not null
     and new.status = 'ready'::stash.save_status
     and (old.status is distinct from new.status or old.space_id is distinct from new.space_id) then
    perform stash.maybe_synthesize(new.space_id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_save_ready_or_moved on stash.saves;
create trigger on_save_ready_or_moved
  after update of status, space_id on stash.saves
  for each row execute function stash.on_save_ready_or_moved();


-- -----------------------------------------------------------------------------
-- Daily queue bookkeeping
-- -----------------------------------------------------------------------------
-- A new day's queue: whatever was left undone in the previous one counts as
-- skipped, so it sinks next time (the builder sorts by skip_count).
create or replace function stash.on_daily_queue_created()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prev stash.daily_queues;
begin
  select * into v_prev
    from stash.daily_queues q
   where q.user_id = new.user_id and q.day < new.day
   order by q.day desc
   limit 1;
  if found then
    update stash.states st
       set skip_count = st.skip_count + 1
     where st.save_id = any (v_prev.save_ids)
       and not (st.save_id = any (v_prev.done_ids))
       and st.user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_daily_queue_created on stash.daily_queues;
create trigger on_daily_queue_created
  after insert on stash.daily_queues
  for each row execute function stash.on_daily_queue_created();

-- Play marks an item of today's queue as done (idempotent).
create or replace function stash.mark_queue_done(p_day date, p_save_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update stash.daily_queues q
     set done_ids = pg_catalog.array_append(q.done_ids, p_save_id)
   where q.user_id = (select auth.uid())
     and q.day = p_day
     and not (p_save_id = any (q.done_ids));
$$;

grant execute on function stash.mark_queue_done(date, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Push subscriptions from the app: one endpoint belongs to one identity (a
-- reinstalled phone may come back with a new identity and the same endpoint).
-- -----------------------------------------------------------------------------
create or replace function stash.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if p_endpoint is null or not pg_catalog.starts_with(p_endpoint, 'https://') or pg_catalog.length(p_endpoint) > 1000 then
    raise exception 'bad endpoint';
  end if;
  delete from stash.push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;
  insert into stash.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, pg_catalog.left(p_user_agent, 300))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end;
$$;

grant execute on function stash.save_push_subscription(text, text, text, text) to authenticated;


-- -----------------------------------------------------------------------------
-- Vault: generate the cron secret and set the app URL, only when missing.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'stash_cron_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'stash_cron_secret',
      'Bearer token pg_cron sends to the Stash cron routes');
  end if;
  if not exists (select 1 from vault.secrets where name = 'stash_app_url') then
    perform vault.create_secret(
      'https://stash-drab-kappa.vercel.app',
      'stash_app_url',
      'Base URL of the Stash web app (cron routes, VAPID subject)');
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- Cron gate: true only when the caller holds the Vault secret.
-- -----------------------------------------------------------------------------
create or replace function stash.cron_ok(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'stash_cron_secret' limit 1;
  return v_secret is not null and p_secret is not null
     and pg_catalog.length(p_secret) = pg_catalog.length(v_secret)
     and p_secret = v_secret;
end;
$$;

revoke execute on function stash.cron_ok(text) from public, anon, authenticated;


-- pg_cron → app route, with the secret. Silent no-op until Vault has both values.
create or replace function stash.call_app(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'stash_app_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'stash_cron_secret' limit 1;
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url                  := pg_catalog.rtrim(v_url, '/') || p_path,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
exception when others then
  return;  -- a failed call is retried by the next tick
end;
$$;

revoke execute on function stash.call_app(text) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- VAPID keys in Vault
-- -----------------------------------------------------------------------------
create or replace function stash.vapid_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'stash_vapid_public' limit 1;
$$;

grant execute on function stash.vapid_public_key() to anon, authenticated;

create or replace function stash.cron_vapid(p_secret text)
returns table (public_key text, private_key text, subject text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select (select decrypted_secret from vault.decrypted_secrets where name = 'stash_vapid_public' limit 1),
         (select decrypted_secret from vault.decrypted_secrets where name = 'stash_vapid_private' limit 1),
         (select decrypted_secret from vault.decrypted_secrets where name = 'stash_app_url' limit 1);
end;
$$;

grant execute on function stash.cron_vapid(text) to anon;

create or replace function stash.cron_set_vapid(p_secret text, p_public text, p_private text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Both or neither: a half-written pair would break every subscription.
  if exists (select 1 from vault.secrets where name in ('stash_vapid_public', 'stash_vapid_private')) then
    return;
  end if;
  perform vault.create_secret(p_public, 'stash_vapid_public', 'Web Push VAPID public key');
  perform vault.create_secret(p_private, 'stash_vapid_private', 'Web Push VAPID private key');
end;
$$;

grant execute on function stash.cron_set_vapid(text, text, text) to anon;


-- -----------------------------------------------------------------------------
-- Reminders for the cron route: due time reminders with the owner's devices.
-- Quiet hours are checked in the route (it knows the local time rules).
-- -----------------------------------------------------------------------------
create or replace function stash.cron_due_reminders(p_secret text)
returns table (
  id            uuid,
  user_id       uuid,
  save_id       uuid,
  title         text,
  timezone      text,
  quiet_hours   jsonb,
  subscriptions jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_owners uuid[];
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Only the owner's identities (Vault `stash_owner_ids`); nothing while it is unset.
  v_owners := stash.owner_ids();
  return query
  select r.id,
         r.user_id,
         r.save_id,
         coalesce(i.title, s.title, pg_catalog.left(s.caption, 80), 'A save you wanted back')::text,
         coalesce(st.timezone, 'Africa/Casablanca')::text,
         coalesce(st.quiet_hours, '{}'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
                     from stash.push_subscriptions p where p.user_id = r.user_id), '[]'::jsonb)
    from stash.reminders r
    join stash.saves s on s.id = r.save_id and s.user_id = r.user_id
    left join stash.insights i on i.save_id = r.save_id
    left join stash.settings st on st.user_id = r.user_id
   where r.user_id = any (v_owners)
     and r.kind = 'time'::stash.reminder_kind
     and not r.fired
     and r.fire_at is not null
     and r.fire_at <= pg_catalog.now()
   order by r.fire_at
   limit 200;
end;
$$;

grant execute on function stash.cron_due_reminders(text) to anon;

-- Claims reminders before the route sends them: returns only the ids this call
-- flipped, so two overlapping runs never push the same reminder twice.
create or replace function stash.cron_mark_fired(p_secret text, p_ids uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  update stash.reminders r set fired = true
   where r.id = any (p_ids) and not r.fired
  returning r.id;
end;
$$;

grant execute on function stash.cron_mark_fired(text, uuid[]) to anon;

-- Endpoints the push service says are gone (404/410).
create or replace function stash.cron_drop_subscriptions(p_secret text, p_endpoints text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from stash.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

grant execute on function stash.cron_drop_subscriptions(text, text[]) to anon;


-- -----------------------------------------------------------------------------
-- Daily queue for the cron route. The route runs the same builder as the app
-- (lib/dailyQueue.ts) on these candidates, then stores the result.
-- Users are due once their queue_time has passed in their time zone and they
-- have no queue for that local day yet.
-- -----------------------------------------------------------------------------
create or replace function stash.cron_daily_candidates(p_secret text)
returns table (
  user_id       uuid,
  day           date,
  minutes       int,
  saves         jsonb,
  subscriptions jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_owners uuid[];
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Only the owner's identities (Vault `stash_owner_ids`); nothing while it is unset.
  v_owners := stash.owner_ids();
  return query
  with zoned as (
    -- Defensive: a zone Postgres doesn't know would make `at time zone` throw for everyone
    -- (the settings trigger already refuses them).
    select st.user_id, st.queue_minutes, st.queue_time,
           (pg_catalog.now() at time zone z.name) as local_now
      from stash.settings st
      join pg_catalog.pg_timezone_names z on z.name = coalesce(st.timezone, 'Africa/Casablanca')
     where st.user_id = any (v_owners)
  ),
  due as (
    select zd.user_id, zd.local_now::date as day, zd.queue_minutes as minutes
      from zoned zd
     -- Built once the queue time has passed, and at the latest in the day's last hour
     -- (a queue time after the last hourly tick would otherwise never come).
     where zd.local_now::time >= zd.queue_time
        or pg_catalog.date_part('hour', zd.local_now) >= 23
  )
  select d.user_id,
         d.day,
         d.minutes,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', s.id,
                    'status', s.status,
                    'savedAt', s.saved_at,
                    'duration', s.duration_s,
                    'spaceId', s.space_id,
                    'spaceKind', sp.kind,
                    'spaceDueDate', sp.due_date,
                    'watchedAt', x.watched_at,
                    'archivedAt', x.archived_at,
                    'kept', coalesce(x.kept, false),
                    'appliedAt', x.applied_at,
                    'skipCount', coalesce(x.skip_count, 0),
                    'hasDueCard', exists (select 1 from stash.cards c
                                           where c.save_id = s.id and c.due_at <= pg_catalog.now())))
             from stash.saves s
             left join stash.states x  on x.save_id = s.id
             left join stash.spaces sp on sp.id = s.space_id
            where s.user_id = d.user_id
              and s.status in ('ready'::stash.save_status, 'failed'::stash.save_status, 'dead_link'::stash.save_status)
              and x.archived_at is null
         ), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth))
                     from stash.push_subscriptions p where p.user_id = d.user_id), '[]'::jsonb)
    from due d
   where not exists (select 1 from stash.daily_queues q where q.user_id = d.user_id and q.day = d.day)
     and exists (select 1 from stash.saves s where s.user_id = d.user_id)
   limit 100;
end;
$$;

grant execute on function stash.cron_daily_candidates(text) to anon;

create or replace function stash.cron_store_daily(
  p_secret text, p_user_id uuid, p_day date, p_save_ids uuid[], p_minutes int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not stash.cron_ok(p_secret) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not (p_user_id = any (stash.owner_ids())) then
    return false;
  end if;
  v_ids := coalesce(array(select u.id from pg_catalog.unnest(p_save_ids) with ordinality as u(id, n)
                           where exists (select 1 from stash.saves s where s.id = u.id and s.user_id = p_user_id)
                           order by u.n), '{}');
  -- Nothing to show yet but saves still processing: leave the day open, the next
  -- tick (or opening Today) builds it once they are ready.
  if pg_catalog.cardinality(v_ids) = 0
     and exists (select 1 from stash.saves s
                  where s.user_id = p_user_id
                    and s.status in ('queued'::stash.save_status, 'processing'::stash.save_status)) then
    return false;
  end if;
  -- Only the owner's own saves; never overwrite a queue the app already built.
  insert into stash.daily_queues (user_id, day, save_ids, minutes)
  values (p_user_id, p_day, v_ids, greatest(1, least(coalesce(p_minutes, 6), 120)))
  on conflict (user_id, day) do nothing;
  return found;
end;
$$;

grant execute on function stash.cron_store_daily(text, uuid, date, uuid[], int) to anon;


-- -----------------------------------------------------------------------------
-- Schedules. cron.schedule() updates a job that already has the name.
-- -----------------------------------------------------------------------------
select cron.schedule('stash-reminders', '*/5 * * * *', $$select stash.call_app('/api/cron/reminders');$$);
select cron.schedule('stash-daily',     '2 * * * *',   $$select stash.call_app('/api/cron/daily');$$);


-- -----------------------------------------------------------------------------
-- Realtime: Learn waits for the worker's grade (reviews), Today for its queue.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['reviews', 'daily_queues', 'syntheses']
    loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'stash' and tablename = t) then
        execute format('alter publication supabase_realtime add table stash.%I', t);
      end if;
    end loop;
  end if;
end
$$;

notify pgrst, 'reload schema';
