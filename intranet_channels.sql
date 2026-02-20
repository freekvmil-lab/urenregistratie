-- Multi-channel intranet (Discord-like): channels + memberships + channel-scoped messages
-- Run this in Supabase SQL editor AFTER intranet_chat.sql.

create extension if not exists "pgcrypto";

-- Channels
create table if not exists public.intranet_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  is_private boolean not null default true,
  announcements_only boolean not null default false,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (name)
);

create index if not exists intranet_channels_created_at_idx
  on public.intranet_channels (created_at desc);

alter table public.intranet_channels enable row level security;

-- Channel members
create table if not exists public.intranet_channel_members (
  channel_id uuid not null references public.intranet_channels(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (channel_id, member_id)
);

create index if not exists intranet_channel_members_member_id_idx
  on public.intranet_channel_members (member_id);

alter table public.intranet_channel_members enable row level security;

-- Add channel_id to messages and backfill existing messages into a default channel.
-- Also widen indexes for channel-scoped fetch.
do $$
declare
  default_channel_id uuid;
begin
  select id into default_channel_id from public.intranet_channels where lower(name) = 'algemeen' limit 1;
  if default_channel_id is null then
    insert into public.intranet_channels (name, description, is_private, announcements_only)
    values ('algemeen', 'Algemeen kanaal', false, true)
    returning id into default_channel_id;
  end if;

  begin
    alter table public.intranet_messages
      add column if not exists channel_id uuid null references public.intranet_channels(id) on delete cascade;
  exception when others then
    -- ignore
  end;

  update public.intranet_messages
    set channel_id = default_channel_id
    where channel_id is null;

  begin
    alter table public.intranet_messages alter column channel_id set not null;
  exception when others then
    -- ignore (already NOT NULL or cannot change)
  end;

  create index if not exists intranet_messages_channel_parent_created_at_idx
    on public.intranet_messages (channel_id, parent_id, created_at);

  create index if not exists intranet_messages_channel_created_at_idx
    on public.intranet_messages (channel_id, created_at desc);
end $$;

-- -----------------
-- RLS POLICIES
-- -----------------

-- Channels: authenticated can see public channels, and private channels they are a member of.
drop policy if exists "intranet_channels_read" on public.intranet_channels;
create policy "intranet_channels_read"
on public.intranet_channels
for select
to authenticated
using (
  (is_private = false)
  or exists (
    select 1
    from public.intranet_channel_members m
    where m.channel_id = intranet_channels.id
      and m.member_id = auth.uid()
  )
);

-- Only admin can create/update/delete channels (simple + safe)
drop policy if exists "intranet_channels_admin_insert" on public.intranet_channels;
create policy "intranet_channels_admin_insert"
on public.intranet_channels
for insert
to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "intranet_channels_admin_update" on public.intranet_channels;
create policy "intranet_channels_admin_update"
on public.intranet_channels
for update
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "intranet_channels_admin_delete" on public.intranet_channels;
create policy "intranet_channels_admin_delete"
on public.intranet_channels
for delete
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Members: members can see member list of channels they belong to; admin can manage.
drop policy if exists "intranet_channel_members_read" on public.intranet_channel_members;
create policy "intranet_channel_members_read"
on public.intranet_channel_members
for select
to authenticated
using (
  -- IMPORTANT: don't reference intranet_channel_members in a subquery here,
  -- otherwise Postgres/Supabase can detect infinite recursion in RLS evaluation.
  -- Admin can see all memberships; users can see only their own membership rows.
  (member_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "intranet_channel_members_admin_insert" on public.intranet_channel_members;
create policy "intranet_channel_members_admin_insert"
on public.intranet_channel_members
for insert
to authenticated
with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "intranet_channel_members_admin_delete" on public.intranet_channel_members;
create policy "intranet_channel_members_admin_delete"
on public.intranet_channel_members
for delete
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Messages: readable if user can see the channel.
drop policy if exists "intranet_messages_read_all" on public.intranet_messages;
drop policy if exists "intranet_messages_read_by_channel" on public.intranet_messages;
create policy "intranet_messages_read_by_channel"
on public.intranet_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.intranet_channels c
    where c.id = intranet_messages.channel_id
      and (
        c.is_private = false
        or exists (
          select 1
          from public.intranet_channel_members m
          where m.channel_id = c.id
            and m.member_id = auth.uid()
        )
      )
  )
);

-- Insert: allowed if user has access to channel.
-- If channel.announcements_only = true, only admin can create top-level posts (parent_id is null).
drop policy if exists "intranet_messages_insert" on public.intranet_messages;
create policy "intranet_messages_insert"
on public.intranet_messages
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.intranet_channels c
    where c.id = intranet_messages.channel_id
      and (
        c.is_private = false
        or exists (
          select 1
          from public.intranet_channel_members m
          where m.channel_id = c.id
            and m.member_id = auth.uid()
        )
      )
      and (
        c.announcements_only = false
        or parent_id is not null
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  )
);

-- Update/delete stays admin-only, as before (keeps moderation simple)
drop policy if exists "intranet_messages_admin_update" on public.intranet_messages;
create policy "intranet_messages_admin_update"
on public.intranet_messages
for update
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "intranet_messages_admin_delete" on public.intranet_messages;
create policy "intranet_messages_admin_delete"
on public.intranet_messages
for delete
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
