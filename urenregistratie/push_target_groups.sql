-- Target groups for admin push notifications
-- Run this in Supabase SQL editor.

create table if not exists public.push_target_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_ids uuid[] not null default '{}',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_target_groups_name_idx
  on public.push_target_groups (name);

alter table public.push_target_groups enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_target_groups'
      and policyname = 'Admins manage push target groups'
  ) then
    create policy "Admins manage push target groups"
      on public.push_target_groups
      for all
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
  end if;
end $$;

-- uses function public.set_updated_at() created in push_schedules.sql

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'push_target_groups_set_updated_at'
  ) then
    create trigger push_target_groups_set_updated_at
      before update on public.push_target_groups
      for each row
      execute procedure public.set_updated_at();
  end if;
end $$;
