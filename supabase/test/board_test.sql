-- Party leaderboard: points are capped, only recent days can be written, and only party members are seen.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'

create or replace function public._expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'BOARD TEST FAILED: %', msg; end if;
end $$;
grant execute on function public._expect(boolean, text) to anon, authenticated;

insert into auth.users (id) values (:'C') on conflict do nothing;
-- A and B share a list; C is a stranger
insert into public.list_members (list_id, user_id, role) values ('L1', :'A', 'owner'), ('L1', :'B', 'member');
insert into public.profiles (user_id, name, data) values (:'A', 'Aria', '{}'), (:'B', 'Bo', '{}'), (:'C', 'Cy', '{}');

set role anon;
do $$ begin
  perform log_points(current_date, 5);
  raise exception 'BOARD TEST FAILED: anon logged points';
exception when insufficient_privilege then null;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select log_points((now() at time zone 'utc')::date, 50);  -- capped
select log_points((now() at time zone 'utc')::date, 3);   -- a stale device: never lowers the day
select log_points((now() at time zone 'utc')::date - 1, 7);
do $$ begin
  perform log_points((now() at time zone 'utc')::date - 3, 20);
  raise exception 'BOARD TEST FAILED: backfilled an old day';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  insert into public.day_points (user_id, day, points) values (auth.uid(), current_date - 2, 20);
  raise exception 'BOARD TEST FAILED: wrote the table directly';
exception when insufficient_privilege then null;
end $$;

select set_config('request.jwt.claim.sub', :'B', false);
select log_points((now() at time zone 'utc')::date, 4);
select _expect((select count(*) from party_board()) = 2, 'B sees A and B only');
select _expect((select points from party_board() where name = 'Aria') = 27, 'A: 20 (capped) + 7');
select _expect((select days from party_board() where name = 'Aria') = 2, 'A: 2 active days');
select _expect((select points from party_board() where name = 'Bo') = 4, 'B: 4');

select set_config('request.jwt.claim.sub', :'C', false);
select _expect((select count(*) from party_board()) = 1, 'C sees only themself');
select _expect((select points from party_board()) = 0, 'C has no points');
do $$ begin
  perform * from public.day_points;
  raise exception 'BOARD TEST FAILED: read the table directly';
exception when insufficient_privilege then null;
end $$;

reset role;
select 'BOARD OK';
