-- ============================================================
-- MASTER SETUP SCRIPT - Run in Supabase SQL Editor
-- ============================================================

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text null,
  email text null,
  role text not null default 'employee' check (role in ('admin', 'employee', 'sub-contractor')),
  hourly_rate numeric null,
  home_address text null,
  break_enabled boolean not null default false,
  default_break_minutes integer not null default 0,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- is_admin helper function (used by RLS policies)
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin' and p.deleted_at is null
  )
$$;

-- Profiles RLS
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
  on public.profiles for insert
  with check (public.is_admin(auth.uid()) or auth.uid() = id);

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
  on public.profiles for delete
  using (public.is_admin(auth.uid()));

-- 2. CLIENTS TABLE
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists "clients_admin_all" on public.clients;
create policy "clients_admin_all"
  on public.clients for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "clients_employee_read" on public.clients;
create policy "clients_employee_read"
  on public.clients for select
  to authenticated
  using (true);

-- 3. EMPLOYEE-CLIENTS LINK TABLE
create table if not exists public.employee_clients (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (employee_id, client_id)
);

alter table public.employee_clients enable row level security;

drop policy if exists "employee_clients_admin_all" on public.employee_clients;
create policy "employee_clients_admin_all"
  on public.employee_clients for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "employee_clients_read_own" on public.employee_clients;
create policy "employee_clients_read_own"
  on public.employee_clients for select
  to authenticated
  using (employee_id = auth.uid());

-- 4. TIME ENTRIES TABLE
create table if not exists public.time_entries (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time text null,
  end_time text null,
  manual boolean null default false,
  edited boolean null default false,
  approved boolean not null default false,
  approved_at timestamptz null,
  approved_by uuid null references public.profiles(id) on delete set null,
  client text null,
  client_id uuid null references public.clients(id) on delete set null,
  location text null,
  kilometers numeric null,
  parking_paid boolean null,
  parking_cost numeric null,
  break_minutes integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists time_entries_user_date_idx on public.time_entries (user_id, date);

alter table public.time_entries enable row level security;

-- Time entries RLS (admins)
drop policy if exists "time_entries_admin_select_all" on public.time_entries;
create policy "time_entries_admin_select_all"
  on public.time_entries for select
  using (public.is_admin(auth.uid()));

drop policy if exists "time_entries_admin_insert" on public.time_entries;
create policy "time_entries_admin_insert"
  on public.time_entries for insert
  with check (public.is_admin(auth.uid()) and coalesce(approved, false) = false);

drop policy if exists "time_entries_admin_update" on public.time_entries;
create policy "time_entries_admin_update"
  on public.time_entries for update
  using (public.is_admin(auth.uid()));

drop policy if exists "time_entries_admin_delete" on public.time_entries;
create policy "time_entries_admin_delete"
  on public.time_entries for delete
  using (public.is_admin(auth.uid()) and coalesce(approved, false) = false);

-- Time entries RLS (employees)
drop policy if exists "time_entries_employee_select_own" on public.time_entries;
create policy "time_entries_employee_select_own"
  on public.time_entries for select
  using (user_id = auth.uid());

drop policy if exists "time_entries_employee_insert_own" on public.time_entries;
create policy "time_entries_employee_insert_own"
  on public.time_entries for insert
  with check (user_id = auth.uid() and coalesce(approved, false) = false and approved_at is null and approved_by is null);

drop policy if exists "time_entries_employee_update_own" on public.time_entries;
create policy "time_entries_employee_update_own"
  on public.time_entries for update
  using (user_id = auth.uid() and coalesce(approved, false) = false)
  with check (user_id = auth.uid() and coalesce(approved, false) = false);

drop policy if exists "time_entries_employee_delete_own" on public.time_entries;
create policy "time_entries_employee_delete_own"
  on public.time_entries for delete
  using (user_id = auth.uid() and coalesce(approved, false) = false);

-- 5. AVAILABILITY TABLE
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

create unique index if not exists availability_unique_all_day
  on public.availability (user_id, date)
  where start_time is null and end_time is null;

alter table public.availability enable row level security;

drop policy if exists "availability_select" on public.availability;
create policy "availability_select"
  on public.availability for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "availability_insert" on public.availability;
create policy "availability_insert"
  on public.availability for insert
  with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "availability_update" on public.availability;
create policy "availability_update"
  on public.availability for update
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "availability_delete" on public.availability;
create policy "availability_delete"
  on public.availability for delete
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- 6. INSERT ADMIN PROFILE (jouw account)
insert into public.profiles (id, name, email, role)
values (
  'aa35a510-a6c2-4e67-9270-ede2f91a454e',
  'Freek',
  'info@fvmgroup.nl',
  'admin'
)
on conflict (id) do update
  set role = 'admin', name = excluded.name, email = excluded.email;
