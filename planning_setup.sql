-- Google tokens opslag
create table if not exists public.google_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expiry_date bigint null,
  scope text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.google_tokens enable row level security;

drop policy if exists "google_tokens_own" on public.google_tokens;
create policy "google_tokens_own"
  on public.google_tokens for all
  using (auth.uid() = user_id or public.is_admin(auth.uid()))
  with check (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Planning tabel
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  on public.planning for select
  to authenticated
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
  on public.planning_medewerkers for select
  to authenticated
  using (medewerker_id = auth.uid());

drop policy if exists "planning_medewerkers_update_own" on public.planning_medewerkers;
create policy "planning_medewerkers_update_own"
  on public.planning_medewerkers for update
  to authenticated
  using (medewerker_id = auth.uid())
  with check (medewerker_id = auth.uid());
