-- Upsert-path, id-squatting, privilege and leave/ownership probes (run via run_rls_tests.sh).
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
create or replace function public._ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'PROBE FAILED: %', msg; end if; end $$;
-- runs a statement, returns the error code or 'ok'
create or replace function public._try(stmt text) returns text language plpgsql as $$
begin execute stmt; return 'ok'; exception when others then return sqlstate || ' ' || sqlerrm; end $$;
grant execute on function public._ok(boolean, text), public._try(text) to authenticated;
create or replace function public._up(p_id text, p_kind text, p_list text, p_data jsonb, p_at bigint, p_del boolean default false) returns text
language plpgsql as $$
begin
  -- the statement PostgREST issues for supabase-js upsert(rows, { onConflict: 'id' })
  with s as (
    insert into public.docs (id, kind, list_id, data, updated_at, deleted)
    values (p_id, p_kind, p_list, p_data, p_at, p_del)
    on conflict (id) do update set id = excluded.id, kind = excluded.kind, list_id = excluded.list_id,
      data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    returning 1)
  select 1 into strict p_at from s;
  return 'ok';
exception when others then return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function public._up(text, text, text, jsonb, bigint, boolean) to authenticated;
set role authenticated;

select set_config('request.jwt.claim.sub', :'A', false);
select _ok(_up('L1', 'list', 'L1', '{"name":"G"}', 100) = 'ok', 'A creates list by upsert');
select _ok(_up('L2', 'list', 'L2', '{"name":"P"}', 100) = 'ok', 'A creates private list by upsert');
select _ok(_up('T1', 'task', 'L1', '{"title":"Milk"}', 100) = 'ok', 'A creates task');
select _ok(_up('T2', 'task', 'L2', '{"title":"Secret"}', 100) = 'ok', 'A creates private task');
select _ok(_up('hero:' || :'A', 'hero', null, '{"name":"A"}', 100) = 'ok', 'A hero');
select _ok(_up('item:' || :'A' || ':starter', 'item', null, '{}', 100) = 'ok', 'A item');
select _ok(_up('potion:' || :'A' || ':insight:1', 'potion', null, '{}', 100) = 'ok', 'A potion');
select _ok(_up('item:' || :'B' || ':x', 'item', null, '{}', 100) like '42501%', 'A cannot write in B''s namespace');
select _ok(_up('free-id', 'item', null, '{}', 100) = 'ok', 'un-namespaced personal ids stay private');
select _ok(_up('hero:' || :'A' || '-2', 'hero', null, '{}', 100) like '42501%', 'namespace needs the separator');
select _ok(_up('L1', 'list', 'L1', '{"name":"G2"}', 150) = 'ok', 'A updates own list by upsert');
select _ok(_up('T1', 'task', 'L1', '{"title":"old"}', 90) = 'ok', 'stale upsert does not error');
select _ok((select data->>'title' from docs where id = 'T1') = 'Milk', 'stale upsert kept server copy');
select _ok(_up('T1', 'task', 'L1', '{"title":"same-ts"}', 100) = 'ok', 'equal stamp upsert');
select _ok((select data->>'title' from docs where id = 'T1') = 'same-ts', 'equal stamp accepted');
select _ok(_up('LX', 'list', 'LX', '{}', 1, true) = 'ok', 'tombstone of a never-synced list is accepted');
select _ok(_up('LY', 'list', 'L1', '{}', 1) like '23514%', 'list must be its own list_id');
select _ok(_up('TZ', 'task', null, '{}', 1) like '23514%', 'task needs a list');
select create_invite('L1') as code \gset
select _ok(:'code' ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'invite code alphabet');

select set_config('request.jwt.claim.sub', :'B', false);
select _ok(_up('T1', 'task', 'L1', '{"title":"pwn"}', 999) like '42501%', 'stranger cannot upsert a task');
select _ok(_up('L1', 'list', 'L1', '{"name":"pwn"}', 999) like '42501%', 'stranger cannot hijack a list');
select _ok(_up('hero:' || :'A', 'item', null, '{}', 999) like '42501%', 'no squatting via another kind');
select _ok(_up('LB', 'list', 'LB', '{"name":"b"}', 1) = 'ok', 'B creates own list');
select _ok(_up('item:' || :'C' || ':s', 'task', 'LB', '{}', 1) like '42501%', 'no squatting via a task');
select _ok(_up('hero:x', 'list', 'hero:x', '{}', 1) like '42501%', 'no list in a personal namespace');
select _ok(_try('truncate public.docs') like '42501%', 'no truncate');
select _ok(_try('delete from public.docs') like '42501%' or (select count(*) from docs) = 1, 'no deletes');
select _ok(join_list(lower(substr(:'code', 1, 3)) || '-' || substr(:'code', 4)) = 'L1', 'join with sloppy code');
select _ok(_up('T3', 'task', 'L1', '{"title":"Eggs"}', 200) = 'ok', 'member adds task');
select _ok(_up('T1', 'task', 'L1', '{"title":"done"}', 300) = 'ok', 'member edits task');
select _ok(_up('T1', 'task', 'L2', '{"title":"moved"}', 400) like '42501%', 'member cannot move a task into a list they cannot see');
select _ok(_up('T3', 'task', 'LB', '{"title":"Eggs"}', 500) = 'ok', 'member can move a task to their own list');
select _ok(_try('update public.docs set kind = ''item'', list_id = null where id = ''T1''') <> 'ok', 'task cannot become a personal doc');
select _ok(_try('update public.list_members set role = ''owner'' where list_id = ''L1''') like '42501%', 'cannot promote self');
select _ok(_try('insert into public.invites (code, list_id) values (''AAAAAA'', ''L2'')') like '42501%', 'cannot forge invites');
select _ok(_try('select * from public.invites') like '42501%', 'cannot read invites');
select _ok(_try('update public.profiles set name = ''x''') = 'ok', 'profile update runs');
select _ok(_try('insert into public.profiles (user_id, name) values (''' || :'A' || ''', ''fake'')') like '42501%', 'cannot write others'' profile');

select set_config('request.jwt.claim.sub', :'A', false);
select leave_list('L1');
select _ok((select role from list_members where list_id = 'L1' and user_id = :'B'::uuid) is null, 'A no longer sees L1 members');
select set_config('request.jwt.claim.sub', :'B', false);
select _ok((select role from list_members where list_id = 'L1' and user_id = :'B'::uuid) = 'owner', 'crown passed to B');
select _ok((select count(*) from list_party('L1')) = 1, 'party of one');
select set_config('request.jwt.claim.sub', :'A', false);
select _ok(_up('L1', 'list', 'L1', '{"name":"back"}', 9999) like '42501%', 'ex-member cannot write');
select _ok((select count(*) from docs where list_id = 'L1') = 0, 'ex-member cannot read');
reset role;
\echo 'probe2: all passed'
