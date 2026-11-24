-- 100KTour, lot 2 : créneau de gain par ville, nom du vendeur à la remise,
-- nouveaux codes magasin, liens de fin de partie, langue et consentement.

alter table ps100k.settings
  add column tiktok_url text not null default '',
  add column website_url text not null default '',
  add column whatsapp_number text not null default '';

alter table ps100k.stores
  add column open_time time,
  add column boost_time time,
  add column close_time time,
  add column daily_quota int not null default 1 check (daily_quota between 1 and 100);

alter table ps100k.participants
  add column marketing_opt_in boolean not null default false,
  add column lang text not null default 'fr';

update ps100k.settings set
  instagram_url = case when instagram_url = '' then 'https://www.instagram.com/planetsport_maroc/' else instagram_url end,
  website_url = 'https://planetsport.ma/'
where id = 1;

create function ps100k.local_now()
returns timestamp language sql stable set search_path = '' as $$
  select now() at time zone 'Africa/Casablanca';
$$;

create function ps100k.wins_today(p_store uuid)
returns int language sql security definer set search_path = '' as $$
  select count(*)::int from ps100k.participants
  where store_id = p_store and won
    and (played_at at time zone 'Africa/Casablanca')::date = (ps100k.local_now())::date;
$$;

-- 'ok' | 'paused' | 'not_started' | 'ended' | 'sold_out' | 'off_hours' | 'day_done'
create or replace function ps100k.store_status(p_store ps100k.stores)
returns text language plpgsql security definer set search_path = '' as $$
declare
  s ps100k.settings;
  wins int;
  t time := (ps100k.local_now())::time;
begin
  select * into s from ps100k.settings where id = 1;
  if not s.campaign_active or not p_store.active then return 'paused'; end if;
  if s.starts_at is not null and now() < s.starts_at then return 'not_started'; end if;
  if s.ends_at is not null and now() >= s.ends_at then return 'ended'; end if;
  select count(*) into wins from ps100k.participants where store_id = p_store.id and won;
  if wins >= p_store.prizes_total then return 'sold_out'; end if;
  if p_store.open_time is not null and p_store.close_time is not null then
    if t < p_store.open_time or t >= p_store.close_time then return 'off_hours'; end if;
    if ps100k.wins_today(p_store.id) >= p_store.daily_quota then return 'day_done'; end if;
  end if;
  return 'ok';
end $$;

-- Chance de gain à cet instant. Sans créneau : la chance de base. Avec un
-- créneau : la chance de base, puis à partir de l'heure de montée elle grimpe
-- jusqu'à 100 % à la fermeture, pour que le bon du jour parte avant la fin.
create function ps100k.win_chance(p_store ps100k.stores)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  t time := (ps100k.local_now())::time;
  f numeric;
begin
  if p_store.open_time is null or p_store.close_time is null or p_store.boost_time is null
     or t < p_store.boost_time then
    return p_store.win_probability;
  end if;
  f := extract(epoch from (t - p_store.boost_time))
     / greatest(extract(epoch from (p_store.close_time - p_store.boost_time)), 1);
  f := least(greatest(f, 0), 1);
  return greatest(p_store.win_probability, round(f * f, 5));
end $$;

create or replace function ps100k.game_state(a jsonb)
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
    'open_time', to_char(st.open_time, 'HH24:MI'),
    'close_time', to_char(st.close_time, 'HH24:MI'),
    'min_age', s.min_age,
    'instagram_url', s.instagram_url,
    'tiktok_url', s.tiktok_url,
    'website_url', s.website_url,
    'whatsapp_number', s.whatsapp_number,
    'me', me
  );
end $$;

create or replace function ps100k.register(a jsonb)
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
  v_optin boolean := coalesce((a->>'marketing_opt_in')::boolean, false);
  v_lang text := case when a->>'lang' = 'ar' then 'ar' else 'fr' end;
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
        user_agent = left(a->>'user_agent', 300), marketing_opt_in = v_optin, lang = v_lang
      where id = by_dev.id
      returning id into v_id;
    else
      insert into ps100k.participants
        (store_id, full_name, age, phone, email, device_id, fingerprint, ip_hash, user_agent,
         marketing_opt_in, lang)
      values
        (st.id, v_name, v_age, v_phone, v_email, v_device, a->>'fingerprint', a->>'ip_hash',
         left(a->>'user_agent', 300), v_optin, v_lang)
      returning id into v_id;
    end if;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'phone_used');
  end;

  return jsonb_build_object('ok', true, 'participant_id', v_id);
end $$;

create or replace function ps100k.spin(a jsonb)
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

  select * into st from ps100k.stores where id = p.store_id for update;
  status := ps100k.store_status(st);
  if status <> 'ok' then
    return jsonb_build_object('ok', false, 'error', 'closed', 'status', status);
  end if;

  draw := ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint;
  v_won := draw < (ps100k.win_chance(st) * 4294967296::numeric);
  if v_won then v_code := ps100k.new_win_code(); end if;

  update ps100k.participants
  set played_at = now(), won = v_won, win_code = v_code
  where id = p.id
  returning * into p;

  return jsonb_build_object('ok', true, 'replay', false, 'me', ps100k.me_json(p));
end $$;

create or replace function ps100k.staff_voucher(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p ps100k.participants;
  st ps100k.stores;
  v_code text := upper(regexp_replace(coalesce(a->>'code', ''), '[^A-Za-z0-9]', '', 'g'));
  v_redeem boolean := coalesce((a->>'redeem')::boolean, false);
  v_staff text := left(btrim(regexp_replace(coalesce(a->>'staff_name', ''), '\s+', ' ', 'g')), 60);
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
    if length(v_staff) < 3 then
      return jsonb_build_object('ok', false, 'error', 'staff_name');
    end if;
    update ps100k.participants
    set redeemed_at = now(), redeemed_by = v_staff
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
    'redeemed_at', case when p.redeemed_at is null then null else ps100k.local_ts(p.redeemed_at) end,
    'redeemed_by', p.redeemed_by
  );
end $$;

create or replace function ps100k.admin_overview(a jsonb)
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
      'open_time', coalesce(to_char(st.open_time, 'HH24:MI'), ''),
      'boost_time', coalesce(to_char(st.boost_time, 'HH24:MI'), ''),
      'close_time', coalesce(to_char(st.close_time, 'HH24:MI'), ''),
      'daily_quota', st.daily_quota,
      'status', ps100k.store_status(st),
      'chance_now', ps100k.win_chance(st),
      'wins_today', ps100k.wins_today(st.id),
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
      'instagram_url', s.instagram_url,
      'tiktok_url', s.tiktok_url,
      'website_url', s.website_url,
      'whatsapp_number', s.whatsapp_number
    ),
    'stores', v_stores
  );
end $$;

create or replace function ps100k.admin_save_settings(a jsonb)
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
    starts_at = v_start,
    ends_at = v_end,
    min_age = (a->>'min_age')::int,
    instagram_url = left(coalesce(a->>'instagram_url', ''), 200),
    tiktok_url = left(coalesce(a->>'tiktok_url', ''), 200),
    website_url = left(coalesce(a->>'website_url', ''), 200),
    whatsapp_number = left(coalesce(a->>'whatsapp_number', ''), 20),
    updated_at = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end $$;

create or replace function ps100k.admin_save_store(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(a->>'id', '')::uuid;
  v_wins int;
  v_open time := nullif(a->>'open_time', '')::time;
  v_boost time := nullif(a->>'boost_time', '')::time;
  v_close time := nullif(a->>'close_time', '')::time;
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
    -- Créneau : ouverture et fermeture vont ensemble ; la montée se place entre les deux.
    if (v_open is null) <> (v_close is null)
       or (v_open is not null and v_open >= v_close)
       or (v_boost is not null and (v_open is null or v_boost < v_open or v_boost >= v_close)) then
      return jsonb_build_object('ok', false, 'error', 'window');
    end if;
    select count(*) into v_wins from ps100k.participants where store_id = v_id and won;
    if (a->>'prizes_total')::int < v_wins then
      return jsonb_build_object('ok', false, 'error', 'below_winners', 'winners', v_wins);
    end if;
    update ps100k.stores set
      city = btrim(a->>'city'),
      store_name = btrim(coalesce(a->>'store_name', '')),
      prizes_total = (a->>'prizes_total')::int,
      win_probability = (a->>'win_probability')::numeric,
      staff_pin = a->>'staff_pin',
      open_time = v_open, boost_time = v_boost, close_time = v_close,
      daily_quota = coalesce(nullif(a->>'daily_quota', '')::int, 1)
    where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'error', 'slug_taken');
  when check_violation or not_null_violation or invalid_text_representation
    or numeric_value_out_of_range or invalid_datetime_format or datetime_field_overflow
    then return jsonb_build_object('ok', false, 'error', 'invalid');
end $$;

create function ps100k.admin_new_pin(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pin text := ps100k.new_pin();
begin
  update ps100k.stores set staff_pin = v_pin where id = (a->>'id')::uuid;
  return jsonb_build_object('ok', found, 'pin', v_pin);
end $$;

create or replace function ps100k.admin_participants(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := nullif(a->>'store_id', '')::uuid;
  v_filter text := coalesce(a->>'filter', 'all');
  v_q text := nullif(btrim(coalesce(a->>'q', '')), '');
  v_limit int := least(greatest(coalesce((a->>'limit')::int, 50), 1), 50000);
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
      'marketing_opt_in', marketing_opt_in, 'lang', lang,
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

create or replace function public.ps100k_api(p_key text, p_fn text, p_args jsonb default '{}'::jsonb)
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
    when 'admin_new_pin' then return ps100k.admin_new_pin(p_args);
    when 'admin_participants' then return ps100k.admin_participants(p_args);
    when 'admin_set_redeemed' then return ps100k.admin_set_redeemed(p_args);
    when 'admin_delete_participant' then return ps100k.admin_delete_participant(p_args);
    else raise exception 'unknown function %', p_fn;
  end case;
end $$;

revoke all on all functions in schema ps100k from public, anon, authenticated;
revoke all on function public.ps100k_api(text, text, jsonb) from public, authenticated;
grant execute on function public.ps100k_api(text, text, jsonb) to anon;
