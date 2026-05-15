-- FACTUURREGELS TABEL
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
  -- Inkoop (wat jij betaalt)
  inkoop_uurtarief numeric null,
  inkoop_dagtarief numeric null,
  inkoop_km_tarief numeric null default 0.19,
  inkoop_totaal numeric generated always as (
    coalesce(uren * inkoop_uurtarief, 0) +
    coalesce(dagen * inkoop_dagtarief, 0) +
    coalesce(kilometers * inkoop_km_tarief, 0)
  ) stored,
  -- Verkoop (wat jij factureert)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists factuur_regels_jaar_maand_idx on public.factuur_regels (jaar, maand);
create index if not exists factuur_regels_opdrachtgever_idx on public.factuur_regels (opdrachtgever_id);

alter table public.factuur_regels enable row level security;

drop policy if exists "factuur_regels_admin_all" on public.factuur_regels;
create policy "factuur_regels_admin_all"
  on public.factuur_regels for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
