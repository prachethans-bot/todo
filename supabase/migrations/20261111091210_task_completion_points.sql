alter table public.tasks
  add column if not exists points_awarded integer not null default 0
  check (points_awarded >= 0 and points_awarded <= 35);
