-- Questlog cloud sync + party lists for Supabase.
-- Paste this whole file into the Supabase SQL editor and press Run. Re-running it is safe.
--
-- Every synced record (hero, list, task, item, potion stack) is one row in `docs`. Clients merge
-- locally (last write wins by updated_at, hero counters as a CRDT); the server only guards access
-- and refuses writes that are older than what it already has.

-- ---------------------------------------------------------------- tables

create table if not exists public.docs (
  id text primary key,
  kind text not null check (kind in ('hero', 'list', 'task', 'item', 'potion')),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id text,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_ts timestamptz not null default clock_timestamp(),
  -- lists are their own list_id, tasks belong to a list, personal docs to nobody's list
  constraint docs_list_shape check (
    (kind = 'list' and list_id is not null and list_id = id)
    or (kind = 'task' and list_id is not null)
    or (kind in ('hero', 'item', 'potion') and list_id is null)
  )
);
create index if not exists docs_server_ts_idx on public.docs (server_ts);
create index if not exists docs_list_id_idx on public.docs (list_id);
create index if not exists docs_owner_idx on public.docs (owner);

create table if not exists public.list_members (
  list_id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists list_members_user_idx on public.list_members (user_id);

create table if not exists public.invites (
  code text primary key,
  list_id text not null,
  created_by uuid default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists invites_list_idx on public.invites (list_id);

-- public card shown to party members: name + data { appearance, classId, level, title }
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text,
  data jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers (used by policies)

create or replace function public.is_member(p_list_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_members m where m.list_id = p_list_id and m.user_id = auth.uid()
  );
$$;

-- true when the caller and p_user share at least one list (party members can see each other's hero card)
create or replace function public.shares_list(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.list_members a join public.list_members b on a.list_id = b.list_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

-- true once anyone has created this list (stops a stranger from "creating" someone else's list id)
create or replace function public.list_taken(p_list_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.docs d where d.id = p_list_id)
      or exists (select 1 from public.list_members m where m.list_id = p_list_id);
$$;

-- The app's personal ids are namespaced '<kind>:<user id>[:...]'. An id in such a namespace must match
-- the row's kind and belong to the caller: user ids are visible to other players, so a squatted
-- 'hero:<id>' or 'item:<id>:...' row (of another kind, or a task in the squatter's own list) would
-- otherwise block that player's sync for good.
create or replace function public.own_doc_id(p_kind text, p_id text) returns boolean
language sql stable set search_path = '' as $$
  select case
    when starts_with(p_id, 'hero:') or starts_with(p_id, 'item:') or starts_with(p_id, 'potion:') then
      p_kind in ('hero', 'item', 'potion')
      and (p_id = p_kind || ':' || auth.uid()::text or starts_with(p_id, p_kind || ':' || auth.uid()::text || ':'))
    else true
  end;
$$;

-- ---------------------------------------------------------------- triggers

create or replace function public.docs_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.kind := old.kind;
    new.owner := old.owner; -- ownership never changes hands
    if new.updated_at < old.updated_at then
      return old; -- last write wins: an older write never clobbers the newer server copy
    end if;
  else
    new.owner := coalesce(auth.uid(), new.owner);
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists docs_before_write on public.docs;
create trigger docs_before_write before insert or update on public.docs
  for each row execute function public.docs_before_write();

create or replace function public.docs_after_insert_list() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.list_members (list_id, user_id, role)
  values (new.id, new.owner, 'owner')
  on conflict (list_id, user_id) do nothing;
  return null;
end $$;

drop trigger if exists docs_after_insert_list on public.docs;
create trigger docs_after_insert_list after insert on public.docs
  for each row when (new.kind = 'list') execute function public.docs_after_insert_list();

-- ---------------------------------------------------------------- row-level security

alter table public.docs enable row level security;
alter table public.list_members enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "docs: read" on public.docs;
create policy "docs: read" on public.docs for select to authenticated using (
  (list_id is null and owner = (select auth.uid()))
  or (list_id is not null and public.is_member(list_id))
  -- upserts (insert ... on conflict do update) must also be able to read the list row they create
  or (kind = 'list' and owner = (select auth.uid()) and not public.list_taken(id))
);

drop policy if exists "docs: insert" on public.docs;
create policy "docs: insert" on public.docs for insert to authenticated with check (
  public.own_doc_id(kind, id) and (
    (list_id is null and owner = (select auth.uid()))
    or (list_id is not null and public.is_member(list_id))
    -- a brand-new list, before its owner membership exists (added by docs_after_insert_list)
    or (kind = 'list' and id = list_id and owner = (select auth.uid()) and not public.list_taken(id))
  )
);

drop policy if exists "docs: update" on public.docs;
create policy "docs: update" on public.docs for update to authenticated
  using ((list_id is null and owner = (select auth.uid())) or (list_id is not null and public.is_member(list_id)))
  with check ((list_id is null and owner = (select auth.uid())) or (list_id is not null and public.is_member(list_id)));
-- no delete policy: deletions are tombstones (deleted = true) so they sync like any other edit

drop policy if exists "members: read" on public.list_members;
create policy "members: read" on public.list_members for select to authenticated using (public.is_member(list_id));

drop policy if exists "members: leave" on public.list_members;
create policy "members: leave" on public.list_members for delete to authenticated using (user_id = (select auth.uid()));
-- joining only happens through join_list() / the list-creation trigger

drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_list(user_id));

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- invites: no policies; only the functions below touch them

-- Supabase grants ALL (incl. TRUNCATE, which ignores row-level security) on new tables by default
revoke all on public.docs, public.list_members, public.invites, public.profiles from anon, authenticated;
grant select, insert, update on public.docs to authenticated;
grant select, delete on public.list_members to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.docs, public.list_members, public.invites, public.profiles to service_role;

-- ---------------------------------------------------------------- party functions

create or replace function public.create_invite(p_list_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I/L
  v_code text;
  v_bytes bytea;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.is_member(p_list_id) then
    raise exception 'not a member of this list' using errcode = '42501';
  end if;
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, get_byte(v_bytes, i) % length(alphabet) + 1, 1);
    end loop;
    insert into public.invites (code, list_id, created_by)
    values (v_code, p_list_id, auth.uid())
    on conflict (code) do nothing;
    exit when found;
  end loop;
  return v_code;
end $$;

create or replace function public.join_list(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_list text;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select i.list_id into v_list
  from public.invites i
  where i.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_list is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  insert into public.list_members (list_id, user_id, role)
  values (v_list, auth.uid(), 'member')
  on conflict (list_id, user_id) do nothing;
  return v_list;
end $$;

create or replace function public.leave_list(p_list_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
begin
  delete from public.list_members m
  where m.list_id = p_list_id and m.user_id = auth.uid()
  returning m.role into v_role;
  -- an owner leaving hands the crown to the longest-standing member
  if v_role = 'owner' and not exists (
    select 1 from public.list_members m where m.list_id = p_list_id and m.role = 'owner'
  ) then
    update public.list_members m set role = 'owner'
    where (m.list_id, m.user_id) = (
      select m2.list_id, m2.user_id from public.list_members m2
      where m2.list_id = p_list_id order by m2.joined_at, m2.user_id limit 1
    );
  end if;
end $$;

create or replace function public.list_party(p_list_id text)
returns table (user_id uuid, role text, name text, data jsonb)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.role, p.name, p.data
  from public.list_members m
  left join public.profiles p on p.user_id = m.user_id
  where m.list_id = p_list_id and public.is_member(p_list_id)
  order by m.joined_at, m.user_id;
$$;

revoke execute on function public.is_member(text), public.list_taken(text), public.own_doc_id(text, text),
  public.create_invite(text), public.join_list(text), public.leave_list(text), public.list_party(text)
  from public, anon;
grant execute on function public.is_member(text), public.list_taken(text), public.own_doc_id(text, text),
  public.create_invite(text), public.join_list(text), public.leave_list(text), public.list_party(text)
  to authenticated;

-- ---------------------------------------------------------------- realtime

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
    ) then
      alter publication supabase_realtime add table public.docs;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'list_members'
    ) then
      alter publication supabase_realtime add table public.list_members;
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------- reminder notifications
-- One row per device that turned reminders on. The app saves it through save_push_subscription(); the
-- scheduled sender (scripts/push) reads it with the service role and keeps `history` (what went out when).

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',
  prefs jsonb not null default '{}'::jsonb,
  history jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: read own" on public.push_subscriptions;
create policy "push: read own" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "push: delete own" on public.push_subscriptions;
create policy "push: delete own" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- Save (or move to the signed-in player) this device's subscription and its reminder settings.
-- Endpoints must belong to a known push service: the sender posts to them.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_tz text, p_prefs jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_endpoint is null or length(p_endpoint) > 1024
     or p_endpoint !~ '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/' then
    raise exception 'not a push service endpoint' using errcode = '22023';
  end if;
  -- the keys a browser makes: a 65-byte P-256 point and a 16-byte secret, base64url (junk would make the
  -- sender waste time on every run)
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_+/-]{87}=?$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_+/-]{22}(==)?$'
     or coalesce(length(p_tz), 0) not between 1 and 64 or pg_column_size(p_prefs) > 4096
     or jsonb_typeof(p_prefs) is distinct from 'object' then
    raise exception 'invalid subscription' using errcode = '22023';
  end if;
  insert into public.push_subscriptions as s (endpoint, user_id, p256dh, auth, tz, prefs, updated_at)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, p_tz, p_prefs, clock_timestamp())
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    tz = excluded.tz,
    prefs = excluded.prefs,
    -- another player signing in on this device starts with a clean slate
    history = case when s.user_id = excluded.user_id then s.history else '{}'::jsonb end,
    updated_at = clock_timestamp();
  -- a handful of devices per player is plenty; the oldest ones go
  delete from public.push_subscriptions p
  where p.user_id = auth.uid() and p.endpoint in (
    select q.endpoint from public.push_subscriptions q
    where q.user_id = auth.uid() order by q.updated_at desc offset 10
  );
end $$;

revoke execute on function public.save_push_subscription(text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, jsonb) to authenticated;

-- When the reminder sender last ran (Options shows it, so a stalled schedule gets noticed).
create table if not exists public.push_status (
  id int primary key default 1 check (id = 1),
  last_run timestamptz,
  stats jsonb
);
alter table public.push_status enable row level security;
revoke all on public.push_status from anon, authenticated;
grant all on public.push_status to service_role;

create or replace function public.reminders_last_run() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select s.last_run from public.push_status s where s.id = 1;
$$;
revoke execute on function public.reminders_last_run() from public, anon;
grant execute on function public.reminders_last_run() to authenticated;
