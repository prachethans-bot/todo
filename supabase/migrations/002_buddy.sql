-- Accountability Buddy. Run in the Supabase SQL Editor after 001.
-- The friend never signs in: access is by an unguessable invite token.
-- The owner proves ownership with a separate secret owner_key.
-- Tables are locked down; everything goes through the functions below.
create table if not exists public.buddy_invites (
  token text primary key check (char_length(token) between 16 and 64),
  owner_key text not null check (char_length(owner_key) between 16 and 64),
  owner_name text not null check (char_length(owner_name) between 1 and 40),
  state text not null default 'pending' check (state in ('pending','active','paused','removed')),
  task_label text not null default '',
  activity text not null default 'idle' check (activity in ('idle','focusing','break','done')),
  session_id text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.buddy_cheers (
  id bigint generated always as identity primary key,
  token text not null references public.buddy_invites(token) on delete cascade,
  session_id text not null,
  emoji text not null check (emoji in ('👏','🔥','💪','❤️')),
  created_at timestamptz not null default now()
);
create index if not exists buddy_cheers_token_idx on public.buddy_cheers(token, id);
alter table public.buddy_invites enable row level security;
alter table public.buddy_cheers enable row level security;
revoke all on public.buddy_invites, public.buddy_cheers from anon, authenticated;

create or replace function public.buddy_create(p_token text, p_owner_key text, p_name text)
returns void language sql security definer set search_path = public as $$
  insert into buddy_invites(token, owner_key, owner_name) values (p_token, p_owner_key, left(p_name, 40));
$$;

-- What the friend is allowed to see: nothing but this.
create or replace function public.buddy_view(p_token text)
returns table(owner_name text, state text, task_label text, activity text, session_id text, cheers_used int)
language sql security definer set search_path = public as $$
  select i.owner_name, i.state,
    case when i.state = 'active' then i.task_label else '' end,
    case when i.state = 'active' then i.activity else 'idle' end,
    i.session_id,
    (select count(*)::int from buddy_cheers c where c.token = i.token and c.session_id = i.session_id)
  from buddy_invites i where i.token = p_token and i.state <> 'removed';
$$;

create or replace function public.buddy_accept(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update buddy_invites set state = 'active', updated_at = now() where token = p_token and state = 'pending';
  return found;
end $$;

create or replace function public.buddy_cheer(p_token text, p_emoji text)
returns boolean language plpgsql security definer set search_path = public as $$
declare r buddy_invites;
begin
  select * into r from buddy_invites where token = p_token and state = 'active';
  if not found or r.session_id = '' then return false; end if;
  if (select count(*) from buddy_cheers where token = p_token and session_id = r.session_id) >= 3 then return false; end if;
  insert into buddy_cheers(token, session_id, emoji) values (p_token, r.session_id, p_emoji);
  return true;
end $$;

create or replace function public.buddy_push(p_token text, p_owner_key text, p_label text, p_activity text, p_session text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update buddy_invites set task_label = left(p_label, 200), activity = p_activity,
    session_id = p_session, updated_at = now()
  where token = p_token and owner_key = p_owner_key and state in ('pending','active','paused');
  return found;
end $$;

create or replace function public.buddy_set_state(p_token text, p_owner_key text, p_state text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_state not in ('active','paused','removed') then return false; end if;
  update buddy_invites set state = p_state, updated_at = now()
  where token = p_token and owner_key = p_owner_key and state <> 'removed'
    and (p_state <> 'active' or state in ('paused','active'));
  return found;
end $$;

create or replace function public.buddy_owner_poll(p_token text, p_owner_key text, p_after bigint)
returns table(state text, last_id bigint, emojis text[])
language sql security definer set search_path = public as $$
  select i.state,
    coalesce((select max(c.id) from buddy_cheers c where c.token = i.token), 0),
    coalesce((select array_agg(c.emoji order by c.id) from buddy_cheers c where c.token = i.token and c.id > p_after), '{}')
  from buddy_invites i where i.token = p_token and i.owner_key = p_owner_key;
$$;

grant execute on function public.buddy_create(text,text,text), public.buddy_view(text), public.buddy_accept(text),
  public.buddy_cheer(text,text), public.buddy_push(text,text,text,text,text),
  public.buddy_set_state(text,text,text), public.buddy_owner_poll(text,text,bigint) to anon, authenticated;
