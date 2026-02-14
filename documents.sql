-- Employee documents (Supabase Storage + metadata)
-- Run this in Supabase SQL editor.

-- 1) Metadata table
create extension if not exists "pgcrypto";

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  object_path text not null unique,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists employee_documents_employee_id_idx
  on public.employee_documents (employee_id);

create index if not exists employee_documents_created_at_idx
  on public.employee_documents (created_at desc);

alter table public.employee_documents enable row level security;

-- Helper predicate: is admin
-- (kept inline in policies to avoid needing a SQL function)

drop policy if exists "employee_documents_admin_all" on public.employee_documents;
create policy "employee_documents_admin_all"
on public.employee_documents
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "employee_documents_employee_read_own" on public.employee_documents;
create policy "employee_documents_employee_read_own"
on public.employee_documents
for select
to authenticated
using (employee_id = auth.uid());

-- 2) Storage bucket
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id)
do update set public = excluded.public;

-- 3) Storage policies
-- Note: storage.objects uses 'bucket_id' + 'name' (full path)

drop policy if exists "storage_employee_docs_admin_all" on storage.objects;
create policy "storage_employee_docs_admin_all"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  bucket_id = 'employee-documents'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "storage_employee_docs_employee_read_own" on storage.objects;
create policy "storage_employee_docs_employee_read_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and name like ('employee/' || auth.uid() || '/%')
);

-- Optional (enable if you want employees to upload their own docs)
-- drop policy if exists "storage_employee_docs_employee_insert_own" on storage.objects;
-- create policy "storage_employee_docs_employee_insert_own"
-- on storage.objects
-- for insert
-- to authenticated
-- with check (
--   bucket_id = 'employee-documents'
--   and name like ('employee/' || auth.uid() || '/%')
-- );
