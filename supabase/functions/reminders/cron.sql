-- Runs the "reminders" Edge Function every half hour (at :07 and :37). Run once in the SQL editor after
-- deploying the function and setting its CRON_SECRET secret; re-running replaces the schedule.
-- Replace the x-cron-secret value below with the same text as the function's CRON_SECRET secret.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'task-conquest-reminders',
  '7,37 * * * *',
  $job$
  select net.http_post(
    url := 'https://sqshacllpzozxqpetwyo.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- the public anon key (the same one the app ships with): only lets the call through Supabase's gateway
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxc2hhY2xscHpvenhxcGV0d3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MzU2MDksImV4cCI6MjEwNzUxMTYwOX0.6x9579iEy12hOXRT8mrKJLZWhkeuTu92Z3k4rVdISjo',
      'x-cron-secret', 'CRON_SECRET_HERE'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 140000
  );
  $job$
);
