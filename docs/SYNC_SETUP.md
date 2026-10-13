# Cloud sync and party lists: setup

Questlog works fully offline, and you don't need any of this to play. If you want to:

- **sync** your hero and lists between iPhone and Mac, or
- **share** lists (groceries, chores…) with friends and family in real time,

you can connect a free [Supabase](https://supabase.com) project. Setup takes about 10 minutes and needs no coding. The data then lives in your own project.

---

## 1. Create a free Supabase project

1. Go to **supabase.com** and sign up. The free plan is enough.
2. Click **New project**.
3. Name it `questlog` and choose a database password. Keep the password somewhere safe; the app never asks for it.
4. Pick the region closest to you and click **Create new project**.
5. Wait a minute or two while the project starts.

## 2. Create the tables

1. In the left sidebar, open **SQL Editor** and click **New query**.
2. Open the file [`supabase/schema.sql`](../supabase/schema.sql) from this repository and copy all of it. On GitHub, open the file, click **Raw**, then select all and copy.
3. Paste it into the editor and click **Run**.

You should see *"Success. No rows returned"*. It is safe to run the file again later, for example after an app update.

## 3. Turn on email sign-in

Go to **Authentication → Sign In / Providers → Email** (older dashboards: **Authentication → Providers → Email**).

- Make sure **Email** is enabled.
- **Recommended:** switch **Confirm email** off and click **Save**. New accounts then work immediately.
- **If you keep confirmation on:** after you tap *Create account*, Supabase emails you a link. On iPhone that link opens in Safari, not the home-screen app. That's fine: open the link once, then go back to Questlog and sign in with the same email and password. The free plan only sends a few emails per hour, which is another reason to switch confirmation off.
- Under **Authentication → URL Configuration**, set **Site URL** to the address of your app (for example `https://yourname.github.io/TODOLIST/`). Confirmation links then lead back to the app instead of `localhost`.

## 4. Connect the app

You need two values from Supabase. Click **Connect** at the top of the project dashboard, or open **Project Settings**:

- **Project URL** (Project Settings → **Data API**), which looks like `https://abcdefgh.supabase.co`. Copy only that part, without `/rest/v1`.
- **anon public key** (Project Settings → **API Keys** → **Legacy API Keys** tab), a long text that starts with `eyJ…`. If your project has no legacy tab, use the **Publishable key** (`sb_publishable_…`) instead.

> The anon / publishable key is meant to be public. Your data is protected by the access rules in `schema.sql`: each person can only read their own hero and the lists they belong to. **Never** paste the `service_role` or **secret** key (`sb_secret_…`) into the app.

Then connect the app in one of two ways.

**Option A: type the values into the app, on each device.**
Open the **Party** tab, then **Connect a cloud**. Paste the URL and the key, then tap **Connect**.

**Option B: build the values into your published site.**
Everyone who opens your site is then connected automatically. This is the easiest way to share lists with friends.

1. In your GitHub repository, go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add `VITE_SUPABASE_URL` with the Project URL.
3. Add a second secret, `VITE_SUPABASE_ANON_KEY`, with the anon public key.
4. Redeploy: on the **Actions** tab, re-run the deploy workflow, or push any commit.

## 5. Use it

- **First device:** in the Party tab, tap **Create account** with your email and a password of at least 6 characters, then sign in. Your hero and lists upload.
- **Other devices:** connect to the same project and **Sign in** with the same email and password. If that device already has its own hero, Questlog asks what to do:
  - **Use the cloud save:** this device becomes a copy of the cloud.
  - **Merge both:** keeps all lists and adds up both heroes' progress.
  - **Overwrite the cloud with this device:** this device's hero and lists replace the cloud's. Shared party lists are kept.
- **Share a list:**
  1. In the Party tab, find the list and tap **Share**, then **Send link**. You can also read out the 6-letter code.
  2. Your friend opens the link, or types the code under **Join a party list**.
  3. Friends need their own account on the **same Supabase project**. Either they use your site (Option B), or they enter your URL and key (Option A).
- **What everyone sees:** checks appear for everyone within a second or two. Whoever completes a quest gets the XP and gold.
- **Leave a list:** tap **Leave party list** in the Party tab, or **Leave** in the list's **⋯** menu. The list disappears from your devices, and the others keep it. This also works offline: the server is told once you are back online.
- **Delete vs. leave:** only the owner can delete a party list, and deleting it removes it for everyone. **Start over** (Options) and **Import save** never delete lists you joined. Start over leaves them, and an import keeps them as they are.
- **A different account on the same device:** if someone signs in with another account on a device that holds a hero, Questlog asks whether to start fresh or bring this device's hero and lists into the new account. Nothing is uploaded until you choose. Party lists stay with the account that joined them.
- **Offline:** keep playing; you stay signed in. Changes sync automatically when the connection returns. The Party tab shows the sync status, and **Sync now** forces a sync. Signing out also works offline.

## Troubleshooting

| Message or problem | Fix |
| --- | --- |
| *Wrong email or password* | Check both. Passwords are case-sensitive. |
| *The Project URL looks wrong* | Tap **Change cloud project** and paste the URL again, exactly like `https://abcdefgh.supabase.co`. |
| *Confirm your email first* | Open the confirmation email, or switch **Confirm email** off (step 3). |
| *This list is not in the cloud yet* | The list was just created. Wait a few seconds and try again. |
| *That invite code does not exist* | Check the code. Codes never use 0, O, 1, I or L. |
| Status says **Sync error** | Run `schema.sql` again (step 2), then check the URL and key in the Party tab (**Change cloud project**). |
| Nothing syncs after a quiet week | Free projects pause when idle. Open the Supabase dashboard and click **Restore project**. |
| Changes only appear after ~30 seconds | Realtime is off. Under **Database → Publications → supabase_realtime**, the tables `docs` and `list_members` should be on (`schema.sql` turns them on). Sync still works without realtime, just more slowly. |

## How it works (for the curious)

- Every hero, list, task, item and potion stack is one row in the `docs` table.
- Each device keeps the full copy and syncs in the background. For lists, tasks and items, the most recent edit wins.
- Hero progress (XP, gold, kills, skills…) is counted per device and combined, so progress made offline on two devices adds up and is never lost.
- The database only lets you read and write your own records and the lists you were invited to. It also refuses to overwrite a newer record with an older one.
