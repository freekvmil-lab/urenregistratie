-- CAO PROFIELEN TABEL
create table if not exists public.cao_profiles (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  vakantiegeld_pct numeric not null default 8.0,
  pensioen_pct numeric not null default 0.0,
  ziekteverzuim_pct numeric not null default 0.0,
  overige_opslagen_pct numeric not null default 0.0,
  toelichting text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  to authenticated
  using (true);

-- EXTRA KOLOMMEN AAN PROFILES TOEVOEGEN
alter table public.profiles
  add column if not exists cao_profile_id uuid null references public.cao_profiles(id) on delete set null,
  add column if not exists telefoon text null,
  add column if not exists bsn text null,
  add column if not exists geboortedatum date null,
  add column if not exists iban text null,
  add column if not exists type_medewerker text not null default 'personeel' check (type_medewerker in ('personeel', 'zzp')),
  add column if not exists in_dienst_datum date null,
  add column if not exists notities text null;

-- STANDAARD CAO PROFIELEN INVOEGEN
insert into public.cao_profiles (naam, vakantiegeld_pct, pensioen_pct, ziekteverzuim_pct, overige_opslagen_pct, toelichting)
values
  ('Metaal & Techniek', 8.0, 4.5, 2.5, 1.5, 'CAO Metaal en Techniek - RAI/Jaarbeurs/Beurzen'),
  ('Bouw & Infra', 8.0, 5.5, 3.0, 2.0, 'CAO Bouw en Infra'),
  ('Geen CAO', 8.0, 0.0, 0.0, 0.0, 'Evenementen en overig zonder CAO')
on conflict do nothing;
