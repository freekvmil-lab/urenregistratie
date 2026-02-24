-- Scheduled / recurring push notifications
-- Run this in Supabase SQL editor.

create table if not exists public.push_schedules (
  id uuid primary key default gen_random_uuid(),
  name text null,
  enabled boolean not null default true,

  title text not null,
  body text not null,
  url text not null default '/',

  target_all boolean not null default true,
  target_user_ids uuid[] null,
  target_group_ids uuid[] null,

  -- If all repeat_* are null: one-off schedule (runs once and disables)
  repeat_minutes integer null,
  repeat_weeks integer null,
  repeat_months integer null,

  next_run_at timestamptz not null default now(),
  last_run_at timestamptz null,

  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table existed already, ensure newer columns are present.
alter table public.push_schedules
  add column if not exists repeat_weeks integer null;

alter table public.push_schedules
  add column if not exists repeat_months integer null;

-- Optional: at most one repeat_* column can be set.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'push_schedules_one_repeat'
  ) then
    alter table public.push_schedules
      add constraint push_schedules_one_repeat
      check (
        (case when repeat_minutes is null then 0 else 1 end)
        + (case when repeat_weeks is null then 0 else 1 end)
        + (case when repeat_months is null then 0 else 1 end)
        <= 1
      );
  end if;
end $$;

create index if not exists push_schedules_next_run
  on public.push_schedules (enabled, next_run_at);

alter table public.push_schedules enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_schedules'
      and policyname = 'Admins manage push schedules'
  ) then
    create policy "Admins manage push schedules"
      on public.push_schedules
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

-- auto-update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'push_schedules_set_updated_at'
  ) then
    create trigger push_schedules_set_updated_at
      before update on public.push_schedules
      for each row
      execute procedure public.set_updated_at();
  end if;
end $$;
