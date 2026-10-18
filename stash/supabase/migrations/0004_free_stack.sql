-- =============================================================================
-- Stash · 0004 · Free stack (no paid service, no card anywhere)
--
--   * Videos live in Supabase Storage (private bucket `stash-videos`, one folder
--     per user) instead of Cloudflare R2. The worker keeps the bucket under a
--     quota; a video it clears still plays from the platform's embed.
--   * The worker runs on GitHub Actions instead of Cloud Run. wake_worker()
--     starts the workflow through GitHub's API when the Vault URL points there:
--       stash_worker_url    = https://api.github.com/repos/<owner>/<repo>/actions/workflows/<file>/dispatches
--       stash_worker_secret = a fine-grained GitHub token (Actions: read and write, this repo only)
--     A plain https URL still works the old way (POST <url>/run with a Bearer secret).
--   * The sweep wakes the worker at most every 3 minutes, and not while a job runs.
-- Additive: safe to run more than once.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Video bucket: private, MP4 only, 50 MB per file (the free plan's upload limit)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stash-videos', 'stash-videos', false, 52428800, array['video/mp4'])
on conflict (id) do nothing;

-- The owner can read (sign links to) their own videos; only the worker writes them.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'storage' and tablename = 'objects' and policyname = 'stash_own_read_videos') then
    create policy "stash_own_read_videos" on storage.objects
      for select to authenticated
      using (bucket_id = 'stash-videos'
             and (storage.foldername(name))[1] = (select auth.uid())::text);
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Deleted save → its video goes to the storage trash (was R2)
-- -----------------------------------------------------------------------------
create or replace function stash.on_save_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := old.user_id::text || '/';
begin
  -- Only files inside the owner's own folder, so a tampered path can't delete someone else's file.
  if old.video_path is not null and pg_catalog.starts_with(old.video_path, v_prefix) then
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-videos', old.video_path);
  end if;
  if old.thumb_path is not null and pg_catalog.starts_with(old.thumb_path, v_prefix) then
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-thumbs', old.thumb_path);
  end if;
  if old.voice_note_path is not null and pg_catalog.starts_with(old.voice_note_path, v_prefix) then
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-voice', old.voice_note_path);
  end if;
  return old;
end;
$$;


-- -----------------------------------------------------------------------------
-- When the worker was last woken (throttles the sweep)
-- -----------------------------------------------------------------------------
create table if not exists stash.worker_state (
  id           int primary key default 1 check (id = 1),
  last_wake_at timestamptz
);
comment on table stash.worker_state is 'One row: when the worker was last started. Read by the sweep.';
alter table stash.worker_state enable row level security;  -- no policies: service_role only
insert into stash.worker_state (id) values (1) on conflict (id) do nothing;


-- -----------------------------------------------------------------------------
-- Wake-up: GitHub Actions (workflow dispatch) or an HTTP worker
-- -----------------------------------------------------------------------------
create or replace function stash.wake_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  -- No caller check: a save from the phone reaches this through triggers. The secret stays in Vault.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'stash_worker_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'stash_worker_secret' limit 1;

  if v_url is null or v_secret is null then
    return;  -- worker not configured yet: jobs wait in the queue
  end if;

  update stash.worker_state set last_wake_at = pg_catalog.now() where id = 1;

  if pg_catalog.starts_with(v_url, 'https://api.github.com/') then
    -- Starts the workflow; GitHub answers in about a second and the run does the work.
    perform net.http_post(
      url                  := v_url,
      body                 := jsonb_build_object('ref', 'main'),
      headers              := jsonb_build_object(
                                'Content-Type', 'application/json',
                                'Accept', 'application/vnd.github+json',
                                'X-GitHub-Api-Version', '2022-11-28',
                                'User-Agent', 'stash-db',
                                'Authorization', 'Bearer ' || v_secret),
      timeout_milliseconds := 15000
    );
  else
    perform net.http_post(
      url                  := rtrim(v_url, '/') || '/run',
      body                 := '{}'::jsonb,
      headers              := jsonb_build_object(
                                'Content-Type', 'application/json',
                                'Authorization', 'Bearer ' || v_secret),
      -- Held open for the whole run: a request-based host only gives CPU while a request is open.
      timeout_milliseconds := 900000
    );
  end if;
exception when others then
  -- A failed wake-up must never block a save; the cron sweep retries.
  return;
end;
$$;
comment on function stash.wake_worker() is
  'Starts the worker: GitHub workflow dispatch, or POST <url>/run. No-op until the Vault secrets exist.';


-- -----------------------------------------------------------------------------
-- Sweep (every minute): unstick jobs, wake the worker when work waits
-- -----------------------------------------------------------------------------
create or replace function stash.sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed';
  end if;
  update stash.jobs
     set state = 'queued'::stash.job_state,
         locked_at = null,
         run_after = pg_catalog.now()
   where state = 'running'::stash.job_state
     and locked_at < pg_catalog.now() - interval '40 minutes'  -- longer than a worker run can live
     and attempts < 4;

  update stash.jobs
     set state = 'failed'::stash.job_state,
         error = coalesce(error, 'timed out')
   where state = 'running'::stash.job_state
     and locked_at < pg_catalog.now() - interval '40 minutes'
     and attempts >= 4;

  -- A run in progress picks up queued work by itself.
  if exists (select 1 from stash.jobs where state = 'running'::stash.job_state) then
    return;
  end if;

  select last_wake_at into v_last from stash.worker_state where id = 1;
  if v_last is not null and v_last > pg_catalog.now() - interval '3 minutes' then
    return;
  end if;

  if exists (select 1 from stash.jobs
              where state = 'queued'::stash.job_state and run_after <= pg_catalog.now())
     or (exists (select 1 from stash.media_trash)
         and (v_last is null or v_last < pg_catalog.now() - interval '30 minutes')) then
    perform stash.wake_worker();
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- Worker settings from Vault, so GitHub only needs the service key.
-- Secret names (all optional): stash_groq_api_key, stash_groq_insights_model,
-- stash_voyage_api_key, stash_owner_user_ids, stash_instagram_cookies_b64.
-- Returned with the "stash_" prefix removed. service_role only.
-- -----------------------------------------------------------------------------
create or replace function stash.worker_config()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed';
  end if;
  return (
    select coalesce(jsonb_object_agg(pg_catalog.substr(name, 7), decrypted_secret), '{}'::jsonb)
      from vault.decrypted_secrets
     where name in ('stash_groq_api_key', 'stash_groq_insights_model', 'stash_voyage_api_key',
                    'stash_owner_user_ids', 'stash_instagram_cookies_b64')
  );
end;
$$;
comment on function stash.worker_config() is 'Worker settings kept in Vault (service_role only).';
revoke all on function stash.worker_config() from public, anon, authenticated;
grant execute on function stash.worker_config() to service_role;
