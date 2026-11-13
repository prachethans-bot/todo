alter table public.tasks
  add column if not exists requires_verification boolean not null default false;
