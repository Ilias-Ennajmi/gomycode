-- Planet Sport 100K : jeu concours par magasin.
-- Tout vit dans le schéma privé `ps100k`, qui n'est pas exposé par l'API
-- Supabase. La seule porte d'entrée est `public.ps100k_api`, qui exige la
-- clé applicative (connue uniquement du serveur Next.js).

create schema if not exists ps100k;
revoke all on schema ps100k from public, anon, authenticated;

-- ---------------------------------------------------------------- tables

create table ps100k.settings (
  id int primary key default 1 check (id = 1),
  campaign_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  min_age int not null default 18 check (min_age between 0 and 99),
  instagram_url text not null default '',
  app_key_hash text,
  admin_password_hash text,
  updated_at timestamptz not null default now()
);
insert into ps100k.settings (id) values (1);

create table ps100k.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),
  city text not null check (length(city) between 1 and 60),
  store_name text not null default '' check (length(store_name) <= 80),
  prizes_total int not null default 0 check (prizes_total between 0 and 1000),
  win_probability numeric(7,5) not null default 0.02 check (win_probability between 0 and 1),
  active boolean not null default true,
  staff_pin text not null check (staff_pin ~ '^[0-9]{6}$'),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table ps100k.participants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references ps100k.stores (id),
  full_name text not null,
  age int not null,
  phone text not null unique,
  email text,
  device_id text not null unique,
  fingerprint text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  played_at timestamptz,
  won boolean,
  win_code text unique,
  redeemed_at timestamptz,
  redeemed_by text
);
create index participants_store_idx on ps100k.participants (store_id, won);
create index participants_created_idx on ps100k.participants (created_at desc);
create index participants_fingerprint_idx on ps100k.participants (fingerprint);

create table ps100k.rate_events (
  bucket text not null,
  key text not null,
  at timestamptz not null default now()
);
create index rate_events_idx on ps100k.rate_events (bucket, key, at);
create index rate_events_at_idx on ps100k.rate_events (at);

alter table ps100k.settings enable row level security;
alter table ps100k.stores enable row level security;
alter table ps100k.participants enable row level security;
alter table ps100k.rate_events enable row level security;

-- ------------------------------------------------------------- helpers

create function ps100k.rate_count(p_bucket text, p_key text, p_window interval)
returns int language sql security definer set search_path = '' as $$
  select count(*)::int from ps100k.rate_events
  where bucket = p_bucket and key = coalesce(p_key, '?') and at > now() - p_window;
$$;

create function ps100k.rate_mark(p_bucket text, p_key text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into ps100k.rate_events (bucket, key) values (p_bucket, coalesce(p_key, '?'));
  delete from ps100k.rate_events where at < now() - interval '2 days';
end $$;

-- 'ok' | 'paused' | 'not_started' | 'ended' | 'sold_out'
create function ps100k.store_status(p_store ps100k.stores)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s ps100k.settings;
  wins int;
begin
  select * into s from ps100k.settings where id = 1;
  if not s.campaign_active or not p_store.active then return 'paused'; end if;
  if s.starts_at is not null and now() < s.starts_at then return 'not_started'; end if;
  if s.ends_at is not null and now() >= s.ends_at then return 'ended'; end if;
  select count(*) into wins from ps100k.participants where store_id = p_store.id and won;
  if wins >= p_store.prizes_total then return 'sold_out'; end if;
  return 'ok';
end $$;

create function ps100k.local_ts(p timestamptz)
returns text language sql immutable set search_path = '' as $$
  select to_char(p at time zone 'Africa/Casablanca', 'YYYY-MM-DD"T"HH24:MI');
$$;

create function ps100k.new_win_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea;
  code text;
begin
  loop
    b := extensions.gen_random_bytes(6);
    code := 'PS-';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from ps100k.participants where win_code = code);
  end loop;
  return code;
end $$;

create function ps100k.new_pin()
returns text language sql security definer set search_path = '' as $$
  select lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
$$;

create function ps100k.me_json(p ps100k.participants)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'first_name', split_part(p.full_name, ' ', 1),
    'played', p.played_at is not null,
    'won', coalesce(p.won, false),
    'win_code', p.win_code,
    'redeemed', p.redeemed_at is not null
  );
$$;

-- ---------------------------------------------------------------- game

create function ps100k.game_state(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st ps100k.stores;
  s ps100k.settings;
  p ps100k.participants;
  me jsonb := null;
begin
  select * into st from ps100k.stores where slug = a->>'slug';
  if not found then return jsonb_build_object('found', false); end if;
  select * into s from ps100k.settings where id = 1;
  if coalesce(a->>'device_id', '') <> '' then
    select * into p from ps100k.participants where device_id = a->>'device_id';
    if found then me := ps100k.me_json(p); end if;
  end if;
  return jsonb_build_object(
    'found', true,
    'store', jsonb_build_object('slug', st.slug, 'city', st.city, 'store_name', st.store_name),
    'status', ps100k.store_status(st),
    'starts_at', s.starts_at,
    'min_age', s.min_age,
    'instagram_url', s.instagram_url,
    'me', me
  );
end $$;

create function ps100k.register(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  st ps100k.stores;
  s ps100k.settings;
  status text;
  by_dev ps100k.participants;
  by_phone ps100k.participants;
  v_name text := btrim(regexp_replace(coalesce(a->>'full_name', ''), '\s+', ' ', 'g'));
  v_age int := (a->>'age')::int;
  v_phone text := a->>'phone';
  v_email text := nullif(lower(btrim(coalesce(a->>'email', ''))), '');
  v_device text := a->>'device_id';
  v_id uuid;
begin
  select * into st from ps100k.stores where slug = a->>'slug';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into s from ps100k.settings where id = 1;

  if coalesce(v_device, '') !~ '^[A-Za-z0-9_-]{16,64}$'
     or length(v_name) not between 3 and 80
     or v_phone !~ '^\+212[5-7][0-9]{8}$'
     or v_age is null or v_age > 110
     or (v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_age < s.min_age then
    return jsonb_build_object('ok', false, 'error', 'age', 'min_age', s.min_age);
  end if;

  select * into by_dev from ps100k.participants where device_id = v_device;
  if found and by_dev.played_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_played', 'me', ps100k.me_json(by_dev));
  end if;

  status := ps100k.store_status(st);
  if status <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'closed', 'status', status);
  end if;

  if ps100k.rate_count('register', a->>'ip_hash', interval '10 minutes') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  perform ps100k.rate_mark('register', a->>'ip_hash');

  select * into by_phone from ps100k.participants where phone = v_phone;
  if by_phone.id is not null and (by_dev.id is null or by_phone.id <> by_dev.id) then
    if by_phone.played_at is not null then
      return jsonb_build_object('ok', false, 'error', 'phone_used');
    end if;
    -- Inscription jamais jouée depuis un autre navigateur : on la reprend ici.
    if by_dev.id is not null then
      delete from ps100k.participants where id = by_dev.id;
    end if;
    by_dev := by_phone;
  end if;

  begin
    if by_dev.id is not null then
      update ps100k.participants set
        store_id = st.id, full_name = v_name, age = v_age, phone = v_phone, email = v_email,
        device_id = v_device, fingerprint = a->>'fingerprint', ip_hash = a->>'ip_hash',
        user_agent = left(a->>'user_agent', 300)
      where id = by_dev.id
      returning id into v_id;
    else
      insert into ps100k.participants
        (store_id, full_name, age, phone, email, device_id, fingerprint, ip_hash, user_agent)
      values
        (st.id, v_name, v_age, v_phone, v_email, v_device, a->>'fingerprint', a->>'ip_hash',
         left(a->>'user_agent', 300))
      returning id into v_id;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'phone_used');
  end;

  return jsonb_build_object('ok', true, 'participant_id', v_id);
end $$;

create function ps100k.spin(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p ps100k.participants;
  st ps100k.stores;
  status text;
  draw bigint;
  v_won boolean;
  v_code text := null;
begin
  select * into p from ps100k.participants
  where id = (a->>'participant_id')::uuid and device_id = a->>'device_id'
  for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p.played_at is not null then
    return jsonb_build_object('ok', true, 'replay', true, 'me', ps100k.me_json(p));
  end if;

  -- Verrou sur le magasin : deux parties simultanées passent l'une après
  -- l'autre, le dernier lot ne peut donc être attribué qu'une fois.
  select * into st from ps100k.stores where id = p.store_id for update;
  status := ps100k.store_status(st);
  if status <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'closed', 'status', status);
  end if;

  draw := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
  v_won := draw < (st.win_probability * 4294967296::numeric);
  if v_won then v_code := ps100k.new_win_code(); end if;

  update ps100k.participants
  set played_at = now(), won = v_won, win_code = v_code
  where id = p.id
  returning * into p;

  return jsonb_build_object('ok', true, 'replay', false, 'me', ps100k.me_json(p));
end $$;

-- --------------------------------------------------------------- staff

create function ps100k.staff_voucher(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p ps100k.participants;
  st ps100k.stores;
  v_code text := upper(regexp_replace(coalesce(a->>'code', ''), '[^A-Za-z0-9]', '', 'g'));
  v_redeem boolean := coalesce((a->>'redeem')::boolean, false);
begin
  if ps100k.rate_count('staff_fail', a->>'ip_hash', interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  if v_code like 'PS%' then v_code := 'PS-' || substr(v_code, 3); end if;

  select * into p from ps100k.participants where win_code = v_code and won for update;
  if found then select * into st from ps100k.stores where id = p.store_id; end if;
  if p.id is null or st.staff_pin <> coalesce(a->>'pin', '') then
    perform ps100k.rate_mark('staff_fail', a->>'ip_hash');
    return jsonb_build_object('ok', false, 'error', 'no_match');
  end if;

  if v_redeem and p.redeemed_at is null then
    update ps100k.participants
    set redeemed_at = now(), redeemed_by = 'magasin'
    where id = p.id
    returning * into p;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', p.win_code,
    'full_name', p.full_name,
    'phone', p.phone,
    'city', st.city,
    'store_name', st.store_name,
    'played_at', ps100k.local_ts(p.played_at),
    'redeemed_at', case when p.redeemed_at is null then null else ps100k.local_ts(p.redeemed_at) end
  );
end $$;

-- --------------------------------------------------------------- admin

create function ps100k.admin_login(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h text;
begin
  if ps100k.rate_count('admin_fail', a->>'ip_hash', interval '15 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'error', 'rate');
  end if;
  select admin_password_hash into h from ps100k.settings where id = 1;
  if h is null or coalesce(a->>'password', '') = ''
     or extensions.crypt(a->>'password', h) <> h then
    perform ps100k.rate_mark('admin_fail', a->>'ip_hash');
    return jsonb_build_object('ok', false, 'error', 'bad_password');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create function ps100k.admin_change_password(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h text;
begin
  select admin_password_hash into h from ps100k.settings where id = 1;
  if h is null or extensions.crypt(coalesce(a->>'current', ''), h) <> h then
    return jsonb_build_object('ok', false, 'error', 'bad_password');
  end if;
  if length(coalesce(a->>'next', '')) < 10 then
    return jsonb_build_object('ok', false, 'error', 'too_short');
  end if;
  update ps100k.settings
  set admin_password_hash = extensions.crypt(a->>'next', extensions.gen_salt('bf', 10)), updated_at = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create function ps100k.admin_overview(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s ps100k.settings;
  v_stores jsonb;
begin
  select * into s from ps100k.settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', st.id, 'slug', st.slug, 'city', st.city, 'store_name', st.store_name,
      'prizes_total', st.prizes_total, 'win_probability', st.win_probability,
      'active', st.active, 'staff_pin', st.staff_pin,
      'status', ps100k.store_status(st),
      'registered', c.registered, 'played', c.played, 'winners', c.winners,
      'redeemed', c.redeemed,
      'last_play', case when c.last_play is null then null else ps100k.local_ts(c.last_play) end
    ) order by st.sort_order, st.city), '[]'::jsonb)
  into v_stores
  from ps100k.stores st
  cross join lateral (
    select count(*) as registered,
      count(*) filter (where p.played_at is not null) as played,
      count(*) filter (where p.won) as winners,
      count(*) filter (where p.redeemed_at is not null) as redeemed,
      max(p.played_at) as last_play
    from ps100k.participants p where p.store_id = st.id
  ) c;
  return jsonb_build_object(
    'settings', jsonb_build_object(
      'campaign_active', s.campaign_active,
      'starts_at', case when s.starts_at is null then '' else ps100k.local_ts(s.starts_at) end,
      'ends_at', case when s.ends_at is null then '' else ps100k.local_ts(s.ends_at) end,
      'min_age', s.min_age,
      'instagram_url', s.instagram_url
    ),
    'stores', v_stores
  );
end $$;

create function ps100k.admin_save_settings(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := case when coalesce(a->>'starts_at', '') = '' then null
    else (a->>'starts_at')::timestamp at time zone 'Africa/Casablanca' end;
  v_end timestamptz := case when coalesce(a->>'ends_at', '') = '' then null
    else (a->>'ends_at')::timestamp at time zone 'Africa/Casablanca' end;
begin
  if v_start is not null and v_end is not null and v_end <= v_start then
    return jsonb_build_object('ok', false, 'error', 'dates');
  end if;
  update ps100k.settings set
    campaign_active = coalesce((a->>'campaign_active')::boolean, campaign_active),
    starts_at = v_start,
    ends_at = v_end,
    min_age = (a->>'min_age')::int,
    instagram_url = left(coalesce(a->>'instagram_url', ''), 200),
    updated_at = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create function ps100k.admin_set_campaign(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update ps100k.settings set campaign_active = (a->>'active')::boolean, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create function ps100k.admin_save_store(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(a->>'id', '')::uuid;
  v_wins int;
begin
  if v_id is null then
    insert into ps100k.stores (slug, city, store_name, prizes_total, win_probability, active, staff_pin, sort_order)
    values (
      a->>'slug', btrim(a->>'city'), btrim(coalesce(a->>'store_name', '')),
      (a->>'prizes_total')::int, (a->>'win_probability')::numeric,
      coalesce((a->>'active')::boolean, false), ps100k.new_pin(),
      (select coalesce(max(sort_order), 0) + 1 from ps100k.stores)
    )
    returning id into v_id;
  else
    select count(*) into v_wins from ps100k.participants where store_id = v_id and won;
    if (a->>'prizes_total')::int < v_wins then
      return jsonb_build_object('ok', false, 'error', 'below_winners', 'winners', v_wins);
    end if;
    update ps100k.stores set
      city = btrim(a->>'city'),
      store_name = btrim(coalesce(a->>'store_name', '')),
      prizes_total = (a->>'prizes_total')::int,
      win_probability = (a->>'win_probability')::numeric,
      staff_pin = a->>'staff_pin'
    where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'error', 'slug_taken');
  when check_violation or not_null_violation or invalid_text_representation
    or numeric_value_out_of_range then return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create function ps100k.admin_set_store_active(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update ps100k.stores set active = (a->>'active')::boolean where id = (a->>'id')::uuid;
  return jsonb_build_object('ok', found);
end $$;

create function ps100k.admin_participants(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := nullif(a->>'store_id', '')::uuid;
  v_filter text := coalesce(a->>'filter', 'all');
  v_q text := nullif(btrim(coalesce(a->>'q', '')), '');
  v_limit int := least(greatest(coalesce((a->>'limit')::int, 50), 1), 5000);
  v_offset int := greatest(coalesce((a->>'offset')::int, 0), 0);
  v_rows jsonb;
  v_total int;
begin
  with base as (
    select p.*, st.city, st.store_name,
      (select count(*) from ps100k.participants o
        where o.fingerprint = p.fingerprint and o.ip_hash = p.ip_hash and p.fingerprint is not null) as same_device
    from ps100k.participants p
    join ps100k.stores st on st.id = p.store_id
    where (v_store is null or p.store_id = v_store)
      and (v_filter = 'all'
        or (v_filter = 'winners' and p.won)
        or (v_filter = 'to_redeem' and p.won and p.redeemed_at is null)
        or (v_filter = 'redeemed' and p.redeemed_at is not null)
        or (v_filter = 'not_played' and p.played_at is null))
      and (v_q is null
        or p.full_name ilike '%' || v_q || '%'
        or p.phone like '%' || regexp_replace(v_q, '^0', '') || '%'
        or p.email ilike '%' || v_q || '%'
        or p.win_code ilike '%' || v_q || '%')
  ), page as (
    select * from base order by created_at desc limit v_limit offset v_offset
  )
  select (select count(*) from base),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'city', city, 'store_name', store_name, 'full_name', full_name, 'age', age,
      'phone', phone, 'email', coalesce(email, ''),
      'created_at', ps100k.local_ts(created_at),
      'played_at', case when played_at is null then '' else ps100k.local_ts(played_at) end,
      'won', coalesce(won, false), 'win_code', coalesce(win_code, ''),
      'redeemed_at', case when redeemed_at is null then '' else ps100k.local_ts(redeemed_at) end,
      'redeemed_by', coalesce(redeemed_by, ''),
      'same_device', same_device
    ) order by created_at desc) from page), '[]'::jsonb)
  into v_total, v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create function ps100k.admin_set_redeemed(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update ps100k.participants set
    redeemed_at = case when (a->>'redeemed')::boolean then coalesce(redeemed_at, now()) else null end,
    redeemed_by = case when (a->>'redeemed')::boolean then coalesce(redeemed_by, 'siège') else null end
  where id = (a->>'id')::uuid and won;
  return jsonb_build_object('ok', found);
end $$;

create function ps100k.admin_delete_participant(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from ps100k.participants where id = (a->>'id')::uuid;
  return jsonb_build_object('ok', found);
end $$;

-- ---------------------------------------------------------- entry point

create function public.ps100k_api(p_key text, p_fn text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h text;
begin
  select app_key_hash into h from ps100k.settings where id = 1;
  if h is null or p_key is null
     or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> h then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  case p_fn
    when 'game_state' then return ps100k.game_state(p_args);
    when 'register' then return ps100k.register(p_args);
    when 'spin' then return ps100k.spin(p_args);
    when 'staff_voucher' then return ps100k.staff_voucher(p_args);
    when 'admin_login' then return ps100k.admin_login(p_args);
    when 'admin_change_password' then return ps100k.admin_change_password(p_args);
    when 'admin_overview' then return ps100k.admin_overview(p_args);
    when 'admin_save_settings' then return ps100k.admin_save_settings(p_args);
    when 'admin_set_campaign' then return ps100k.admin_set_campaign(p_args);
    when 'admin_save_store' then return ps100k.admin_save_store(p_args);
    when 'admin_set_store_active' then return ps100k.admin_set_store_active(p_args);
    when 'admin_participants' then return ps100k.admin_participants(p_args);
    when 'admin_set_redeemed' then return ps100k.admin_set_redeemed(p_args);
    when 'admin_delete_participant' then return ps100k.admin_delete_participant(p_args);
    else raise exception 'unknown function %', p_fn;
  end case;
end $$;

revoke all on all functions in schema ps100k from public, anon, authenticated;
revoke all on function public.ps100k_api(text, text, jsonb) from public, authenticated;
grant execute on function public.ps100k_api(text, text, jsonb) to anon;

-- ---------------------------------------------------------------- seed

insert into ps100k.stores (slug, city, prizes_total, staff_pin, sort_order) values
  ('casablanca', 'Casablanca', 6, ps100k.new_pin(), 1),
  ('rabat', 'Rabat', 3, ps100k.new_pin(), 2),
  ('tanger', 'Tanger', 2, ps100k.new_pin(), 3),
  ('marrakech', 'Marrakech', 2, ps100k.new_pin(), 4),
  ('agadir', 'Agadir', 2, ps100k.new_pin(), 5),
  ('meknes', 'Meknès', 1, ps100k.new_pin(), 6),
  ('laayoune', 'Laâyoune', 1, ps100k.new_pin(), 7),
  ('oujda', 'Oujda', 1, ps100k.new_pin(), 8),
  ('kenitra', 'Kénitra', 1, ps100k.new_pin(), 9),
  ('fes', 'Fès', 1, ps100k.new_pin(), 10);
