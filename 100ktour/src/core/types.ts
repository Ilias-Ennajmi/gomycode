export type StoreStatus = 'ok' | 'paused' | 'not_started' | 'ended' | 'sold_out' | 'off_hours' | 'day_done';
export type Lang = 'fr' | 'ar';

export type Me = {
  id: string;
  first_name: string;
  played: boolean;
  won: boolean;
  win_code: string | null;
  redeemed: boolean;
};

export type GameState = {
  found: true;
  store: { slug: string; city: string; store_name: string };
  status: StoreStatus;
  starts_at: string | null;
  open_time: string | null;
  close_time: string | null;
  min_age: number;
  instagram_url: string;
  tiktok_url: string;
  website_url: string;
  whatsapp_number: string;
  me: Me | null;
};

export type AdminStore = {
  id: string;
  slug: string;
  city: string;
  store_name: string;
  prizes_total: number;
  win_probability: number;
  active: boolean;
  staff_pin: string;
  open_time: string;
  boost_time: string;
  close_time: string;
  daily_quota: number;
  chance_now: number;
  wins_today: number;
  status: StoreStatus;
  registered: number;
  played: number;
  winners: number;
  redeemed: number;
  last_play: string | null;
};

export type AdminSettings = {
  campaign_active: boolean;
  starts_at: string;
  ends_at: string;
  min_age: number;
  instagram_url: string;
  tiktok_url: string;
  website_url: string;
  whatsapp_number: string;
};

export type AdminOverview = { settings: AdminSettings; stores: AdminStore[] };

export type AdminParticipant = {
  id: string;
  city: string;
  store_name: string;
  full_name: string;
  age: number;
  phone: string;
  email: string;
  marketing_opt_in: boolean;
  lang: string;
  created_at: string;
  played_at: string;
  won: boolean;
  win_code: string;
  redeemed_at: string;
  redeemed_by: string;
  same_device: number;
};
