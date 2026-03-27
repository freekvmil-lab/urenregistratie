-- Sub-Contractor role: allows managing hours for assigned employees
-- Run this in Supabase SQL editor after time_entries_lockdown.sql
--
-- This adds:
-- 1. A table to track which sub-contractors can manage which employees
-- 2. RLS policies for sub-contractors to view and manage hours for their assigned employees

begin;

-- Create table to track sub-contractor assignments
create table if not exists public.sub_contractor_assignments (
  id bigserial primary key,
  sub_contractor_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  created_by uuid null references public.profiles(id) on delete set null,
  
  -- Ensure a sub-contractor can only have one assignment per employee
  unique(sub_contractor_id, employee_id)
);

create index if not exists sub_contractor_assignments_sub_contractor_idx 
on public.sub_contractor_assignments(sub_contractor_id);
create index if not exists sub_contractor_assignments_employee_idx 
on public.sub_contractor_assignments(employee_id);

-- Enable RLS
alter table public.sub_contractor_assignments enable row level security;

-- Only admins can manage assignments
drop policy if exists sub_contractor_assignments_admin_all on public.sub_contractor_assignments;
create policy sub_contractor_assignments_admin_all
on public.sub_contractor_assignments
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deleted_at is null
  )
);

-- Sub-contractors can see their own assignments
drop policy if exists sub_contractor_assignments_view_own on public.sub_contractor_assignments;
create policy sub_contractor_assignments_view_own
on public.sub_contractor_assignments
for select
to authenticated
using (
  sub_contractor_id = auth.uid()
);

-- Add Sub-Contractor policies to time_entries

-- Sub-contractors can read time entries for assigned employees
drop policy if exists time_entries_subcontractor_select_assigned on public.time_entries;
create policy time_entries_subcontractor_select_assigned
on public.time_entries
for select
to authenticated
using (
  (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'sub-contractor'
        and p.deleted_at is null
    )
    and exists (
      select 1 from public.sub_contractor_assignments sca
      where sca.sub_contractor_id = auth.uid()
        and sca.employee_id = user_id
    )
  )
  or (
    -- Sub-contractors can also read their own entries
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'sub-contractor'
        and p.deleted_at is null
    )
  )
);

-- Sub-contractors can insert time entries for assigned employees (unapproved only)
drop policy if exists time_entries_subcontractor_insert_for_assigned on public.time_entries;
create policy time_entries_subcontractor_insert_for_assigned
on public.time_entries
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'sub-contractor'
      and p.deleted_at is null
  )
  and (
    -- Can add hours for themselves
    user_id = auth.uid()
    or
    -- Or for assigned employees
    exists (
      select 1 from public.sub_contractor_assignments sca
      where sca.sub_contractor_id = auth.uid()
        and sca.employee_id = user_id
    )
  )
  and coalesce(approved, false) = false
  and approved_at is null
  and approved_by is null
);

-- Sub-contractors can update time entries for assigned employees (unapproved only)
drop policy if exists time_entries_subcontractor_update_for_assigned on public.time_entries;
create policy time_entries_subcontractor_update_for_assigned
on public.time_entries
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'sub-contractor'
      and p.deleted_at is null
  )
  and (
    -- Can edit their own
    user_id = auth.uid()
    or
    -- Or assigned employees
    exists (
      select 1 from public.sub_contractor_assignments sca
      where sca.sub_contractor_id = auth.uid()
        and sca.employee_id = user_id
    )
  )
  and coalesce(approved, false) = false
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'sub-contractor'
      and p.deleted_at is null
  )
  and coalesce(approved, false) = false
  and approved_at is null
  and approved_by is null
);

-- Sub-contractors can delete time entries for assigned employees (unapproved only)
drop policy if exists time_entries_subcontractor_delete_for_assigned on public.time_entries;
create policy time_entries_subcontractor_delete_for_assigned
on public.time_entries
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'sub-contractor'
      and p.deleted_at is null
  )
  and (
    -- Can delete their own
    user_id = auth.uid()
    or
    -- Or assigned employees
    exists (
      select 1 from public.sub_contractor_assignments sca
      where sca.sub_contractor_id = auth.uid()
        and sca.employee_id = user_id
    )
  )
  and coalesce(approved, false) = false
);

commit;
