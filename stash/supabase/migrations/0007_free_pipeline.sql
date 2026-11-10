-- =============================================================================
-- Stash · 0007 · free pipeline
--
-- Everything the "$0, no card, few setup steps" rework needs in the database.
-- The contract for the worker, the Edge Functions and the app is
-- docs/CONTRACT_0007.md; this file is its source of truth for SQL.
--
--   * Worker on a Vercel function, woken by pg_net with a token the database
--     made itself (Vault `stash_worker_token`). No service key leaves Supabase:
--     the Edge Function `stash-worker-proxy` checks the token with
--     worker_token_ok() and relays the worker's calls.
--   * worker_config(): keys (Vault), owner ids (Vault) and settings
--     (`stash.config`) in one service-only call.
--   * Embeddings are 384 dims (built-in gte-small in an Edge Function); the
--     vector column, its index and ask_context() follow.
--   * Videos live in the private Storage bucket `stash-video`
--     (<user_id>/<save_id>.mp4, owner may read). evict_videos() keeps the
--     bucket under a cap (default 800 MB), oldest archived / not-kept first.
--   * saves: process_step (live progress), video_state, playback, embed_url,
--     video_bytes, ai_state. A save is `ready` even with no video and no AI;
--     the sweep re-queues insights once an AI key exists, or a little later
--     when the provider was busy or the worker ran out of time (`retry`).
--   * The sweep also ends what a dead worker left behind: a job that timed out
--     four times fails, and its save (or ask) fails with it instead of spinning.
--   * Phones may queue only `grade` and `reprocess` jobs, in their initial state;
--     new saves, phone jobs and asks are capped per identity.
--   * New tables: config, rate_limits, asks, highlights, backups, recovery.
--   * syntheses.tag + a synthesize job when a tag reaches 5+ ready saves.
--   * auto_collections(): collections from tags / creators / places / intent.
--   * Weekly JSON backup job per owner; `stash-exports` accepts JSON.
--   * Ends with the explicit function-privilege block for the whole schema.
--
-- Re-runnable: every statement is guarded or idempotent.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Enum values. Added inside the migration's transaction, so nothing below uses
-- them at plan time (only plpgsql bodies, which resolve them when they run).
-- -----------------------------------------------------------------------------
alter type stash.job_type add value if not exists 'ask';
alter type stash.job_type add value if not exists 'backup';


-- -----------------------------------------------------------------------------
-- config: non-secret settings for the worker and the SQL jobs. Service only.
-- Model ids are rows here (set with SQL after deploy), never in a file.
-- -----------------------------------------------------------------------------
create table if not exists stash.config (
  key        text primary key check (key ~ '^[a-z0-9_]{1,60}$'),
  value      text not null check (length(value) <= 2000),
  note       text,
  updated_at timestamptz not null default now()
);

comment on table stash.config is
  'Non-secret settings read by the worker (worker_config) and SQL jobs. Service only; set with SQL.';

alter table stash.config enable row level security;  -- no policies: service_role only
revoke all on stash.config from anon, authenticated;
grant  all on stash.config to service_role;

insert into stash.config (key, value, note) values
  ('ai_provider',        'auto',  'auto | gemini | claude | none. auto = first provider that has a key and a model id.'),
  ('transcribe_provider','auto',  'auto | gemini | groq | none.'),
  ('video_cap_mb',       '800',   'evict_videos() keeps stash-video under this many MB.'),
  ('video_max_mb',       '45',    'Largest single video the worker stores (bucket limit is 50 MB).'),
  ('max_video_seconds',  '600',   'Longer videos are not downloaded (video_state = too_big).'),
  ('youtube_download',   'off',   'on = also store YouTube videos; off = embed only.'),
  ('tag_synth_min',      '5',     'Ready saves a tag needs (since its last synthesis) to queue a tag synthesis.'),
  ('backup_keep',        '4',     'Weekly backups kept per owner.'),
  ('ask_daily_limit',    '40',    'Questions per identity per 24 hours.'),
  ('save_hourly_limit',  '300',   'New saves per identity per hour (owner identities are not limited).'),
  ('job_hourly_limit',   '120',   'Grade / reprocess jobs a phone may queue per identity per hour.'),
  ('run_budget_seconds', '240',   'The worker stops claiming jobs after this long inside one /run.'),
  ('worker_max_seconds', '300',   'The worker function''s maximum duration (maxDuration in worker/vercel.json). Change both together.')
on conflict (key) do nothing;

-- Internal reader with a default.
create or replace function stash.cfg(p_key text, p_default text default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value from stash.config c where c.key = p_key), p_default);
$$;

comment on function stash.cfg(text, text) is 'Internal: one stash.config value, or the default.';


-- -----------------------------------------------------------------------------
-- saves: progress, video and playback state
-- -----------------------------------------------------------------------------
alter table stash.saves add column if not exists process_step text not null default 'queued';
alter table stash.saves add column if not exists video_state  text not null default 'none';
alter table stash.saves add column if not exists playback     text not null default 'link';
alter table stash.saves add column if not exists embed_url    text;
alter table stash.saves add column if not exists video_bytes  bigint;
alter table stash.saves add column if not exists ai_state     text not null default 'pending';

alter table stash.saves drop constraint if exists saves_process_step_check;
alter table stash.saves add  constraint saves_process_step_check
  check (process_step in ('queued', 'fetching', 'watching', 'reading', 'filing', 'ready'));

alter table stash.saves drop constraint if exists saves_video_state_check;
alter table stash.saves add  constraint saves_video_state_check
  check (video_state in ('none', 'stored', 'blocked', 'too_big', 'evicted'));

alter table stash.saves drop constraint if exists saves_playback_check;
alter table stash.saves add  constraint saves_playback_check
  check (playback in ('video', 'embed', 'link', 'none'));

alter table stash.saves drop constraint if exists saves_ai_state_check;
alter table stash.saves add  constraint saves_ai_state_check
  check (ai_state in ('pending', 'done', 'no_key', 'retry', 'not_owner', 'over_budget', 'failed'));

-- The app puts embed_url in an iframe: only the three official players, ever.
alter table stash.saves drop constraint if exists saves_embed_url_check;
alter table stash.saves add  constraint saves_embed_url_check check (
  embed_url is null
  or (length(embed_url) <= 300 and embed_url ~
      '^https://(www\.tiktok\.com/player/v1/[0-9]{5,25}|www\.instagram\.com/(p|reel|tv)/[A-Za-z0-9_-]{5,40}/embed|www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{6,20})$')
);

-- A stored video always has a path, and "video" playback always has a stored video.
alter table stash.saves drop constraint if exists saves_video_consistent;
alter table stash.saves add  constraint saves_video_consistent check (
  (video_state = 'stored') = (video_path is not null)
  and (playback <> 'video' or video_state = 'stored')
  and (playback <> 'embed' or embed_url is not null)
) not valid;

comment on column stash.saves.process_step is 'Live progress: queued → fetching → watching → reading → filing → ready.';
comment on column stash.saves.video_state  is 'none | stored (video_path set) | blocked (platform refused) | too_big | evicted (retention).';
comment on column stash.saves.playback     is 'What Play shows: video (our MP4) | embed (embed_url iframe) | link (open source_url) | none (screenshot, article).';
comment on column stash.saves.embed_url    is 'Official player iframe URL built by the worker from source_url (TikTok, Instagram, YouTube).';
comment on column stash.saves.video_bytes  is 'Size of the stored MP4; evict_videos() sums it.';
comment on column stash.saves.ai_state     is 'pending | done | no_key (re-queued by the sweep once a key exists) | retry (provider busy or out of time: re-queued by the sweep) | not_owner | over_budget | failed.';

create index if not exists saves_video_stored_idx on stash.saves (saved_at) where video_path is not null;
create index if not exists saves_ai_waiting_idx   on stash.saves (user_id) where ai_state in ('no_key', 'retry');

-- Rows from before 0007 (the worker never ran in production; this only matters for dev data).
update stash.saves set process_step = 'ready' where status in ('ready', 'failed', 'dead_link') and process_step = 'queued';
update stash.saves set video_state = 'stored', playback = 'video' where video_path is not null and video_state = 'none';
alter table stash.saves validate constraint saves_video_consistent;


-- The phone still writes only its own columns (0003). New worker-owned columns
-- are kept; a status reset to `queued` (request_reprocess) also resets the step.
create or replace function stash.guard_save_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;  -- worker, cron, triggers, dashboard
  end if;
  if tg_op = 'INSERT' then
    new.video_path   := null;
    new.thumb_path   := null;
    new.processed_at := null;
    new.error        := null;
    new.status       := 'queued'::stash.save_status;
    new.process_step := 'queued';
    new.video_state  := 'none';
    new.playback     := 'link';
    new.embed_url    := null;
    new.video_bytes  := null;
    new.ai_state     := 'pending';
  else
    new.video_path     := old.video_path;
    new.thumb_path     := old.thumb_path;
    new.caption        := old.caption;
    new.creator_handle := old.creator_handle;
    new.duration_s     := old.duration_s;
    new.processed_at   := old.processed_at;
    new.source_url     := old.source_url;
    new.platform       := old.platform;
    new.client_id      := old.client_id;
    new.title          := old.title;
    new.video_state    := old.video_state;
    new.playback       := old.playback;
    new.embed_url      := old.embed_url;
    new.video_bytes    := old.video_bytes;
    new.ai_state       := old.ai_state;
    new.process_step   := case
                            when new.status = 'queued'::stash.save_status
                                 and old.status is distinct from new.status then 'queued'
                            else old.process_step
                          end;
  end if;
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- rate_limits: fixed-window counters for the Edge Functions and for the hourly
-- caps on a phone's saves and jobs (service only).
-- -----------------------------------------------------------------------------
create table if not exists stash.rate_limits (
  subject      text not null check (length(subject) between 1 and 100),
  bucket       text not null check (length(bucket) between 1 and 40),
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (subject, bucket, window_start)
);

comment on table stash.rate_limits is 'Fixed-window counters used by stash-embed, stash-recovery and the hourly save / job caps. Service only.';

alter table stash.rate_limits enable row level security;  -- no policies
revoke all on stash.rate_limits from anon, authenticated;
grant  all on stash.rate_limits to service_role;

create or replace function stash.rate_limit_take(
  p_subject text, p_bucket text, p_max int, p_window_s int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  int;
  v_len    int := greatest(1, least(coalesce(p_window_s, 60), 86400));
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_window := pg_catalog.to_timestamp(pg_catalog.floor(extract(epoch from pg_catalog.now()) / v_len) * v_len);
  insert into stash.rate_limits as r (subject, bucket, window_start, count)
  values (pg_catalog.left(p_subject, 100), pg_catalog.left(p_bucket, 40), v_window, 1)
  on conflict (subject, bucket, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  if pg_catalog.random() < 0.02 then
    delete from stash.rate_limits where window_start < pg_catalog.now() - interval '2 days';
  end if;
  return v_count <= greatest(1, coalesce(p_max, 1));
end;
$$;

comment on function stash.rate_limit_take(text, text, int, int) is
  'Service only: counts one hit for (subject, bucket) in the current window; false when over p_max.';


-- New saves per identity per hour (config save_hourly_limit, default 300), so a
-- stranger's device cannot flood the queue. Counted in stash.rate_limits (the
-- server's clock; deleting saves does not give the hour back). Owner identities
-- are not limited (a data-export import can be thousands of links).
-- Fires only for statements a phone runs itself (see guard_job_insert below).
create or replace function stash.hourly_take(p_user_id uuid, p_bucket text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into stash.rate_limits as r (subject, bucket, window_start, count)
  values ('u:' || p_user_id::text, p_bucket, pg_catalog.date_trunc('hour', pg_catalog.now()), 1)
  on conflict (subject, bucket, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  return v_count;
end;
$$;

comment on function stash.hourly_take(uuid, text) is
  'Internal (guards): counts one hit for a user in this clock hour and returns the count. A refused statement rolls its hit back.';

create or replace function stash.guard_save_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or v_uid = any (stash.owner_ids()) then
    return new;
  end if;
  if stash.hourly_take(v_uid, 'save') > greatest(1, stash.cfg('save_hourly_limit', '300')::int) then
    raise exception 'save limit reached' using errcode = '54000';
  end if;
  return new;
end;
$$;

comment on function stash.guard_save_rate() is
  'BEFORE INSERT on saves, only for statements a phone runs itself: at most save_hourly_limit new saves per hour (owners exempt). SQLSTATE 54000.';

drop trigger if exists guard_save_rate on stash.saves;
create trigger guard_save_rate
  before insert on stash.saves
  for each row
  when (current_user in ('authenticated', 'anon'))
  execute function stash.guard_save_rate();


-- -----------------------------------------------------------------------------
-- jobs: what a phone may queue. The app inserts `grade` jobs itself and
-- `reprocess` through request_reprocess() (which runs as the caller); every
-- other job is made by a SECURITY DEFINER trigger or function (ingest, export,
-- ask, synthesize, galaxy, backup, the sweep).
--
-- The trigger's WHEN looks at current_user, not auth.role(): inside a definer
-- function current_user is the function's owner even though the session still
-- carries the phone's JWT, so those inserts pass untouched, and a statement
-- the phone runs itself is the only thing guarded. The function itself is a
-- definer so it can read stash.config.
--
-- Phones can no longer update or delete jobs (the app never did); a deleted
-- save still takes its jobs with it (the cascade runs as the table owner).
-- -----------------------------------------------------------------------------
create or replace function stash.guard_job_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or new.user_id is distinct from v_uid then
    raise exception 'not yours' using errcode = '42501';
  end if;

  if new.type = 'reprocess'::stash.job_type then
    if new.save_id is null then
      raise exception 'reprocess needs a save' using errcode = '22023';
    end if;
    new.space_id := null;
    new.payload  := '{}'::jsonb;  -- the insights-only mode is the sweep's
    -- Already waiting or running for this save: nothing to add (Retry tapped twice).
    if exists (select 1 from stash.jobs j
                where j.save_id = new.save_id
                  and j.state in ('queued'::stash.job_state, 'running'::stash.job_state)
                  and (j.type = 'ingest'::stash.job_type
                       or (j.type = 'reprocess'::stash.job_type and coalesce(j.payload->>'mode', '') <> 'insights'))) then
      return null;
    end if;
  elsif new.type = 'grade'::stash.job_type then
    if new.save_id is null
       or pg_catalog.jsonb_typeof(new.payload) is distinct from 'object'
       or coalesce(new.payload->>'card_id', '') !~ '^[0-9a-fA-F-]{36}$'
       or pg_catalog.octet_length(new.payload::text) > 6000 then
      raise exception 'bad grade job' using errcode = '22023';
    end if;
    new.space_id := null;
    new.payload  := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                      'card_id',    new.payload->'card_id',
                      'audio_path', new.payload->'audio_path',
                      'text',       new.payload->'text'));
  else
    raise exception 'this job is not queued from a phone' using errcode = '42501';
  end if;

  if stash.hourly_take(v_uid, 'job') > greatest(1, stash.cfg('job_hourly_limit', '120')::int) then
    raise exception 'job limit reached' using errcode = '54000';
  end if;

  new.state      := 'queued'::stash.job_state;
  new.attempts   := 0;
  new.error      := null;
  new.locked_at  := null;
  new.run_after  := pg_catalog.now();
  new.created_at := pg_catalog.now();
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

comment on function stash.guard_job_insert() is
  'BEFORE INSERT on jobs, only for statements a phone runs itself: grade and reprocess only, initial state, hourly cap.';

drop trigger if exists guard_job_insert on stash.jobs;
create trigger guard_job_insert
  before insert on stash.jobs
  for each row
  when (current_user in ('authenticated', 'anon'))
  execute function stash.guard_job_insert();

revoke update, delete, truncate on stash.jobs from authenticated;


-- Deleted save → its files go to media_trash. Videos are in Storage now.
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
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-video', old.video_path);
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
-- Storage: private video bucket, <user_id>/<save_id>.mp4. The owner may read
-- (the phone signs its own URLs); only the worker writes, through signed upload
-- URLs made by stash-worker-proxy. 50 MB is the free plan's per-file limit.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stash-video', 'stash-video', false, 52428800, array['video/mp4'])
on conflict (id) do nothing;

drop policy if exists "stash_video_own_read" on storage.objects;
create policy "stash_video_own_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'stash-video' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Backups are JSON files in stash-exports/<user_id>/backups/.
update storage.buckets
   set allowed_mime_types = array[
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/json']
 where id = 'stash-exports';


-- -----------------------------------------------------------------------------
-- Embeddings: 384 dims (gte-small). Old vectors can't be converted, so they go
-- (the table is empty in production) and the save is embedded again next run.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from pg_catalog.pg_attribute a
     where a.attrelid = 'stash.embeddings'::regclass and a.attname = 'vector'
       and pg_catalog.format_type(a.atttypid, a.atttypmod) not like '%vector(384)'
  ) then
    execute 'drop index if exists stash.embeddings_vector_' || 'hnsw';
    delete from stash.galaxy_points;
    delete from stash.galaxy_clusters;
    delete from stash.galaxy_layouts;
    delete from stash.embeddings;
    alter table stash.embeddings alter column vector type extensions.vector(384);
  end if;
end
$$;

comment on table stash.embeddings is 'Embedding of title + key idea + caption + transcript (384 dims, gte-small via stash-embed).';

create index if not exists embeddings_vector_hnsw on stash.embeddings
  using hnsw (vector extensions.vector_cosine_ops);

-- Same signature as 0003 (a typmod is not part of it); only the default's type changes.
-- Body unchanged.
create or replace function stash.search_saves(
  p_query     text,
  p_space_id  uuid default null,
  p_embedding extensions.vector(384) default null,
  p_limit     int default 30
)
returns table (
  save_id       uuid,
  score         double precision,
  snippet       text,
  snippet_start double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select pg_catalog.websearch_to_tsquery('simple'::regconfig, coalesce(p_query, '')) as tsq,
           pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''))) as raw
  ),
  docs as (
    select s.id,
           pg_catalog.to_tsvector('simple'::regconfig,
             coalesce(s.caption, '') || ' ' || coalesce(s.title, '') || ' ' ||
             coalesce(s.creator_handle, '') || ' ' || coalesce(i.title, '') || ' ' ||
             coalesce(i.key_idea, '') || ' ' || coalesce(pg_catalog.array_to_string(i.tags, ' '), '') || ' ' ||
             coalesce(i.takeaways::text, '')) as meta_tsv,
           t.tsv as transcript_tsv,
           t.segments,
           e.vector
      from stash.saves s
      left join stash.insights    i on i.save_id = s.id
      left join stash.transcripts t on t.save_id = s.id
      left join stash.embeddings  e on e.save_id = s.id
     where p_space_id is null or s.space_id = p_space_id
  ),
  scored as (
    select d.id,
           (pg_catalog.ts_rank(d.meta_tsv, q.tsq) * 1.5
            + coalesce(pg_catalog.ts_rank(d.transcript_tsv, q.tsq), 0)
            + case when p_embedding is not null and d.vector is not null
                   then greatest(0, 1 - (d.vector operator(extensions.<=>) p_embedding)) * 2
                   else 0 end)::double precision as score,
           d.segments,
           (d.meta_tsv operator(pg_catalog.@@) q.tsq
            or coalesce(d.transcript_tsv operator(pg_catalog.@@) q.tsq, false)) as text_hit,
           -- gte-small scores unrelated text higher than the old model did, hence 0.8.
           (p_embedding is not null and d.vector is not null
            and 1 - (d.vector operator(extensions.<=>) p_embedding) > 0.8) as meaning_hit
      from docs d, q
  )
  select sc.id as save_id,
         sc.score,
         best.text as snippet,
         best.start as snippet_start
    from scored sc
    cross join q
    left join lateral (
      select seg->>'text' as text, (seg->>'start')::double precision as start
        from pg_catalog.jsonb_array_elements(coalesce(sc.segments, '[]'::jsonb)) as seg
       where pg_catalog.to_tsvector('simple'::regconfig, coalesce(seg->>'text', '')) operator(pg_catalog.@@) q.tsq
       order by pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig, coalesce(seg->>'text', '')), q.tsq) desc,
                (seg->>'start')::double precision
       limit 1
    ) best on true
   where sc.text_hit or sc.meaning_hit
   order by sc.score desc
   limit greatest(1, least(p_limit, 100));
$$;


-- -----------------------------------------------------------------------------
-- Worker token (Vault, made here when missing) and its check.
-- The database sends it in the wake-up; the worker passes it to
-- stash-worker-proxy, which asks worker_token_ok(). Nobody types it anywhere.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'stash_worker_token') then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'stash_worker_token',
      'Token pg_net sends to the Stash worker; the worker shows it to stash-worker-proxy');
  end if;
end
$$;

create or replace function stash.worker_token_ok(p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'stash_worker_token' limit 1;
  if v_secret is null or p_token is null or pg_catalog.length(p_token) < 32 then
    return false;
  end if;
  -- Digests are compared, so timing says nothing about the token itself.
  return pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'))
       = pg_catalog.sha256(pg_catalog.convert_to(v_secret, 'UTF8'));
end;
$$;

comment on function stash.worker_token_ok(text) is
  'Service only: true when p_token is the Vault secret stash_worker_token. Called by stash-worker-proxy on every request.';


-- Wake-up: POST <stash_worker_url>/run with the token. No-op until the URL exists.
create or replace function stash.wake_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url   text;
  v_token text;
begin
  -- No caller check: a save from the phone reaches this through triggers. The token protects the worker.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'stash_worker_url' limit 1;
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'stash_worker_token' limit 1;

  if v_url is null or v_token is null or v_url !~ '^https://' then
    return;  -- worker not deployed yet: jobs wait in the queue
  end if;

  perform net.http_post(
    url                  := pg_catalog.rtrim(v_url, '/') || '/run',
    body                 := '{}'::jsonb,
    headers              := pg_catalog.jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-stash-worker-token', v_token),
    -- Held open for the whole run (a Vercel function lives 300 s at most).
    timeout_milliseconds := 310000
  );
exception when others then
  -- A failed wake-up must never block a save; the cron sweep retries.
  return;
end;
$$;

comment on function stash.wake_worker() is
  'POSTs <stash_worker_url>/run with header x-stash-worker-token. No-op until Vault has the URL.';


-- -----------------------------------------------------------------------------
-- worker_config(): everything the worker needs, in one service-only call.
-- -----------------------------------------------------------------------------
create or replace function stash.vault_text(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(pg_catalog.btrim(decrypted_secret), '')
    from vault.decrypted_secrets where name = p_name limit 1;
$$;

comment on function stash.vault_text(text) is 'Internal: one Vault secret, null when missing or blank.';

create or replace function stash.has_ai_key()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select stash.vault_text('stash_gemini_api_key') is not null
      or stash.vault_text('stash_anthropic_api_key') is not null;
$$;

comment on function stash.has_ai_key() is 'Internal: true when Vault holds a Gemini or Anthropic key.';

create or replace function stash.worker_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'owner_ids', pg_catalog.to_jsonb(stash.owner_ids()),
    'keys', pg_catalog.jsonb_build_object(
      'gemini',    stash.vault_text('stash_gemini_api_key'),
      'groq',      stash.vault_text('stash_groq_api_key'),
      'anthropic', stash.vault_text('stash_anthropic_api_key')),
    'instagram_cookies_b64', stash.vault_text('stash_instagram_cookies_b64'),
    'config', coalesce((select pg_catalog.jsonb_object_agg(c.key, c.value) from stash.config c), '{}'::jsonb)
  );
end;
$$;

comment on function stash.worker_config() is
  'Service only: {owner_ids, keys{gemini,groq,anthropic}, instagram_cookies_b64, config{…}} for the worker, via stash-worker-proxy.';


-- What the phone may know about the setup (no secrets, booleans and sizes only).
create or replace function stash.pipeline_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'worker',      stash.vault_text('stash_worker_url') is not null,
    'ai',          stash.has_ai_key(),
    'is_owner',    coalesce((select auth.uid()) = any (stash.owner_ids()), false),
    'owners_set',  pg_catalog.cardinality(stash.owner_ids()) > 0,
    'video_bytes', coalesce((select sum(s.video_bytes) from stash.saves s
                              where s.user_id = (select auth.uid()) and s.video_path is not null), 0),
    'video_cap_bytes', stash.cfg('video_cap_mb', '800')::bigint * 1048576
  );
$$;

comment on function stash.pipeline_status() is
  'For Settings: is the worker deployed, is there an AI key, is this device an owner, video space used. No secrets.';


-- -----------------------------------------------------------------------------
-- Same owner on every reference (0004), now also for asks.cited_save_ids.
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
                 when v_col in ('save_id', 'save_ids', 'done_ids', 'source_save_ids', 'cited_save_ids') then 'saves'
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


-- -----------------------------------------------------------------------------
-- asks: "Ask your saves". The phone inserts a question; the worker answers.
-- -----------------------------------------------------------------------------
create table if not exists stash.asks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question       text not null check (length(btrim(question)) between 2 and 500),
  status         text not null default 'queued' check (status in ('queued', 'running', 'ready', 'failed')),
  answer         text,
  cited_save_ids uuid[] not null default '{}',
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table stash.asks is
  'A question about the owner''s saves. status queued → running → ready | failed; answer cites cited_save_ids. Followed through Realtime.';

create index if not exists asks_user_created_idx on stash.asks (user_id, created_at desc);

drop trigger if exists set_updated_at on stash.asks;
create trigger set_updated_at before update on stash.asks
  for each row execute function stash.set_updated_at();

-- The phone chooses the question only; it may delete its asks but not rewrite answers.
create or replace function stash.guard_ask_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent int;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from auth.uid() then
      raise exception 'not yours' using errcode = '42501';
    end if;
    -- Counted on the ask jobs, which the phone cannot delete (deleting asks does not reset the limit).
    select count(*) into v_recent
      from stash.jobs j
     where j.user_id = new.user_id
       and j.type::text = 'ask'
       and j.created_at > pg_catalog.now() - interval '24 hours';
    if v_recent >= stash.cfg('ask_daily_limit', '40')::int then
      raise exception 'ask limit reached' using errcode = '54000';
    end if;
    new.status         := 'queued';
    new.answer         := null;
    new.cited_save_ids := '{}';
    new.error          := null;
    new.created_at     := pg_catalog.now();
  else
    new.question       := old.question;
    new.status         := old.status;
    new.answer         := old.answer;
    new.cited_save_ids := old.cited_save_ids;
    new.error          := old.error;
    new.created_at     := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ask_columns on stash.asks;
create trigger guard_ask_columns
  before insert or update on stash.asks
  for each row execute function stash.guard_ask_columns();

create or replace function stash.on_ask_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'queued' then
    insert into stash.jobs (user_id, type, payload)
    values (new.user_id, 'ask'::stash.job_type, pg_catalog.jsonb_build_object('ask_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists on_ask_created on stash.asks;
create trigger on_ask_created
  after insert on stash.asks
  for each row execute function stash.on_ask_created();


-- Retrieval for an ask job. Service only, and always for one user id (the
-- worker bypasses RLS, so search_saves would read everyone's saves).
create or replace function stash.ask_context(
  p_user_id   uuid,
  p_query     text,
  p_embedding extensions.vector(384) default null,
  p_limit     int default 8
)
returns table (
  save_id    uuid,
  title      text,
  key_idea   text,
  takeaways  jsonb,
  caption    text,
  creator    text,
  platform   text,
  saved_at   timestamptz,
  excerpt    text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  with q as (
    select pg_catalog.websearch_to_tsquery('simple'::regconfig, coalesce(p_query, '')) as tsq
  ),
  scored as (
    select s.id,
           coalesce(i.title, s.title) as title,
           i.key_idea,
           coalesce(i.takeaways, '[]'::jsonb) as takeaways,
           s.caption,
           s.creator_handle,
           s.platform::text as platform,
           s.saved_at,
           pg_catalog.left(t.full_text, 1500) as excerpt,
           case when p_embedding is not null and e.vector is not null
                then (1 - (e.vector operator(extensions.<=>) p_embedding))::double precision
                else 0::double precision end as sim,
           (pg_catalog.ts_rank(pg_catalog.to_tsvector('simple'::regconfig,
              coalesce(s.caption, '') || ' ' || coalesce(s.title, '') || ' ' || coalesce(i.title, '') || ' ' ||
              coalesce(i.key_idea, '') || ' ' || coalesce(pg_catalog.array_to_string(i.tags, ' '), '')), q.tsq)
            + coalesce(pg_catalog.ts_rank(t.tsv, q.tsq), 0))::double precision as words
      from stash.saves s
      cross join q
      left join stash.insights    i on i.save_id = s.id
      left join stash.transcripts t on t.save_id = s.id
      left join stash.embeddings  e on e.save_id = s.id
     where s.user_id = p_user_id
       and s.status = 'ready'::stash.save_status
  )
  select sc.id, sc.title, sc.key_idea, sc.takeaways, sc.caption, sc.creator_handle, sc.platform,
         sc.saved_at, sc.excerpt, sc.sim
    from scored sc
   where sc.sim > 0 or sc.words > 0
   order by (sc.sim * 2 + sc.words) desc, sc.saved_at desc
   limit greatest(1, least(coalesce(p_limit, 8), 20));
end;
$$;

comment on function stash.ask_context(uuid, text, extensions.vector, int) is
  'Service only: the best saves of one user for a question (meaning + words), for the worker''s ask job.';


-- -----------------------------------------------------------------------------
-- highlights: a line worth keeping from a save (picked by the user or the AI)
-- -----------------------------------------------------------------------------
create table if not exists stash.highlights (
  id         uuid primary key default gen_random_uuid(),
  save_id    uuid not null references stash.saves (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text       text not null check (length(btrim(text)) between 1 and 2000),
  start_s    numeric check (start_s is null or start_s >= 0),
  end_s      numeric check (end_s is null or end_s >= 0),
  card_id    uuid references stash.cards (id) on delete set null,
  source     text not null default 'user' check (source in ('user', 'ai')),
  created_at timestamptz not null default now()
);

comment on table stash.highlights is
  'A highlighted line of a save: text, where it starts in the video (start_s), optionally the recall card made from it.';

create index if not exists highlights_save_id_idx on stash.highlights (save_id);
create index if not exists highlights_user_idx    on stash.highlights (user_id, created_at desc);
create index if not exists highlights_card_id_idx on stash.highlights (card_id);


-- -----------------------------------------------------------------------------
-- backups: weekly JSON export per owner, stash-exports/<user_id>/backups/<day>.json
-- The worker writes the rows; deleting a row sends its file to media_trash.
-- -----------------------------------------------------------------------------
create table if not exists stash.backups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path       text not null,
  bytes      bigint not null default 0 check (bytes >= 0),
  saves      int not null default 0 check (saves >= 0),
  created_at timestamptz not null default now(),
  constraint backups_user_path_uniq unique (user_id, path)
);

comment on table stash.backups is 'One weekly JSON backup file in stash-exports. Read-only for the phone.';

create index if not exists backups_user_created_idx on stash.backups (user_id, created_at desc);

create or replace function stash.on_backup_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.starts_with(old.path, old.user_id::text || '/backups/') then
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-exports', old.path);
  end if;
  return old;
end;
$$;

drop trigger if exists on_backup_deleted on stash.backups;
create trigger on_backup_deleted
  after delete on stash.backups
  for each row execute function stash.on_backup_deleted();

-- One backup job per owner, unless one is already waiting.
create or replace function stash.queue_backups()
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
  insert into stash.jobs (user_id, type)
  select u.id, 'backup'::stash.job_type
    from auth.users u
   where u.id = any (stash.owner_ids())
     and exists (select 1 from stash.saves s where s.user_id = u.id)
     and not exists (select 1 from stash.jobs j
                      where j.user_id = u.id and j.type::text = 'backup'
                        and j.state in ('queued'::stash.job_state, 'running'::stash.job_state));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function stash.queue_backups() is 'Weekly (pg_cron): one backup job per owner identity that has saves.';

select cron.schedule('stash-backup', '41 4 * * 0', $$select stash.queue_backups();$$);


-- -----------------------------------------------------------------------------
-- recovery: "move to a new phone" without a login. The Edge Function
-- stash-recovery gives the anonymous user a synthetic email and a password, both
-- derived from a one-time-shown code. Here: only the lookup id (a SHA-256
-- derivative of the code) and dates. The code and password are stored nowhere.
-- -----------------------------------------------------------------------------
create table if not exists stash.recovery (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  lookup           text not null unique check (lookup ~ '^[0-9a-f]{32}$'),
  created_at       timestamptz not null default now(),
  last_restored_at timestamptz
);

comment on table stash.recovery is
  'Recovery code bookkeeping: lookup id (hash of the code) and dates. Written by stash-recovery only.';

alter table stash.recovery enable row level security;
drop policy if exists "owner_read" on stash.recovery;
create policy "owner_read" on stash.recovery
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- The phone sees that a code exists and since when, never the lookup id.
revoke all on stash.recovery from anon, authenticated;
grant select (user_id, created_at, last_restored_at) on stash.recovery to authenticated;
grant all on stash.recovery to service_role;

create or replace function stash.recovery_set(p_user_id uuid, p_lookup text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into stash.recovery as r (user_id, lookup)
  values (p_user_id, p_lookup)
  on conflict (user_id) do update
    set lookup = excluded.lookup, created_at = pg_catalog.now(), last_restored_at = null;
end;
$$;

comment on function stash.recovery_set(uuid, text) is
  'Service only (stash-recovery create): stores or rotates the lookup id of a user''s recovery code.';

create or replace function stash.recovery_find(p_lookup text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update stash.recovery r
     set last_restored_at = pg_catalog.now()
   where r.lookup = p_lookup
  returning r.user_id into v_user;
  return v_user;
end;
$$;

comment on function stash.recovery_find(text) is
  'Service only (stash-recovery restore): user id for a lookup id, or null. Stamps last_restored_at.';

-- Cleanup of empty anonymous users (0006): a user with a recovery code is no
-- longer anonymous, and is skipped explicitly as well.
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
       and not exists (select 1 from stash.recovery r where r.user_id = u.id)
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


-- -----------------------------------------------------------------------------
-- RLS, grants, same-owner triggers and Realtime for the new phone-facing tables
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['asks', 'highlights']
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

-- backups: read-only for the phone (like the galaxy tables).
alter table stash.backups enable row level security;
drop policy if exists "owner_read" on stash.backups;
create policy "owner_read" on stash.backups
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on stash.backups from anon, authenticated;
grant select on stash.backups to authenticated;
grant all    on stash.backups to service_role;

drop trigger if exists zz_same_owner on stash.asks;
create trigger zz_same_owner before insert or update on stash.asks
  for each row execute function stash.guard_same_owner('cited_save_ids[]');

drop trigger if exists zz_same_owner on stash.highlights;
create trigger zz_same_owner before insert or update on stash.highlights
  for each row execute function stash.guard_same_owner('save_id', 'card_id');

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['asks', 'highlights']
    loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'stash' and tablename = t) then
        execute format('alter publication supabase_realtime add table stash.%I', t);
      end if;
    end loop;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- Tag syntheses: a tag with 5+ ready saves since its last synthesis queues a
-- synthesize job with payload {"tag": "<tag>"} (space_id null).
-- -----------------------------------------------------------------------------
alter table stash.syntheses add column if not exists tag text;
comment on column stash.syntheses.tag is 'Set for a tag synthesis (space_id null); null for a Space synthesis.';
create index if not exists syntheses_user_tag_idx on stash.syntheses (user_id, tag) where tag is not null;

create or replace function stash.maybe_synthesize_tag(p_user_id uuid, p_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag   text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_tag, '')));
  v_since timestamptz;
  v_new   int;
begin
  if p_user_id is null or v_tag = '' or pg_catalog.length(v_tag) > 60 then
    return;
  end if;

  if exists (select 1 from stash.jobs j
              where j.user_id = p_user_id
                and j.type = 'synthesize'::stash.job_type
                and j.payload->>'tag' = v_tag
                and j.state in ('queued'::stash.job_state, 'running'::stash.job_state)) then
    return;
  end if;

  select max(sy.created_at) into v_since
    from stash.syntheses sy where sy.user_id = p_user_id and sy.tag = v_tag;

  select count(*) into v_new
    from stash.saves s
    join stash.insights i on i.save_id = s.id
   where s.user_id = p_user_id
     and s.status = 'ready'::stash.save_status
     and exists (select 1 from pg_catalog.unnest(i.tags) x where pg_catalog.lower(pg_catalog.btrim(x)) = v_tag)
     -- i.created_at: a save that was ready long ago but got its insights only now counts as new.
     and greatest(coalesce(s.processed_at, s.saved_at), i.created_at) > coalesce(v_since, '-infinity'::timestamptz);

  if v_new >= greatest(2, stash.cfg('tag_synth_min', '5')::int) then
    insert into stash.jobs (user_id, type, payload)
    values (p_user_id, 'synthesize'::stash.job_type, pg_catalog.jsonb_build_object('tag', v_tag));
  end if;
end;
$$;

comment on function stash.maybe_synthesize_tag(uuid, text) is
  'Queues a synthesize job {"tag"} when a tag has enough ready saves since its last synthesis.';

-- A save turning ready (or moving Space) may complete a Space or a tag.
create or replace function stash.on_save_ready_or_moved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
begin
  if new.status <> 'ready'::stash.save_status then
    return new;
  end if;
  if new.space_id is not null
     and (old.status is distinct from new.status or old.space_id is distinct from new.space_id) then
    perform stash.maybe_synthesize(new.space_id);
  end if;
  if old.status is distinct from new.status then
    for v_tag in
      select distinct pg_catalog.lower(pg_catalog.btrim(x))
        from stash.insights i, pg_catalog.unnest(i.tags) x
       where i.save_id = new.id
       limit 12
    loop
      perform stash.maybe_synthesize_tag(new.user_id, v_tag);
    end loop;
  end if;
  return new;
end;
$$;


-- Insights that arrive after the save is already ready (reprocess {"mode":
-- "insights"} leaves status alone, so the trigger above does not fire).
create or replace function stash.on_insights_tags()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text;
begin
  if tg_op = 'UPDATE' and new.tags is not distinct from old.tags then
    return new;
  end if;
  if not exists (select 1 from stash.saves s
                  where s.id = new.save_id and s.status = 'ready'::stash.save_status) then
    return new;  -- still processing: on_save_ready_or_moved looks at the tags when it turns ready
  end if;
  for v_tag in
    select distinct pg_catalog.lower(pg_catalog.btrim(x))
      from pg_catalog.unnest(new.tags) x
     limit 12
  loop
    perform stash.maybe_synthesize_tag(new.user_id, v_tag);
  end loop;
  return new;
end;
$$;

drop trigger if exists on_insights_tags on stash.insights;
create trigger on_insights_tags
  after insert or update of tags on stash.insights
  for each row execute function stash.on_insights_tags();


-- -----------------------------------------------------------------------------
-- imports: a pasted or picked list of links is recorded too.
-- -----------------------------------------------------------------------------
alter table stash.imports drop constraint if exists imports_source_check;
alter table stash.imports add  constraint imports_source_check
  check (source in ('instagram', 'tiktok', 'links'));
comment on table stash.imports is 'One row per import: an Instagram / TikTok data export, or a list of links.';


-- -----------------------------------------------------------------------------
-- Auto-collections: no AI, just groups the data already has. Runs as the caller
-- (RLS). kind: tag | creator | intent (3+ saves each) and places (every save
-- with a pinned place). Archived saves are left out.
-- -----------------------------------------------------------------------------
create or replace function stash.auto_collections(p_min int default 3)
returns table (
  kind     text,
  key      text,
  label    text,
  n        int,
  save_ids uuid[],
  latest   timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with live as (
    select s.id, s.saved_at, s.creator_handle
      from stash.saves s
      left join stash.states st on st.save_id = s.id
     where s.status = 'ready'::stash.save_status
       and st.archived_at is null
  ),
  groups as (
    select 'tag'::text as kind, pg_catalog.lower(pg_catalog.btrim(x)) as key, l.id, l.saved_at
      from live l
      join stash.insights i on i.save_id = l.id
      cross join lateral pg_catalog.unnest(i.tags) x
     where pg_catalog.btrim(x) <> ''
    union
    select 'creator', pg_catalog.lower(l.creator_handle), l.id, l.saved_at
      from live l
     where coalesce(l.creator_handle, '') <> ''
    union
    select 'intent', i.intent::text, l.id, l.saved_at
      from live l
      join stash.insights i on i.save_id = l.id
     where i.intent is not null
    union
    select 'places', 'places', l.id, l.saved_at
      from live l
     where exists (select 1 from stash.places p where p.save_id = l.id)
  )
  select g.kind,
         g.key,
         case g.kind when 'creator' then '@' || pg_catalog.ltrim(g.key, '@')
                     when 'places'  then 'Places'
                     else g.key end as label,
         count(*)::int as n,
         pg_catalog.array_agg(g.id order by g.saved_at desc) as save_ids,
         max(g.saved_at) as latest
    from groups g
   group by g.kind, g.key
  having count(*) >= case when g.kind = 'places' then 1 else greatest(2, least(coalesce(p_min, 3), 50)) end
   order by count(*) desc, max(g.saved_at) desc
   limit 60;
$$;

comment on function stash.auto_collections(int) is
  'The caller''s automatic collections: tags, creators and intents with p_min+ ready saves, plus all saves with places.';


-- -----------------------------------------------------------------------------
-- Retention: keep stash-video under the cap. Oldest first among archived, then
-- watched-and-not-kept, then not kept, then (only if still over) kept. The
-- file goes to media_trash (the worker deletes it through the proxy); the save
-- stays `ready` and plays through the embed or the link.
-- p_incoming_bytes: room the worker is about to need.
-- -----------------------------------------------------------------------------
create or replace function stash.evict_videos(p_incoming_bytes bigint default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap     bigint := greatest(50, stash.cfg('video_cap_mb', '800')::bigint) * 1048576;
  v_target  bigint;
  v_used    bigint;
  v_evicted int := 0;
  r         record;
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(sum(s.video_bytes), 0) into v_used from stash.saves s where s.video_path is not null;
  v_used := v_used + greatest(0, coalesce(p_incoming_bytes, 0));

  if v_used > v_cap then
    v_target := (v_cap * 9) / 10;  -- free 10 % so this doesn't run on every save
    for r in
      select s.id, s.user_id, s.video_path, coalesce(s.video_bytes, 0) as bytes
        from stash.saves s
        left join stash.states st on st.save_id = s.id
       where s.video_path is not null
       order by case
                  when st.archived_at is not null then 0
                  when not coalesce(st.kept, false) and st.watched_at is not null then 1
                  when not coalesce(st.kept, false) then 2
                  else 3
                end,
                s.saved_at
    loop
      exit when v_used <= v_target;
      if pg_catalog.starts_with(r.video_path, r.user_id::text || '/') then
        insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-video', r.video_path);
      end if;
      update stash.saves s
         set video_path  = null,
             video_bytes = null,
             video_state = 'evicted',
             playback    = case when s.embed_url is not null then 'embed' else 'link' end
       where s.id = r.id;
      v_used    := v_used - r.bytes;
      v_evicted := v_evicted + 1;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object('used_bytes', v_used, 'cap_bytes', v_cap, 'evicted', v_evicted);
end;
$$;

comment on function stash.evict_videos(bigint) is
  'Service only / pg_cron: evicts stored videos until stash-video fits the cap (config video_cap_mb). Returns {used_bytes, cap_bytes, evicted}.';

select cron.schedule('stash-evict-videos', '17 * * * *', $$select stash.evict_videos();$$);


-- -----------------------------------------------------------------------------
-- Sweep (every minute): free stuck jobs (7 min > the worker's 300 s); after four
-- timeouts fail the job and what it was working on (the save or the ask), so the
-- phone shows Retry instead of a spinner; fail saves that are waiting with no job
-- at all; re-queue insights for saves that were processed before an AI key
-- existed (`no_key`) or while the provider was busy / time ran out (`retry`);
-- wake the worker.
-- -----------------------------------------------------------------------------
create or replace function stash.sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'not allowed';
  end if;
  update stash.jobs
     set state = 'queued'::stash.job_state,
         locked_at = null,
         run_after = pg_catalog.now()
   where state = 'running'::stash.job_state
     and locked_at < pg_catalog.now() - interval '7 minutes'
     and attempts < 4;

  with dead as (
    update stash.jobs
       set state = 'failed'::stash.job_state,
           error = coalesce(error, 'timed out')
     where state = 'running'::stash.job_state
       and locked_at < pg_catalog.now() - interval '7 minutes'
       and attempts >= 4
    returning save_id, type, payload
  ),
  dead_saves as (
    -- An insights-only job leaves its save alone: the save is already ready.
    update stash.saves s
       set status       = 'failed'::stash.save_status,
           process_step = 'ready',
           error        = 'Processing timed out. Tap Retry.'
      from dead d
     where d.save_id = s.id
       and d.type in ('ingest'::stash.job_type, 'reprocess'::stash.job_type)
       and coalesce(d.payload->>'mode', '') <> 'insights'
       and s.status in ('queued'::stash.save_status, 'processing'::stash.save_status)
    returning s.id
  )
  update stash.asks a
     set status = 'failed', error = 'timeout'
    from dead d
   where d.type::text = 'ask'
     and a.id::text = d.payload->>'ask_id'
     and a.status in ('queued', 'running');

  -- Safety net: a save still waiting after 30 minutes with no job that could finish it.
  update stash.saves s
     set status       = 'failed'::stash.save_status,
         process_step = 'ready',
         error        = 'Processing timed out. Tap Retry.'
   where s.id in (
     select w.id
       from stash.saves w
      where w.status in ('queued'::stash.save_status, 'processing'::stash.save_status)
        and w.updated_at < pg_catalog.now() - interval '30 minutes'
        and not exists (select 1 from stash.jobs j
                         where j.save_id = w.id
                           and j.state in ('queued'::stash.job_state, 'running'::stash.job_state))
      limit 50);

  -- Saves that finished without insights get them now: a key appeared (`no_key`,
  -- one try per 6 hours), or the provider was busy / the worker ran out of time
  -- (`retry`, 10 minutes apart, at most 8 tries a day). A few per minute;
  -- payload mode "insights" skips the download.
  if stash.has_ai_key() and exists (select 1 from stash.saves s where s.ai_state in ('no_key', 'retry')) then
    insert into stash.jobs (save_id, user_id, type, payload)
    select s.id, s.user_id, 'reprocess'::stash.job_type, '{"mode": "insights"}'::jsonb
      from stash.saves s
     where s.ai_state in ('no_key', 'retry')
       and s.status = 'ready'::stash.save_status
       and s.user_id = any (stash.owner_ids())
       and not exists (select 1 from stash.jobs j
                        where j.save_id = s.id
                          and j.state in ('queued'::stash.job_state, 'running'::stash.job_state))
       and not exists (select 1 from stash.jobs j
                        where j.save_id = s.id and j.payload->>'mode' = 'insights'
                          and j.created_at > pg_catalog.now()
                              - case when s.ai_state = 'retry' then interval '10 minutes' else interval '6 hours' end)
       and (select count(*) from stash.jobs j
             where j.save_id = s.id and j.payload->>'mode' = 'insights'
               and j.created_at > pg_catalog.now() - interval '24 hours') < 8
     order by s.saved_at desc
     limit 5;
  end if;

  if exists (select 1 from stash.jobs
              where state = 'queued'::stash.job_state and run_after <= pg_catalog.now())
     or exists (select 1 from stash.media_trash) then
    perform stash.wake_worker();
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- usage: new kinds (ask, vision, backup) and the provider that did the work
-- -----------------------------------------------------------------------------
alter table stash.usage add column if not exists provider text;
comment on column stash.usage.provider is 'gemini | claude | groq | supabase (embeddings).';

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

  select pg_catalog.array_agg(distinct k order by k) into v_kinds
    from (
      select pg_catalog.unnest(array['transcribe', 'understand', 'embed', 'synthesize', 'search', 'grade',
                                     'export', 'galaxy', 'ask', 'vision', 'backup']) as k
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
-- Function privileges for the whole schema (0001-0007), explicit per function.
-- Same rule as 0005/0006: revoke everything, then grant each function to the
-- narrowest role that needs it. New in 0007:
--   authenticated: auto_collections, pipeline_status
--   service_role:  worker_token_ok, worker_config, rate_limit_take, ask_context,
--                  evict_videos, queue_backups, recovery_set, recovery_find
--                  (each also refuses any other caller itself)
--   nobody else:   cfg, vault_text, has_ai_key, maybe_synthesize_tag and the
--                  trigger functions (guard_ask_columns, on_ask_created,
--                  on_backup_deleted, guard_job_insert, guard_save_rate,
--                  on_insights_tags) and hourly_take
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema stash from public, anon, authenticated;
grant  execute on all functions in schema stash to service_role;
revoke execute on function stash.hourly_take(uuid, text) from service_role;  -- only the guards call it

grant execute on function stash.search_saves(text, uuid, extensions.vector, int)               to authenticated;
grant execute on function stash.related_saves(uuid, int)                                       to authenticated;
grant execute on function stash.request_reprocess(uuid)                                        to authenticated;
grant execute on function stash.mark_queue_done(date, uuid)                                    to authenticated;
grant execute on function stash.save_push_subscription(text, text, text, text)                 to authenticated;
grant execute on function stash.vapid_public_key()                                             to authenticated, anon;
grant execute on function stash.nearby_places(double precision, double precision, int)         to authenticated;
grant execute on function stash.wrapped(date)                                                  to authenticated;
grant execute on function stash.auto_collections(int)                                          to authenticated;
grant execute on function stash.pipeline_status()                                              to authenticated;

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
grant execute on function stash.claim_jobs(int)                                                to service_role;
grant execute on function stash.worker_token_ok(text)                                          to service_role;
grant execute on function stash.worker_config()                                                to service_role;
grant execute on function stash.rate_limit_take(text, text, int, int)                          to service_role;
grant execute on function stash.ask_context(uuid, text, extensions.vector, int)                to service_role;
grant execute on function stash.evict_videos(bigint)                                           to service_role;
grant execute on function stash.queue_backups()                                                to service_role;
grant execute on function stash.recovery_set(uuid, text)                                       to service_role;
grant execute on function stash.recovery_find(text)                                            to service_role;

grant usage on schema stash to anon;
revoke all on all tables    in schema stash from anon;
revoke all on all sequences in schema stash from anon;

-- Service-only tables stay closed to the phone whatever the default privileges said.
revoke all on stash.config, stash.rate_limits from authenticated;
revoke insert, update, delete, truncate on stash.backups, stash.recovery from authenticated;
-- Phones queue grade / reprocess jobs (guard_job_insert) and read their own; nothing else.
revoke update, delete, truncate on stash.jobs from authenticated;

notify pgrst, 'reload schema';
