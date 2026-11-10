-- =============================================================================
-- Stash · 0006 · delight (Phase 4)
--
--   * Galaxy: job type `galaxy`; `galaxy_points` (one dot per save), `galaxy_clusters`
--     (labelled groups) and `galaxy_layouts` (when each owner's layout was built),
--     written by the worker, read-only for the phone. A new embedding queues a
--     `galaxy` job once 5+ embeddings arrived since the last layout (one waiting
--     job per user at most).
--   * Screenshots: the phone may upload into its own `stash-thumbs/<uid>/screenshots/`
--     folder (the worker reads it with Claude vision and uses it as the thumbnail).
--   * Context reminders: `reminders.rule` (weekend morning, next evening open, when
--     I open Learn). Time-based rules carry a fire_at, so the 5-minute cron sends them
--     like time reminders; the others are fired by the phone.
--   * Saved Wrapped: `stash.wrapped(month)` (runs as the caller, RLS applies).
--   * Identity cleanup: anonymous users older than 3 days that never saved anything
--     and never changed a setting are deleted daily (pg_cron, SECURITY DEFINER,
--     not callable through the API).
--   * usage.kind gains 'galaxy' (cluster labels).
--   * Ends with the explicit function-privilege block for the whole schema (0001-0006).
--
-- Re-runnable: every statement is guarded or idempotent.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enum value. Added inside the migration's transaction, so nothing below uses it
-- as a literal at plan time (functions reference it only when they run).
-- -----------------------------------------------------------------------------
alter type stash.job_type add value if not exists 'galaxy';


-- -----------------------------------------------------------------------------
-- Galaxy tables (worker writes with service_role; the phone reads its own rows)
-- -----------------------------------------------------------------------------
create table if not exists stash.galaxy_points (
  save_id    uuid primary key references stash.saves (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  x          double precision not null,
  y          double precision not null,
  cluster    int not null,
  created_at timestamptz not null default now()
);
comment on table stash.galaxy_points is 'Galaxy lens: a save''s 2D position (-1..1) and its cluster, from its embedding.';
create index if not exists galaxy_points_user_idx on stash.galaxy_points (user_id, cluster);

create table if not exists stash.galaxy_clusters (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cluster    int not null,
  label      text not null,
  cx         double precision not null,
  cy         double precision not null,
  size       int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, cluster)
);
comment on table stash.galaxy_clusters is 'Galaxy lens: one labelled group of similar saves (centre and member count).';

create table if not exists stash.galaxy_layouts (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  built_at   timestamptz not null default now(),
  points     int not null default 0
);
comment on table stash.galaxy_layouts is 'When the owner''s Galaxy was last laid out; new embeddings after built_at count toward the next one.';

do $$
declare
  t text;
begin
  foreach t in array array['galaxy_points', 'galaxy_clusters', 'galaxy_layouts']
  loop
    execute format('alter table stash.%I enable row level security', t);
    execute format('drop policy if exists "owner_read" on stash.%I', t);
    execute format(
      'create policy "owner_read" on stash.%I for select to authenticated '
      'using ((select auth.uid()) = user_id)', t);
    -- Read-only for the phone; the worker (service_role) bypasses RLS.
    execute format('revoke insert, update, delete, truncate on stash.%I from authenticated', t);
    execute format('grant select on stash.%I to authenticated', t);
    execute format('grant all on stash.%I to service_role', t);
    execute format('revoke all on stash.%I from anon', t);
  end loop;
end
$$;

-- Same owner on references (0004's generic guard).
drop trigger if exists zz_same_owner on stash.galaxy_points;
create trigger zz_same_owner before insert or update on stash.galaxy_points
  for each row execute function stash.guard_same_owner('save_id');


-- -----------------------------------------------------------------------------
-- Queue a galaxy layout after 5+ new embeddings (debounced: one waiting job per user)
-- -----------------------------------------------------------------------------
create or replace function stash.maybe_galaxy(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
  v_new   int;
begin
  if p_user_id is null then
    return;
  end if;
  -- One queued job is enough. A running one doesn't count: it read the embeddings
  -- when it started, so newer ones need one queued follow-up (at most one).
  if exists (select 1 from stash.jobs j
              where j.user_id = p_user_id
                and j.type = 'galaxy'::stash.job_type
                and j.state = 'queued'::stash.job_state) then
    return;
  end if;

  select gl.built_at into v_since from stash.galaxy_layouts gl where gl.user_id = p_user_id;

  select count(*) into v_new
    from stash.embeddings e
   where e.user_id = p_user_id
     and e.created_at > coalesce(v_since, '-infinity'::timestamptz);

  if v_new >= 5 then
    insert into stash.jobs (user_id, type)
    values (p_user_id, 'galaxy'::stash.job_type);
  end if;
end;
$$;

comment on function stash.maybe_galaxy(uuid) is
  'Queues a galaxy job when 5+ embeddings arrived since the last layout and none is queued (a running one gets one follow-up).';

create or replace function stash.on_embedding_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform stash.maybe_galaxy(new.user_id);
  return new;
end;
$$;

drop trigger if exists on_embedding_created on stash.embeddings;
create trigger on_embedding_created
  after insert on stash.embeddings
  for each row execute function stash.on_embedding_created();

-- The phone refreshes the Galaxy when its layout row changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'stash' and tablename = 'galaxy_layouts') then
    alter publication supabase_realtime add table stash.galaxy_layouts;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- usage.kind: add 'galaxy' while keeping whatever earlier migrations allowed
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

  -- Every kind known so far, plus whatever the current constraint allows. Postgres
  -- prints the check either as ARRAY['a'::text, …] or as '{a,b}'::text[], so both
  -- forms are read (reading only the first collapsed the list to one kind).
  select pg_catalog.array_agg(distinct k order by k) into v_kinds
    from (
      select pg_catalog.unnest(array['transcribe', 'understand', 'embed', 'synthesize', 'search', 'grade', 'export', 'galaxy']) as k
      union
      select m[1] from pg_catalog.regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''', 'g') as m
      union
      select t from pg_catalog.regexp_split_to_table(
               coalesce(pg_catalog.substring(v_def, '''\{([a-z_,]+)\}'''), ''), ',') as t
    ) x
   where k <> '';

  if v_con is not null then
    execute format('alter table stash.usage drop constraint %I', v_con);
  end if;
  execute format('alter table stash.usage add constraint usage_kind_check check (kind = any (%L::text[]))', v_kinds);
end
$$;


-- -----------------------------------------------------------------------------
-- Screenshots shared to Stash: <uid>/screenshots/<client_id>.jpg in stash-thumbs.
-- Upload is allowed only into that folder (thumbnails stay worker-only).
-- -----------------------------------------------------------------------------
drop policy if exists "stash_own_screenshot_insert" on storage.objects;
create policy "stash_own_screenshot_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stash-thumbs'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (storage.foldername(name))[2] = 'screenshots');

-- Upsert on a retried upload needs update too (same folder only).
drop policy if exists "stash_own_screenshot_update" on storage.objects;
create policy "stash_own_screenshot_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'stash-thumbs'
         and (storage.foldername(name))[1] = (select auth.uid())::text
         and (storage.foldername(name))[2] = 'screenshots')
  with check (bucket_id = 'stash-thumbs'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (storage.foldername(name))[2] = 'screenshots');


-- -----------------------------------------------------------------------------
-- Context reminders
--   rule = {"type": "weekend_morning"}   fire_at set by the phone (next Sat/Sun 09:00 local)
--          {"type": "evening_open"}      fired by the phone on the next open between 18:00 and 23:00
--          {"type": "learn_open"}        fired by the phone when Learn opens
-- -----------------------------------------------------------------------------
alter table stash.reminders add column if not exists rule jsonb;
comment on column stash.reminders.rule is 'kind = context: {"type": "weekend_morning" | "evening_open" | "learn_open"}.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reminders_rule_check'
                  and conrelid = 'stash.reminders'::regclass) then
    alter table stash.reminders add constraint reminders_rule_check
      check (rule is null
             or (jsonb_typeof(rule) = 'object'
                 and rule->>'type' in ('weekend_morning', 'evening_open', 'learn_open')));
  end if;
end
$$;

-- The cron route now also sends time-based context reminders (they carry a fire_at).
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
     and r.kind in ('time'::stash.reminder_kind, 'context'::stash.reminder_kind)
     and not r.fired
     and r.fire_at is not null
     and r.fire_at <= pg_catalog.now()
   order by r.fire_at
   limit 200;
end;
$$;


-- -----------------------------------------------------------------------------
-- Saved Wrapped: one month in numbers, in the owner's time zone.
-- Runs as the caller, so RLS keeps it to their own rows.
-- -----------------------------------------------------------------------------
create or replace function stash.wrapped(p_month date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz    text;
  v_from  timestamptz;
  v_to    timestamptz;
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
begin
  select coalesce(st.timezone, 'Africa/Casablanca') into v_tz
    from stash.settings st where st.user_id = (select auth.uid());
  -- A zone Postgres doesn't know would throw below (the settings trigger refuses them too).
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    v_tz := 'Africa/Casablanca';
  end if;
  v_from := (v_month::timestamp) at time zone v_tz;
  v_to   := ((v_month + interval '1 month')::timestamp) at time zone v_tz;

  return jsonb_build_object(
    'month',   to_char(v_month, 'YYYY-MM-DD'),
    'saved',   (select count(*) from stash.saves s where s.saved_at >= v_from and s.saved_at < v_to),
    'watched', (select count(*) from stash.states t where t.watched_at >= v_from and t.watched_at < v_to),
    'applied', (select count(*) from stash.states t where t.applied_at >= v_from and t.applied_at < v_to),
    'kept',    (select count(*) from stash.states t join stash.saves s on s.id = t.save_id
                 where t.kept and s.saved_at >= v_from and s.saved_at < v_to),
    'recalled', (select count(*) from stash.reviews rv where rv.answered_at >= v_from and rv.answered_at < v_to),
    'top_spaces', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'color', x.color_token, 'count', x.n)
                       order by x.n desc, x.name)
        from (select sp.id, sp.name, sp.color_token, count(*) as n
                from stash.saves s join stash.spaces sp on sp.id = s.space_id
               where s.saved_at >= v_from and s.saved_at < v_to and sp.kind <> 'inbox'::stash.space_kind
               group by sp.id, sp.name, sp.color_token
               order by n desc, sp.name
               limit 3) x), '[]'::jsonb),
    'top_creators', coalesce((
      select jsonb_agg(jsonb_build_object('handle', x.handle, 'count', x.n) order by x.n desc, x.handle)
        from (select s.creator_handle as handle, count(*) as n
                from stash.saves s
               where s.saved_at >= v_from and s.saved_at < v_to
                 and coalesce(s.creator_handle, '') <> ''
               group by s.creator_handle
               order by n desc, s.creator_handle
               limit 3) x), '[]'::jsonb)
  );
end;
$$;

comment on function stash.wrapped(date) is
  'Saved Wrapped for the caller: saved, watched, applied, kept, recalled, top Spaces and creators of one month.';


-- -----------------------------------------------------------------------------
-- Identity cleanup: empty anonymous users older than 3 days.
-- Before Phase 4 the server created an identity on any GET (link previews, bots).
-- Only anonymous users are touched; a user who saved anything, made a Space,
-- subscribed to push or changed a setting is kept.
-- -----------------------------------------------------------------------------
create or replace function stash.cleanup_anonymous_users(p_limit int default 500)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  with doomed as (
    select u.id
      from auth.users u
     where u.is_anonymous
       and not (u.id = any (stash.owner_ids()))  -- never the owner's devices
       and u.created_at < pg_catalog.now() - interval '3 days'
       and not exists (select 1 from stash.saves s where s.user_id = u.id)
       and not exists (select 1 from stash.spaces sp where sp.user_id = u.id and sp.kind <> 'inbox'::stash.space_kind)
       and not exists (select 1 from stash.push_subscriptions p where p.user_id = u.id)
       and not exists (select 1 from stash.settings st where st.user_id = u.id and st.updated_at <> st.created_at)
     order by u.created_at
     limit greatest(1, least(coalesce(p_limit, 500), 5000))
  )
  delete from auth.users u using doomed d where u.id = d.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function stash.cleanup_anonymous_users(int) is
  'Daily (pg_cron): deletes anonymous auth users > 3 days old with no saves, Spaces, push or settings changes.';

select cron.schedule('stash-cleanup-anonymous', '23 3 * * *', $$select stash.cleanup_anonymous_users();$$);


-- No backfill here: Postgres refuses the new 'galaxy' value inside the transaction
-- that added it. An owner with 5+ embeddings gets the first layout with the next
-- processed save (nothing was laid out yet, so every embedding counts as new), or
-- at once with:  select stash.maybe_galaxy('<user id>');  (SQL editor, after this
-- migration has committed).


-- -----------------------------------------------------------------------------
-- Function privileges for the whole schema (0001-0006), explicit per function.
-- Same rule as 0005: revoke everything, then grant each function to the narrowest
-- role that needs it. New in 0006:
--   authenticated: wrapped
--   service_role:  owner_ids (0004; Vault `stash_owner_ids`)
--   nobody else:   maybe_galaxy, on_embedding_created (trigger),
--                  cleanup_anonymous_users (pg_cron runs it as postgres),
--                  guard_same_owner, guard_settings_timezone (0004, triggers)
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
grant execute on function stash.wrapped(date)                                                  to authenticated;

grant execute on function stash.cron_vapid(text)                                               to anon;
grant execute on function stash.cron_set_vapid(text, text, text)                               to anon;
grant execute on function stash.cron_due_reminders(text)                                       to anon;
grant execute on function stash.cron_mark_fired(text, uuid[])                                  to anon;
grant execute on function stash.cron_drop_subscriptions(text, text[])                          to anon;
grant execute on function stash.cron_daily_candidates(text)                                    to anon;
grant execute on function stash.cron_store_daily(text, uuid, date, uuid[], int)                to anon;
grant execute on function stash.get_collection(text)                                           to anon;
grant execute on function stash.is_shared_thumb(text)                                          to anon;

-- Server-side only (also covered by the service_role grant above, listed to be explicit).
grant execute on function stash.owner_ids()                                                    to service_role;
grant execute on function stash.cleanup_anonymous_users(int)                                   to service_role;

-- cleanup_anonymous_users stays with service_role only (granted above) and pg_cron (postgres);
-- it also refuses any other caller itself.

grant usage on schema stash to anon;
revoke all on all tables    in schema stash from anon;
revoke all on all sequences in schema stash from anon;

notify pgrst, 'reload schema';
