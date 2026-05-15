-- ============================================================
-- ALLES IN EEN - Run dit in Supabase SQL Editor
-- ============================================================

-- 1. CAO PROFIELEN
create table if not exists public.cao_profiles (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  vakantiegeld_pct numeric not null default 8.0,
  pensioen_pct numeric not null default 0.0,
  ziekteverzuim_pct numeric not null default 0.0,
  overige_opslagen_pct numeric not null default 0.0,
  toelichting text null,
  created_at timestamptz not null default now()
);

alter table public.cao_profiles enable row level security;

drop policy if exists "cao_profiles_admin_all" on public.cao_profiles;
create policy "cao_profiles_admin_all"
  on public.cao_profiles for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "cao_profiles_read_authenticated" on public.cao_profiles;
create policy "cao_profiles_read_authenticated"
  on public.cao_profiles for select
  to authenticated using (true);

insert into public.cao_profiles (naam, vakantiegeld_pct, pensioen_pct, ziekteverzuim_pct, overige_opslagen_pct, toelichting)
values
  ('Metaal & Techniek', 8.0, 4.5, 2.5, 1.5, 'CAO Metaal en Techniek - RAI/Jaarbeurs/Beurzen'),
  ('Bouw & Infra', 8.0, 5.5, 3.0, 2.0, 'CAO Bouw en Infra'),
  ('Geen CAO', 8.0, 0.0, 0.0, 0.0, 'Evenementen en overig zonder CAO')
on conflict do nothing;

-- 2. EXTRA VELDEN AAN PROFILES
alter table public.profiles
  add column if not exists cao_profile_id uuid null references public.cao_profiles(id) on delete set null,
  add column if not exists telefoon text null,
  add column if not exists bsn text null,
  add column if not exists geboortedatum date null,
  add column if not exists iban text null,
  add column if not exists type_medewerker text not null default 'personeel' check (type_medewerker in ('personeel', 'zzp')),
  add column if not exists in_dienst_datum date null,
  add column if not exists notities text null;

-- 3. FACTUURREGELS
create table if not exists public.factuur_regels (
  id uuid primary key default gen_random_uuid(),
  jaar int not null,
  maand int not null,
  week int not null,
  opdrachtgever_id uuid null references public.clients(id) on delete set null,
  opdrachtgever_naam text null,
  medewerker_id uuid null references public.profiles(id) on delete set null,
  medewerker_naam text null,
  type_dienst text not null default 'uren' check (type_dienst in ('uren', 'dag')),
  uren numeric null,
  dagen numeric null,
  kilometers numeric null default 0,
  extra_info_1 text null,
  extra_info_2 text null,
  inkoop_uurtarief numeric null,
  inkoop_dagtarief numeric null,
  inkoop_km_tarief numeric null default 0.19,
  inkoop_totaal numeric generated always as (
    coalesce(uren * inkoop_uurtarief, 0) +
    coalesce(dagen * inkoop_dagtarief, 0) +
    coalesce(kilometers * inkoop_km_tarief, 0)
  ) stored,
  verkoop_uurtarief numeric null,
  verkoop_dagtarief numeric null,
  verkoop_km_tarief numeric null default 0.23,
  verkoop_totaal numeric generated always as (
    coalesce(uren * verkoop_uurtarief, 0) +
    coalesce(dagen * verkoop_dagtarief, 0) +
    coalesce(kilometers * verkoop_km_tarief, 0)
  ) stored,
  betaald boolean not null default false,
  notities text null,
  aangemaakt_door uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.factuur_regels enable row level security;

drop policy if exists "factuur_regels_admin_all" on public.factuur_regels;
create policy "factuur_regels_admin_all"
  on public.factuur_regels for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 4. GOOGLE TOKENS
create table if not exists public.google_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expiry_date bigint null,
  scope text null,
  created_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.google_tokens enable row level security;

drop policy if exists "google_tokens_own" on public.google_tokens;
create policy "google_tokens_own"
  on public.google_tokens for all
  using (auth.uid() = user_id or public.is_admin(auth.uid()))
  with check (auth.uid() = user_id or public.is_admin(auth.uid()));

-- 5. PLANNING
create table if not exists public.planning (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  datum date not null,
  start_tijd time not null,
  eind_tijd time not null,
  locatie text null,
  opdrachtgever_id uuid null references public.clients(id) on delete set null,
  opdrachtgever_naam text null,
  notities text null,
  google_event_id text null,
  aangemaakt_door uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.planning_medewerkers (
  id uuid primary key default gen_random_uuid(),
  planning_id uuid not null references public.planning(id) on delete cascade,
  medewerker_id uuid not null references public.profiles(id) on delete cascade,
  medewerker_naam text null,
  status text not null default 'uitgenodigd' check (status in ('uitgenodigd', 'geaccepteerd', 'geweigerd')),
  google_event_id text null,
  unique(planning_id, medewerker_id)
);

alter table public.planning enable row level security;
alter table public.planning_medewerkers enable row level security;

drop policy if exists "planning_admin_all" on public.planning;
create policy "planning_admin_all"
  on public.planning for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "planning_medewerker_read" on public.planning;
create policy "planning_medewerker_read"
  on public.planning for select to authenticated
  using (
    exists (
      select 1 from public.planning_medewerkers pm
      where pm.planning_id = planning.id and pm.medewerker_id = auth.uid()
    )
  );

drop policy if exists "planning_medewerkers_admin_all" on public.planning_medewerkers;
create policy "planning_medewerkers_admin_all"
  on public.planning_medewerkers for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "planning_medewerkers_read_own" on public.planning_medewerkers;
create policy "planning_medewerkers_read_own"
  on public.planning_medewerkers for select to authenticated
  using (medewerker_id = auth.uid());

drop policy if exists "planning_medewerkers_update_own" on public.planning_medewerkers;
create policy "planning_medewerkers_update_own"
  on public.planning_medewerkers for update to authenticated
  using (medewerker_id = auth.uid())
  with check (medewerker_id = auth.uid());
