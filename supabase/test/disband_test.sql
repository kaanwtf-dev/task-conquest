-- Disbanding a party list: only its owner can; every other member keeps a private copy with the live quests;
-- the owner keeps the list, private again; invite codes stop working.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

create or replace function public._expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'DISBAND TEST FAILED: %', msg; end if;
end $$;
grant execute on function public._expect(boolean, text) to authenticated;

set role authenticated;

-- A makes a party list with two quests (one deleted) and a private list; B and C join the party
select set_config('request.jwt.claim.sub', :'A', false);
insert into docs (id, kind, list_id, data, updated_at) values ('L1', 'list', 'L1', '{"id":"L1","name":"Chores","shared":true,"updatedAt":100}', 100);
insert into docs (id, kind, list_id, data, updated_at) values ('T1', 'task', 'L1', '{"id":"T1","listId":"L1","title":"Dishes","updatedAt":100}', 100);
insert into docs (id, kind, list_id, data, updated_at, deleted) values ('T0', 'task', 'L1', '{"id":"T0","listId":"L1","title":"Gone"}', 100, true);
insert into docs (id, kind, list_id, data, updated_at) values ('SOLO', 'list', 'SOLO', '{"id":"SOLO","name":"Mine","shared":true}', 100);
select create_invite('L1') as code \gset
select set_config('test.code', :'code', false);
select create_invite('SOLO') as solo_code \gset
select set_config('request.jwt.claim.sub', :'B', false);
select join_list(:'code');
insert into docs (id, kind, list_id, data, updated_at) values ('T2', 'task', 'L1', '{"id":"T2","listId":"L1","title":"Trash"}', 100);
select set_config('request.jwt.claim.sub', :'C', false);
select join_list(:'code');

-- members can't disband, strangers can't either
select set_config('request.jwt.claim.sub', :'B', false);
do $$ begin
  perform disband_list('L1');
  raise exception 'DISBAND TEST FAILED: a member disbanded the list';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claim.sub', :'C', false);
do $$ begin
  perform disband_list('SOLO');
  raise exception 'DISBAND TEST FAILED: a stranger disbanded a list';
exception when insufficient_privilege then null;
end $$;

-- A disbands
select set_config('request.jwt.claim.sub', :'A', false);
select _expect(disband_list('L1') = 2, 'two copies made (B and C)');
select _expect((select count(*) from list_members where list_id = 'L1') = 1, 'only A is left in L1');
select _expect((select data->>'shared' from docs where id = 'L1') = 'false', 'L1 is private again');
select _expect((select (data->>'disbandedAt') is not null from docs where id = 'L1'), 'L1 says it was disbanded');
select _expect((select count(*) from docs where list_id = 'L1' and not deleted) = 3, 'A keeps L1 with all its quests');
select _expect((select count(*) from docs where kind = 'list') = 2, 'A does not see the copies');

-- B keeps a private copy of the list and its live quests, and no longer sees the party list
select set_config('request.jwt.claim.sub', :'B', false);
select _expect((select count(*) from docs where id = 'L1' or list_id = 'L1') = 0, 'B lost access to L1');
select _expect((select count(*) from docs where kind = 'list') = 1, 'B has one list: the copy');
select id as b_list from docs where kind = 'list' \gset
select _expect((select owner from docs where id = :'b_list') = :'B'::uuid, 'B owns the copy');
select _expect((select data->>'name' from docs where id = :'b_list') = 'Chores', 'same name');
select _expect((select data->>'shared' from docs where id = :'b_list') = 'false', 'the copy is private');
select _expect((select data->>'ownerId' from docs where id = :'b_list') = :'B', 'the copy says B owns it');
select _expect((select data->>'id' from docs where id = :'b_list') = :'b_list', 'its data carries its new id');
select _expect((select role from list_members where list_id = :'b_list' and user_id = :'B'::uuid) = 'owner', 'B is the owner member');
select _expect((select count(*) from docs where list_id = :'b_list' and kind = 'task') = 2, 'both live quests copied, not the deleted one');
select _expect((select count(*) from docs where list_id = :'b_list' and kind = 'task' and data->>'listId' = :'b_list' and data->>'id' = id) = 2, 'quest data points at the copy');
select _expect((select count(distinct id) from docs where list_id = :'b_list') = 3, 'new ids for everything');
select _expect((select count(*) from docs where list_id = :'b_list' and owner = :'B'::uuid) = 3, 'B owns every copied doc');
-- B can keep using the copy
update docs set data = data || '{"title":"Dishes!"}', updated_at = 999999999999999 where list_id = :'b_list' and data->>'title' = 'Dishes';
select _expect((select count(*) from docs where list_id = :'b_list' and data->>'title' = 'Dishes!') = 1, 'B edits the copy');

select set_config('request.jwt.claim.sub', :'C', false);
select _expect((select count(*) from docs where kind = 'list') = 1, 'C has their own copy');
select _expect((select count(*) from docs d join list_members m on m.list_id = d.id where d.kind = 'list') = 1, 'C sees only their membership');
-- old invite codes no longer work
do $$ begin
  perform join_list(current_setting('test.code', true));
  raise exception 'DISBAND TEST FAILED: an old invite code still works';
exception when no_data_found then null;
end $$;
reset role;
select _expect((select count(*) from invites where list_id = 'L1') = 0, 'L1 invites deleted');
select _expect((select count(*) from invites where list_id = 'SOLO') = 1, 'other lists keep theirs');
select _expect((select data->>'title' from docs where id = 'T1') = 'Dishes', 'B editing the copy left A''s quest alone');
set role authenticated;

-- a party list with nobody else: just private again
select set_config('request.jwt.claim.sub', :'A', false);
select _expect(disband_list('SOLO') = 0, 'no copies for a one-member party');
select _expect((select data->>'shared' from docs where id = 'SOLO') = 'false', 'SOLO private');

-- the copy-for-member switch is not something a client can use to plant rows for others
do $$ begin
  insert into docs (id, kind, list_id, owner, data, updated_at) values ('PLANT', 'list', 'PLANT', '00000000-0000-0000-0000-00000000000b', '{}', 1);
end $$;
reset role;
select _expect((select owner from docs where id = 'PLANT') = '00000000-0000-0000-0000-00000000000a'::uuid, 'a client insert is always owned by the caller');
drop function public._expect(boolean, text);
\echo 'disband_test.sql: all assertions passed'
