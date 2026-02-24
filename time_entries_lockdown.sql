-- Time entries: employees can edit/delete only while NOT approved
-- Run this in Supabase SQL editor.

begin;

-- Ensure required columns exist (safe on existing tables)
alter table if exists public.time_entries
  add column if not exists approved boolean not null default false;

alter table if exists public.time_entries
  add column if not exists approved_at timestamptz null;

alter table if exists public.time_entries
  add column if not exists approved_by uuid null references public.profiles(id) on delete set null;

-- Enable RLS
alter table public.time_entries enable row level security;

-- Drop & recreate policies to be deterministic

drop policy if exists time_entries_admin_all on public.time_entries;
create policy time_entries_admin_all
on public.time_entries
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deleted_at is null
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deleted_at is null
  )
);

-- Employees can read their own entries

drop policy if exists time_entries_employee_select_own on public.time_entries;
create policy time_entries_employee_select_own
on public.time_entries
for select
to authenticated
using (user_id = auth.uid());

-- Employees can insert their own entries (always unapproved)

drop policy if exists time_entries_employee_insert_own_pending on public.time_entries;
create policy time_entries_employee_insert_own_pending
on public.time_entries
for insert
to authenticated
with check (
  user_id = auth.uid()
  and coalesce(approved, false) = false
  and approved_at is null
  and approved_by is null
);

-- Employees can update their own entries only while pending (unapproved)

drop policy if exists time_entries_employee_update_own_pending on public.time_entries;
create policy time_entries_employee_update_own_pending
on public.time_entries
for update
to authenticated
using (
  user_id = auth.uid()
  and coalesce(approved, false) = false
)
with check (
  user_id = auth.uid()
  and coalesce(approved, false) = false
  and approved_at is null
  and approved_by is null
);

-- Employees can delete their own entries only while pending (unapproved)

drop policy if exists time_entries_employee_delete_own_pending on public.time_entries;
create policy time_entries_employee_delete_own_pending
on public.time_entries
for delete
to authenticated
using (
  user_id = auth.uid()
  and coalesce(approved, false) = false
);

commit;
