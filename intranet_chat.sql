-- Intranet main channel: announcements + replies
-- Run this in Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.intranet_messages (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid null references public.intranet_messages(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists intranet_messages_parent_id_created_at_idx
  on public.intranet_messages (parent_id, created_at);

create index if not exists intranet_messages_created_at_idx
  on public.intranet_messages (created_at desc);

alter table public.intranet_messages enable row level security;

-- Everyone logged in can read all intranet messages
drop policy if exists "intranet_messages_read_all" on public.intranet_messages;
create policy "intranet_messages_read_all"
on public.intranet_messages
for select
to authenticated
using (true);

-- Insert rules:
-- - Admin can post top-level announcements (parent_id is null)
-- - Any authenticated user can post replies (parent_id is not null)
drop policy if exists "intranet_messages_insert" on public.intranet_messages;
create policy "intranet_messages_insert"
on public.intranet_messages
for insert
to authenticated
with check (
  (parent_id is not null)
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- Only admin can edit/delete (keeps it simple)
drop policy if exists "intranet_messages_admin_update" on public.intranet_messages;
create policy "intranet_messages_admin_update"
on public.intranet_messages
for update
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

drop policy if exists "intranet_messages_admin_delete" on public.intranet_messages;
create policy "intranet_messages_admin_delete"
on public.intranet_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
