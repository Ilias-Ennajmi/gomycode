-- Planet Sport Content Studio — schéma Supabase
-- À exécuter une fois dans l'éditeur SQL du projet Supabase (SQL Editor > New query > Run).

create table if not exists app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_state enable row level security;

drop policy if exists "Authenticated read" on app_state;
create policy "Authenticated read" on app_state
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated insert" on app_state;
create policy "Authenticated insert" on app_state
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated update" on app_state;
create policy "Authenticated update" on app_state
  for update using (auth.role() = 'authenticated');

insert into app_state (id, data)
values ('planet-sport-workspace', '{}'::jsonb)
on conflict (id) do nothing;

-- Active les mises à jour en temps réel (pour la synchro multi-appareils dans l'app)
alter publication supabase_realtime add table app_state;
