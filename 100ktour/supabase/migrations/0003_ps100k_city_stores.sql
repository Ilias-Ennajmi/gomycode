-- 100KTour, lot 3 : plusieurs magasins par ville (filtre par ville, parties du
-- jour, suppression d'un magasin encore vide).

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
      'registered', c.registered, 'played', c.played, 'played_today', c.played_today,
      'winners', c.winners, 'redeemed', c.redeemed,
      'last_play', case when c.last_play is null then null else ps100k.local_ts(c.last_play) end
    ) order by st.sort_order, st.city, st.store_name), '[]'::jsonb)
  into v_stores
  from ps100k.stores st
  cross join lateral (
    select count(*) as registered,
      count(*) filter (where p.played_at is not null) as played,
      count(*) filter (where (p.played_at at time zone 'Africa/Casablanca')::date
                             = (ps100k.local_now())::date) as played_today,
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

create or replace function ps100k.admin_participants(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := nullif(a->>'store_id', '')::uuid;
  v_city text := nullif(btrim(coalesce(a->>'city', '')), '');
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
      and (v_city is null or st.city = v_city)
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

-- Un magasin ne peut être supprimé que s'il n'a encore aucun participant.
create function ps100k.admin_delete_store(a jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from ps100k.participants where store_id = (a->>'id')::uuid) then
    return jsonb_build_object('ok', false, 'error', 'has_participants');
  end if;
  delete from ps100k.stores where id = (a->>'id')::uuid;
  return jsonb_build_object('ok', found);
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
    when 'admin_delete_store' then return ps100k.admin_delete_store(p_args);
    when 'admin_participants' then return ps100k.admin_participants(p_args);
    when 'admin_set_redeemed' then return ps100k.admin_set_redeemed(p_args);
    when 'admin_delete_participant' then return ps100k.admin_delete_participant(p_args);
    else raise exception 'unknown function %', p_fn;
  end case;
end $$;

revoke all on all functions in schema ps100k from public, anon, authenticated;
revoke all on function public.ps100k_api(text, text, jsonb) from public, authenticated;
grant execute on function public.ps100k_api(text, text, jsonb) to anon;
