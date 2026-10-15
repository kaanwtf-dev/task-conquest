# Reminder notifications: one-time setup

Questlog can send each player up to two reminders a day:

- **Morning:** today's plan. If they have been away for a few days, a "your hero misses you" nudge instead.
- **Evening:** a streak about to end, a party member who got things done, dailies left, or a boss that is nearly down.

Players switch reminders on in the app (Options › Reminders, or the card that appears on the quest screen). Each player picks the times and which kinds they want.

The reminders are sent by a small scheduled job in this repository, `.github/workflows/reminders.yml`, which runs every half hour and costs nothing. It needs three things that only the owner can do.

## 1. Update the database

1. In Supabase, open **SQL Editor** and click **New query**.
2. Paste the whole of `supabase/schema.sql`.
3. Click **Run**.

Re-running the file is safe. It adds the table that stores each device's reminder settings.

## 2. Give the job its two secrets

The job needs two secrets:

- the Supabase secret key, so it can read who wants reminders and what their quests are;
- the private half of the reminder signing key.

The public half of the signing key is already in `.env.production`.

To get the Supabase key, open **Project Settings › API Keys** in Supabase. Either create and copy a key in the **Secret keys** tab (it starts with `sb_secret_`), or open the **Legacy API keys** tab and copy the `service_role` key.

Never put this key in the app or in `.env.production`. It only goes into a GitHub secret.

In GitHub, go to the repository's **Settings › Secrets and variables › Actions › New repository secret**. Add two secrets:

| Name                  | Value                                        |
| --------------------- | -------------------------------------------- |
| `SUPABASE_SECRET_KEY` | the Supabase secret key from above           |
| `VAPID_PRIVATE_KEY`   | the private signing key you were given       |

Until both secrets exist, every scheduled run does nothing and succeeds.

## 3. Check it works

1. On the iPhone, open Questlog from the **Home Screen**. Reminders can't work in a Safari tab.
2. Go to **Options › Reminders**, tap **Turn on** and choose **Allow**.
3. In GitHub, open **Actions › Reminders › Run workflow**, keep the mode on **test**, and click **Run workflow**.

Within a minute every device with reminders on gets a "Test reminder". From then on the reminders follow each player's chosen times.

Options › Reminders shows when the job last ran. If it says the job hasn't run for hours, open GitHub **Actions › Reminders** and check that the workflow is enabled.

## Notes

- **Lost signing key.** If the private signing key is ever lost or changed, everyone has to turn reminders off and on again. A new key pair also means replacing `VITE_VAPID_PUBLIC_KEY` in `.env.production`.
- **Inactive repository.** GitHub switches off scheduled jobs in repositories without activity for 60 days. The job switches itself back on once a day, so reminders keep coming without anyone committing.
- **Device sign-out.** Reminders belong to the signed-in account. Signing out on a device turns them off there.
