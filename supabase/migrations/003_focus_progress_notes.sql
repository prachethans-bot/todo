-- Persist editable focus-session notes without changing existing task data.
alter table public.tasks
  add column if not exists progress_note text not null default '';
