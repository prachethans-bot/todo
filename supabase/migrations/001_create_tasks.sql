-- Run this migration in the Supabase SQL Editor for your project.
create extension if not exists pgcrypto;
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  mode text not null check (mode in ('NEW_TASK','NEXT_STEP','TOO_HARD','TIME_CHECK')),
  micro_step text not null check (char_length(micro_step) between 1 and 2000),
  created_at timestamptz not null default now(),
  completed boolean not null default false,
  reminder_at timestamptz,
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes > 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes > 0)
);
create index if not exists tasks_user_created_idx on public.tasks(user_id, created_at desc);
alter table public.tasks enable row level security;
drop policy if exists "Users can read their own tasks" on public.tasks;
create policy "Users can read their own tasks" on public.tasks for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own tasks" on public.tasks;
create policy "Users can create their own tasks" on public.tasks for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks" on public.tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks" on public.tasks for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.tasks to authenticated;
