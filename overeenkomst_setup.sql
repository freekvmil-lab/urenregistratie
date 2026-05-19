-- Overeenkomsten van opdracht voor ZZP'ers
create table if not exists public.overeenkomsten (
  id uuid primary key default gen_random_uuid(),
  planning_id uuid null references public.planning(id) on delete set null,
  zzp_id uuid not null references public.profiles(id) on delete cascade,
  zzp_naam text null,
  zzp_email text null,
  zzp_kvk text null,
  zzp_btw text null,
  zzp_adres text null,
  zzp_iban text null,
  opdracht_omschrijving text not null,
  locatie text null,
  datum_van date not null,
  datum_tot date null,
  tarief numeric null,
  tarief_type text not null default 'uur' check (tarief_type in ('uur', 'dag')),
  status text not null default 'concept' check (status in ('concept', 'verstuurd', 'getekend', 'geweigerd')),
  getekend_op timestamptz null,
  getekend_ip text null,
  notities text null,
  aangemaakt_door uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.overeenkomsten enable row level security;

drop policy if exists "overeenkomsten_admin_all" on public.overeenkomsten;
create policy "overeenkomsten_admin_all"
  on public.overeenkomsten for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "overeenkomsten_zzp_read_own" on public.overeenkomsten;
create policy "overeenkomsten_zzp_read_own"
  on public.overeenkomsten for select
  to authenticated
  using (zzp_id = auth.uid());

drop policy if exists "overeenkomsten_zzp_teken" on public.overeenkomsten;
create policy "overeenkomsten_zzp_teken"
  on public.overeenkomsten for update
  to authenticated
  using (zzp_id = auth.uid() and status = 'verstuurd')
  with check (zzp_id = auth.uid());
