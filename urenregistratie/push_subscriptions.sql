-- Push subscriptions for Web Push notifications
-- Run this in Supabase SQL editor.

create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_user_endpoint
  on public.push_subscriptions (user_id, endpoint);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'push_subscriptions'
      and policyname = 'Users manage own push subscriptions'
  ) then
    create policy "Users manage own push subscriptions"
      on public.push_subscriptions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
