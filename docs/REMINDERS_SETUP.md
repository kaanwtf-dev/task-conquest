# Reminder notifications: one-time setup

Task Conquest can send each player up to two reminders a day, plus a warning before a quest's deadline and a note when one is missed:

- **Morning:** today's plan. If they have been away for a few days, a "your hero misses you" nudge instead.
- **Evening:** a streak about to end, a party member who got things done, dailies left, or a boss that is nearly down.
- **Deadlines:** a heads-up a few hours before a time-limited quest runs out, and a note within about a minute of its time running out undone (opening the app asks what happened).

Players switch reminders on in the app (Options › Reminders, or the card that appears on the quest screen). Each player picks the times and which kinds they want.

The reminders are sent by a Supabase Edge Function, `reminders`, that scheduled database jobs (pg_cron) call. Both run inside the Supabase project and are free on the free plan.

- Every half hour the function sends the morning and evening reminders and party news.
- Deadline notifications are *alarms*: each player's app works out the exact moments they are due and keeps them in the `push_alarms` table. A second job looks once a minute for alarms that are due (a single indexed lookup) and only then calls the function, which sends just those without reading anyone's save. So deadline notifications arrive on the minute, and the cost stays flat however many players there are.

## 1. Update the database

1. In Supabase, open **SQL Editor** and click **New query**.
2. Paste the whole of `supabase/schema.sql`.
3. Click **Run**.

Re-running the file is safe.

## 2. Create the function

1. Build the single-file function: `npm run build:reminders`. It writes `dist-functions/reminders.ts`.
2. In Supabase, open **Edge Functions** and choose **Deploy a new function › Via Editor**.
3. Name it `reminders`, replace the example code with the whole of `dist-functions/reminders.ts`, and click **Deploy**.

## 3. Give the function its two secrets

In **Edge Functions › Secrets** (or **Project Settings › Edge Functions**), add:

| Name                | Value                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| `VAPID_PRIVATE_KEY` | the private half of `VITE_VAPID_PUBLIC_KEY` in `.env.production`      |
| `CRON_SECRET`       | any long random text (for example `openssl rand -hex 24`)             |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase automatically. Never put the private key or the service role key in the app or in `.env.production`.

## 4. Schedule it

Open `supabase/functions/reminders/cron.sql`, put your `CRON_SECRET` where it says `CRON_SECRET_HERE` (twice), paste it into the SQL editor and run it. It calls the function at :07 and :37 past every hour, and with `?mode=alarms` on any minute an alarm is due. Running it again replaces the schedules.

## 5. Check it works

1. On the iPhone, open Task Conquest from the **Home Screen**. Reminders can't work in a Safari tab.
2. Go to **Options › Reminders**, tap **Turn on** and choose **Allow**.
3. In the SQL editor, run this (with your `CRON_SECRET`) to send a test reminder to every device that has reminders on:

   ```sql
   select net.http_post(
     url := 'https://<project-ref>.supabase.co/functions/v1/reminders?mode=test',
     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <anon key>', 'x-cron-secret', '<CRON_SECRET>'),
     body := '{}'::jsonb
   );
   ```

Within a minute every device with reminders on gets a "Test reminder". Options › Reminders shows when the job last ran. The function's **Logs** tab shows each run's counts (devices, sent, gone, failed) and any setup error, such as a wrong private key.

## Notes

- **Lost signing key.** If the private signing key is ever lost or changed, everyone has to turn reminders off and on again. A new key pair also means replacing `VITE_VAPID_PUBLIC_KEY` in `.env.production` and in `supabase/functions/reminders/index.ts`.
- **New web address.** Reminders belong to the address the app was installed from. After a move, players turn reminders on again in the new app.
- **Device sign-out.** Reminders belong to the signed-in account. Signing out on a device turns them off there.
