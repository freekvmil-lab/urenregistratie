-- Availability table + RLS policies
--
-- Run this in Supabase SQL editor.
-- Depends on: public.is_admin(uuid) SECURITY DEFINER helper (already used elsewhere in this project).

create table if not exists public.availability (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time null,
  end_time time null,
  status text not null default 'available' check (status in ('available', 'unavailable')),
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists availability_user_date_idx on public.availability (user_id, date);

-- For the "one-click calendar" UX we store at most one all-day row per day.
-- This prevents duplicates if a user taps multiple times quickly.
create unique index if not exists availability_unique_all_day_per_user_date
  on public.availability (user_id, date)
  where start_time is null and end_time is null;

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_availability_updated_at on public.availability;
create trigger trg_availability_updated_at
before update on public.availability
for each row
execute function public.set_updated_at();

alter table public.availability enable row level security;

-- Employees can manage their own availability; admins can manage all.

drop policy if exists "availability_select_own_or_admin" on public.availability;
create policy "availability_select_own_or_admin"
  on public.availability
  for select
  using (
    auth.uid() = user_id
    or public.is_admin(auth.uid())
  );

drop policy if exists "availability_insert_own_or_admin" on public.availability;
create policy "availability_insert_own_or_admin"
  on public.availability
  for insert
  with check (
    (auth.uid() = user_id)
    or public.is_admin(auth.uid())
  );

drop policy if exists "availability_update_own_or_admin" on public.availability;
create policy "availability_update_own_or_admin"
  on public.availability
  for update
  using (
    auth.uid() = user_id
    or public.is_admin(auth.uid())
  )
  with check (
    (auth.uid() = user_id)
    or public.is_admin(auth.uid())
  );

drop policy if exists "availability_delete_own_or_admin" on public.availability;
create policy "availability_delete_own_or_admin"
  on public.availability
  for delete
  using (
    auth.uid() = user_id
    or public.is_admin(auth.uid())
  );
