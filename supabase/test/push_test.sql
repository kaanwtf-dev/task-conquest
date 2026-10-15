-- Reminder notification subscriptions: who can save, see, move and remove them.
\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

create or replace function public._expect(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'PUSH TEST FAILED: %', msg; end if;
end $$;
grant execute on function public._expect(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------- signed out: nothing
set role anon;
do $$ begin
  perform save_push_subscription('https://web.push.apple.com/x', 'k', 'a', 'UTC', '{}');
  raise exception 'PUSH TEST FAILED: anon saved a subscription';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------- A saves a device
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select save_push_subscription('https://web.push.apple.com/E1', 'p256', 'auth', 'Europe/Istanbul', '{"morningHour":9}');
select _expect((select count(*) from push_subscriptions) = 1, 'A sees own device');
select _expect((select tz from push_subscriptions where endpoint = 'https://web.push.apple.com/E1') = 'Europe/Istanbul', 'tz saved');

-- only real push services, sane sizes
do $$ begin
  perform save_push_subscription('https://evil.example.com/hook', 'k', 'a', 'UTC', '{}');
  raise exception 'PUSH TEST FAILED: accepted a non-push endpoint';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  perform save_push_subscription('https://web.push.apple.com.evil.com/x', 'k', 'a', 'UTC', '{}');
  raise exception 'PUSH TEST FAILED: accepted a look-alike host';
exception when invalid_parameter_value then null;
end $$;
do $$ begin
  perform save_push_subscription('https://fcm.googleapis.com/x', 'k', 'a', 'UTC', '[]');
  raise exception 'PUSH TEST FAILED: accepted non-object prefs';
exception when invalid_parameter_value then null;
end $$;

-- no direct writes: everything goes through the function
do $$ begin
  update push_subscriptions set history = '{"x":1}';
  raise exception 'PUSH TEST FAILED: direct update allowed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into push_subscriptions (endpoint, p256dh, auth) values ('https://web.push.apple.com/E9', 'k', 'a');
  raise exception 'PUSH TEST FAILED: direct insert allowed';
exception when insufficient_privilege then null;
end $$;

-- ---------------------------------------------------------------- the sender records history
reset role;
update push_subscriptions set history = '{"sent":{"morning":"2026-10-15"}}' where endpoint = 'https://web.push.apple.com/E1';
set role authenticated;

-- ---------------------------------------------------------------- B: cannot see A's; signing in on A's device moves it
select set_config('request.jwt.claim.sub', :'B', false);
select _expect((select count(*) from push_subscriptions) = 0, 'B does not see A''s devices');
delete from push_subscriptions where endpoint = 'https://web.push.apple.com/E1';
reset role;
select _expect((select count(*) from push_subscriptions) = 1, 'B could not delete A''s device');
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select save_push_subscription('https://web.push.apple.com/E1', 'p2', 'a2', 'UTC', '{}');
select _expect((select count(*) from push_subscriptions) = 1, 'B now owns the device');
reset role;
select _expect((select user_id from push_subscriptions where endpoint = 'https://web.push.apple.com/E1') = :'B'::uuid, 'moved to B');
select _expect((select history from push_subscriptions where endpoint = 'https://web.push.apple.com/E1') = '{}'::jsonb, 'history reset for the new player');
set role authenticated;

-- saving again as the same player keeps history
reset role;
update push_subscriptions set history = '{"comebacks":2}' where endpoint = 'https://web.push.apple.com/E1';
set role authenticated;
select set_config('request.jwt.claim.sub', :'B', false);
select save_push_subscription('https://web.push.apple.com/E1', 'p3', 'a3', 'Asia/Tokyo', '{"off":["party"]}');
reset role;
select _expect((select history->>'comebacks' from push_subscriptions where endpoint = 'https://web.push.apple.com/E1') = '2', 'own re-save keeps history');
set role authenticated;

-- ---------------------------------------------------------------- at most 10 devices per player, oldest go
select set_config('request.jwt.claim.sub', :'A', false);
do $$ begin
  for i in 1..12 loop
    perform save_push_subscription('https://fcm.googleapis.com/fcm/send/D' || i, 'k', 'a', 'UTC', '{}');
  end loop;
end $$;
select _expect((select count(*) from push_subscriptions) = 10, 'capped at 10 devices');
select _expect(not exists (select 1 from push_subscriptions where endpoint like '%/D1' or endpoint like '%/D2'), 'oldest dropped');

-- A removes a device
delete from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/D12';
select _expect((select count(*) from push_subscriptions) = 9, 'A removed own device');

reset role;
select 'PUSH OK';

-- ---------------------------------------------------------------- sender heartbeat: readable only as a time
reset role;
insert into push_status (id, last_run, stats) values (1, '2026-10-15 09:07+00', '{"sent":2}')
  on conflict (id) do update set last_run = excluded.last_run, stats = excluded.stats;
set role authenticated;
select set_config('request.jwt.claim.sub', :'A', false);
select _expect(reminders_last_run() = '2026-10-15 09:07+00'::timestamptz, 'players can see when reminders last ran');
do $$ begin
  perform 1 from push_status;
  raise exception 'PUSH TEST FAILED: players can read the sender stats';
exception when insufficient_privilege then null;
end $$;
set role anon;
do $$ begin
  perform reminders_last_run();
  raise exception 'PUSH TEST FAILED: anon read the heartbeat';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'HEARTBEAT OK';
