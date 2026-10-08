-- =============================================================================
-- Stash · 0003 · processing pipeline (Phase 1)
--
--   * A new save gets its `states` row and an `ingest` job automatically.
--   * New jobs wake the worker (Cloud Run) through pg_net; a pg_cron sweep
--     every minute re-wakes it for anything left behind and frees stuck jobs.
--     The worker URL and secret live in Supabase Vault as
--     `stash_worker_url` and `stash_worker_secret`. Until they exist, wake-ups
--     are skipped silently and saves simply wait in the queue.
--   * The worker claims jobs with `claim_jobs()` (service_role only).
--   * `search_saves()` and `related_saves()` run as the caller, so RLS applies.
--   * Private Storage buckets for thumbnails and voice notes, one folder per user.
--   * `usage` logs AI cost per save (cost guard); `media_trash` remembers the
--     files of deleted saves so the worker can remove them from R2/Storage.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- New columns
-- -----------------------------------------------------------------------------
alter table stash.saves add column if not exists title        text;   -- from the platform (og/title)
alter table stash.saves add column if not exists error        text;   -- last processing error, shown as "Retry"
alter table stash.saves add column if not exists processed_at timestamptz;

comment on column stash.saves.title is 'Title or first caption line from the platform; the AI title lives in insights.';


-- -----------------------------------------------------------------------------
-- usage: AI cost per save (cost guard, Settings → Processing)
-- -----------------------------------------------------------------------------
create table if not exists stash.usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  save_id       uuid references stash.saves (id) on delete set null,
  kind          text not null check (kind in ('transcribe', 'understand', 'embed', 'synthesize', 'search')),
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  audio_seconds numeric not null default 0,
  usd           numeric not null default 0,
  created_at    timestamptz not null default now()
);

comment on table stash.usage is 'Tokens, audio minutes and estimated USD per processing step.';

create index if not exists usage_user_created_idx on stash.usage (user_id, created_at desc);
create index if not exists usage_save_id_idx      on stash.usage (save_id);

alter table stash.usage enable row level security;
drop policy if exists "owner_read" on stash.usage;
create policy "owner_read" on stash.usage
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on stash.usage from anon;
revoke insert, update, delete on stash.usage from authenticated;
grant select on stash.usage to authenticated;
grant all on stash.usage to service_role;


-- -----------------------------------------------------------------------------
-- media_trash: files left behind by deleted saves (worker cleans them up)
-- -----------------------------------------------------------------------------
create table if not exists stash.media_trash (
  id         bigint generated always as identity primary key,
  store      text not null check (store in ('r2', 'storage')),
  bucket     text,
  path       text not null,
  created_at timestamptz not null default now()
);

comment on table stash.media_trash is 'Paths of deleted saves'' files, removed by the worker sweep.';

alter table stash.media_trash enable row level security;  -- no policies: service_role only
revoke all on stash.media_trash from anon, authenticated;
grant all on stash.media_trash to service_role;


-- -----------------------------------------------------------------------------
-- Worker wake-up through pg_net (URL + secret from Vault)
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
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'stash_worker_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'stash_worker_secret' limit 1;

  if v_url is null or v_secret is null then
    return;  -- worker not configured yet: jobs wait in the queue
  end if;

  perform net.http_post(
    url                  := rtrim(v_url, '/') || '/run',
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 2000
  );
exception when others then
  -- A failed wake-up must never block a save; the cron sweep retries.
  return;
end;
$$;

comment on function stash.wake_worker() is
  'POSTs <worker>/run so Cloud Run starts processing. No-op until the Vault secrets exist.';

revoke execute on function stash.wake_worker() from public, anon, authenticated;
grant  execute on function stash.wake_worker() to service_role;


-- -----------------------------------------------------------------------------
-- New save → states row + ingest job
-- -----------------------------------------------------------------------------
create or replace function stash.on_save_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into stash.states (save_id, user_id)
  values (new.id, new.user_id)
  on conflict (save_id) do nothing;

  if new.status = 'queued'::stash.save_status then
    insert into stash.jobs (save_id, user_id, type)
    values (new.id, new.user_id, 'ingest'::stash.job_type);
  end if;

  return new;
end;
$$;

revoke execute on function stash.on_save_created() from public, anon, authenticated;

drop trigger if exists on_save_created on stash.saves;
create trigger on_save_created
  after insert on stash.saves
  for each row execute function stash.on_save_created();


-- New queued jobs → one wake-up per statement (not per row).
create or replace function stash.on_jobs_queued()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from new_jobs where state = 'queued'::stash.job_state) then
    perform stash.wake_worker();
  end if;
  return null;
end;
$$;

revoke execute on function stash.on_jobs_queued() from public, anon, authenticated;

drop trigger if exists on_jobs_queued on stash.jobs;
create trigger on_jobs_queued
  after insert on stash.jobs
  referencing new table as new_jobs
  for each statement execute function stash.on_jobs_queued();


-- Deleted save → remember its files for cleanup.
create or replace function stash.on_save_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.video_path is not null then
    insert into stash.media_trash (store, path) values ('r2', old.video_path);
  end if;
  if old.thumb_path is not null then
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-thumbs', old.thumb_path);
  end if;
  if old.voice_note_path is not null then
    insert into stash.media_trash (store, bucket, path) values ('storage', 'stash-voice', old.voice_note_path);
  end if;
  return old;
end;
$$;

revoke execute on function stash.on_save_deleted() from public, anon, authenticated;

drop trigger if exists on_save_deleted on stash.saves;
create trigger on_save_deleted
  after delete on stash.saves
  for each row execute function stash.on_save_deleted();


-- -----------------------------------------------------------------------------
-- Reprocess from the app: the owner can queue a reprocess job for their save
-- (RLS on jobs already allows the insert; this keeps the client code simple).
-- -----------------------------------------------------------------------------
create or replace function stash.request_reprocess(p_save_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update stash.saves
     set status = 'queued'::stash.save_status, error = null
   where id = p_save_id;

  if not found then
    raise exception 'save not found';
  end if;

  insert into stash.jobs (save_id, type)
  values (p_save_id, 'reprocess'::stash.job_type);
end;
$$;

revoke execute on function stash.request_reprocess(uuid) from public, anon;
grant  execute on function stash.request_reprocess(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Worker: claim jobs (skip locked, so parallel instances never share one)
-- -----------------------------------------------------------------------------
create or replace function stash.claim_jobs(p_limit int default 3)
returns setof stash.jobs
language sql
security definer
set search_path = ''
as $$
  update stash.jobs j
     set state = 'running'::stash.job_state,
         locked_at = pg_catalog.now(),
         attempts = j.attempts + 1
   where j.id in (
     select id from stash.jobs
      where state = 'queued'::stash.job_state
        and run_after <= pg_catalog.now()
      order by run_after
      limit greatest(1, least(p_limit, 10))
      for update skip locked
   )
  returning j.*;
$$;

revoke execute on function stash.claim_jobs(int) from public, anon, authenticated;
grant  execute on function stash.claim_jobs(int) to service_role;


-- -----------------------------------------------------------------------------
-- Sweep (pg_cron, every minute): free stuck jobs, then wake the worker if
-- anything is waiting or there are files to clean up.
-- -----------------------------------------------------------------------------
create or replace function stash.sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update stash.jobs
     set state = 'queued'::stash.job_state,
         locked_at = null,
         run_after = pg_catalog.now()
   where state = 'running'::stash.job_state
     and locked_at < pg_catalog.now() - interval '10 minutes'
     and attempts < 4;

  update stash.jobs
     set state = 'failed'::stash.job_state,
         error = coalesce(error, 'timed out')
   where state = 'running'::stash.job_state
     and locked_at < pg_catalog.now() - interval '10 minutes'
     and attempts >= 4;

  if exists (select 1 from stash.jobs
              where state = 'queued'::stash.job_state and run_after <= pg_catalog.now())
     or exists (select 1 from stash.media_trash) then
    perform stash.wake_worker();
  end if;
end;
$$;

revoke execute on function stash.sweep() from public, anon, authenticated;
grant  execute on function stash.sweep() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'stash-sweep') then
    perform cron.unschedule('stash-sweep');
  end if;
  perform cron.schedule('stash-sweep', '* * * * *', 'select stash.sweep();');
end
$$;


-- -----------------------------------------------------------------------------
-- Search: words in the transcript, caption, AI title, key idea and tags,
-- plus meaning (vector) when the caller passes a query embedding.
-- Returns the best-matching transcript line so the player can jump there.
-- Runs as the caller: RLS keeps results private.
-- -----------------------------------------------------------------------------
create or replace function stash.search_saves(
  p_query     text,
  p_space_id  uuid default null,
  p_embedding extensions.vector(1024) default null,
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
           (p_embedding is not null and d.vector is not null
            and 1 - (d.vector operator(extensions.<=>) p_embedding) > 0.35) as meaning_hit
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

revoke execute on function stash.search_saves(text, uuid, extensions.vector, int) from public, anon;
grant  execute on function stash.search_saves(text, uuid, extensions.vector, int) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Related saves: nearest neighbours by meaning (caller's own saves only)
-- -----------------------------------------------------------------------------
create or replace function stash.related_saves(p_save_id uuid, p_limit int default 5)
returns table (save_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.save_id,
         (1 - (e.vector operator(extensions.<=>) me.vector))::double precision as similarity
    from stash.embeddings me
    join stash.embeddings e on e.save_id <> me.save_id
   where me.save_id = p_save_id
   order by e.vector operator(extensions.<=>) me.vector
   limit greatest(1, least(p_limit, 20));
$$;

revoke execute on function stash.related_saves(uuid, int) from public, anon;
grant  execute on function stash.related_saves(uuid, int) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Storage: private buckets, one folder per user (<user_id>/<file>)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('stash-thumbs', 'stash-thumbs', false, 2097152,  array['image/jpeg', 'image/webp', 'image/png']),
  ('stash-voice',  'stash-voice',  false, 5242880,  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
on conflict (id) do nothing;

drop policy if exists "stash_own_read"   on storage.objects;
drop policy if exists "stash_own_insert" on storage.objects;
drop policy if exists "stash_own_delete" on storage.objects;

create policy "stash_own_read" on storage.objects
  for select to authenticated
  using (bucket_id in ('stash-thumbs', 'stash-voice')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The phone uploads voice notes; thumbnails come from the worker (service_role).
create policy "stash_own_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'stash-voice'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "stash_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('stash-thumbs', 'stash-voice')
         and (storage.foldername(name))[1] = (select auth.uid())::text);


-- -----------------------------------------------------------------------------
-- Realtime: the Library listens to states too (watched dot, archive)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'stash' and tablename = 'states') then
    alter publication supabase_realtime add table stash.states;
  end if;
end
$$;

notify pgrst, 'reload schema';
