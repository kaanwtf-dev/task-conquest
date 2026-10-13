-- Row-level security tests for schema.sql (run via run_rls_tests.sh against a local Postgres).
-- Users: A owns a shared list, B joins it via invite, C is a stranger.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

create or replace function public._expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'RLS TEST FAILED: %', msg; end if;
end $$;
grant execute on function public._expect(boolean, text) to authenticated;

set role authenticated;

-- ---------------------------------------------------------------- A creates data
select set_config('request.jwt.claim.sub', :'A', false);
insert into docs (id, kind, list_id, data, updated_at) values ('L1', 'list', 'L1', '{"name":"Groceries"}', 100);
insert into docs (id, kind, list_id, data, updated_at) values ('T1', 'task', 'L1', '{"title":"Milk"}', 100);
insert into docs (id, kind, list_id, data, updated_at) values ('L2', 'list', 'L2', '{"name":"Private"}', 100);
insert into docs (id, kind, list_id, data, updated_at) values ('T2', 'task', 'L2', '{"title":"Secret"}', 100);
insert into docs (id, kind, list_id, data, updated_at) values ('ITEM-A', 'item', null, '{"name":"Sword"}', 100);
insert into docs (id, kind, list_id, data, updated_at) values ('hero:' || :'A', 'hero', null, '{"name":"A"}', 100);
select _expect((select count(*) from docs) = 6, 'A sees all 6 own docs');
select _expect((select owner from docs where id = 'L1') = :'A'::uuid, 'owner defaults to auth.uid()');
select _expect(exists (select 1 from list_members where list_id = 'L1' and user_id = :'A'::uuid), 'list owner auto-added as member');
select _expect((select server_ts from docs where id = 'L1') is not null, 'server_ts set');

-- ---------------------------------------------------------------- B is a stranger at first
select set_config('request.jwt.claim.sub', :'B', false);
select _expect((select count(*) from docs) = 0, 'stranger B sees nothing');
do $$ begin
  insert into docs (id, kind, list_id, data, updated_at) values ('TB', 'task', 'L1', '{}', 200);
  raise exception 'RLS TEST FAILED: stranger inserted a task into L1';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  -- hijack attempt: upsert over A's list doc
  insert into docs (id, kind, list_id, data, updated_at) values ('L1', 'list', 'L1', '{"name":"pwned"}', 999)
  on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;
  raise exception 'RLS TEST FAILED: stranger hijacked list L1';
exception when insufficient_privilege then null;
end $$;
update docs set data = '{"title":"pwned"}' where id = 'T1';
do $$ begin
  -- forging membership directly
  insert into list_members (list_id, user_id, role) values ('L1', '00000000-0000-0000-0000-00000000000b', 'owner');
  raise exception 'RLS TEST FAILED: B forged a membership row';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into docs (id, kind, list_id, data, updated_at) values ('ITEM-X', 'item', null, '{}', 1);
  -- personal docs are fine, but must be owned by B
end $$;

-- ---------------------------------------------------------------- A invites B
select set_config('request.jwt.claim.sub', :'A', false);
select _expect((select data->>'title' from docs where id = 'T1') = 'Milk', 'stranger update had no effect');
select create_invite('L1') as code \gset
select _expect(length(:'code') >= 6, 'invite code length');

select set_config('request.jwt.claim.sub', :'C', false);
do $$ begin
  perform create_invite('L1');
  raise exception 'RLS TEST FAILED: non-member created an invite';
exception when others then
  if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
end $$;
do $$ begin
  perform join_list('NOPE00');
  raise exception 'RLS TEST FAILED: joined with a bogus code';
exception when others then
  if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
end $$;

select set_config('request.jwt.claim.sub', :'B', false);
select _expect(join_list(:'code') = 'L1', 'B joins L1 with the code');
select _expect((select count(*) from docs where list_id = 'L1') = 2, 'B sees L1 list + task');
select _expect((select count(*) from docs where list_id = 'L2') = 0, 'B cannot see A''s other list');
select _expect((select count(*) from docs where kind in ('item', 'hero') and owner = :'A'::uuid) = 0, 'B cannot see A''s personal docs');
insert into docs (id, kind, list_id, data, updated_at) values ('T3', 'task', 'L1', '{"title":"Eggs"}', 150);
update docs set data = '{"title":"Milk","done":true}', updated_at = 300 where id = 'T1';
select _expect((select data->>'done' from docs where id = 'T1') = 'true', 'member can update a shared task');
select _expect((select owner from docs where id = 'T1') = :'A'::uuid, 'owner unchanged by member update');
update docs set owner = :'B'::uuid where id = 'T1';
select _expect((select owner from docs where id = 'T1') = :'A'::uuid, 'owner column is immutable');
-- last-write-wins guard: an older write never clobbers a newer one
update docs set data = '{"title":"stale"}', updated_at = 250 where id = 'T1';
select _expect((select data->>'title' from docs where id = 'T1') = 'Milk', 'stale write rejected (LWW)');
select _expect((select count(*) from list_members where list_id = 'L1') = 2, 'B sees both members');
select _expect((select count(*) from list_party('L1')) = 2, 'list_party returns members');

-- ---------------------------------------------------------------- C still locked out
select set_config('request.jwt.claim.sub', :'C', false);
select _expect((select count(*) from docs) = 0, 'C sees nothing');
select _expect((select count(*) from list_members) = 0, 'C sees no memberships');
do $$ begin
  perform list_party('L1');
  -- allowed to call, but must not leak members
  if (select count(*) from list_party('L1')) > 0 then
    raise exception 'RLS TEST FAILED: list_party leaked members to a stranger';
  end if;
exception when others then
  if sqlerrm like 'RLS TEST FAILED%' then raise; end if;
end $$;

-- ---------------------------------------------------------------- B leaves
select set_config('request.jwt.claim.sub', :'B', false);
select leave_list('L1');
select _expect((select count(*) from docs where list_id = 'L1') = 0, 'B lost access after leaving');

select set_config('request.jwt.claim.sub', :'A', false);
select _expect((select count(*) from docs where list_id = 'L1') = 3, 'A still has L1 incl. B''s task');

reset role;
drop function public._expect(boolean, text);
\echo 'rls_test.sql: all assertions passed'
