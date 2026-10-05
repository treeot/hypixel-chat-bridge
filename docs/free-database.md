# Save Railway usage with a free database

By default the Railway template keeps data in SQLite on a Railway Volume. You can point `DATABASE_URL` at a free hosted database instead and delete the Volume. Two providers fit: **MongoDB Atlas** (free M0 cluster) and **Neon** (free Postgres).

## Is it worth it?

The savings are small:

| You switch from | To a free database | Saves about |
|---|---|---|
| SQLite on a Railway Volume (default template) | Atlas or Neon free tier | \$0.15/month (the Volume) |
| Railway Postgres plugin | Atlas or Neon free tier | \$1/month |

These are estimates at Railway's Hobby rates (see the cost table in the [README](../README.md#cost-on-railway)). Most of the bill is the bot's own RAM and CPU, which a database switch does not change.

The data is tiny: settings, Discord↔Minecraft links, the white/blacklist, the waitlist and the bot's Minecraft login tokens. It fits in any free tier.

> [!IMPORTANT]
> The database holds the bot's Minecraft login tokens. Treat `DATABASE_URL` like a password: anyone with it can use that Minecraft account. Don't paste it in Discord, issues or screenshots.

## Which one?

**MongoDB Atlas M0 is the better fit for a bridge that runs 24/7.** Neon's free compute allowance does not cover a full month of an always-on bot; see the note in the Neon section before choosing it.

Free-tier limits as published by the providers (checked 2026-10-04; they can change):

| | MongoDB Atlas M0 | Neon Free |
|---|---|---|
| Storage | 512 MB | 1 GB per project |
| Compute | Shared RAM and vCPU, up to 100 operations per second | 100 CU-hours per project per month ("enough to run a 0.25 CU compute in a project for 400 hours/month") |
| Network | 10 GB in and 10 GB out per rolling 7 days | 5 GB per project |
| Idle rule | Paused after 30 days with zero connections | Compute suspends after 5 minutes idle |
| Card required | Not stated on the pricing page | No |

Sources: <https://www.mongodb.com/pricing>, <https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/>, <https://neon.com/pricing>, <https://neon.com/docs/introduction/plans>.

## Option A: MongoDB Atlas (free M0)

1. Sign up at <https://www.mongodb.com/cloud/atlas/register> and create a project.
2. **Create a cluster** → choose **Free** (M0). Pick the provider region closest to your Railway region (Railway service → Settings → Region).
3. **Database Access** → add a database user with a password. Use letters and digits only, or URL-encode any special characters (`@`, `:`, `/`, `%`) when you put it in the URL.
4. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`). This is required: Railway has no fixed outbound IP, so you can't allow-list a single address. The database user's password protects the cluster.
5. Cluster → **Connect** → **Drivers** → copy the connection string. It looks like:

   ```
   mongodb+srv://bridge:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```

   Replace `<password>` with the user's password. The bridge always uses a database called `Bridge`, so you don't need to add a database name.

If the bot is stopped for more than 30 days, Atlas pauses the cluster; resume it in the Atlas UI before starting the bot again.

## Option B: Neon (free Postgres)

> [!NOTE]
> The bot reads its settings from the database on relayed messages (cached for 10 seconds) and reloads the filters every 10 minutes, so Neon's compute can only suspend between those. Even with zero chat it stays up roughly half the time (about 90 of the 100 free CU-hours a month at 0.25 CU), and any chat activity pushes it past the allowance. The first message after a suspend waits for a cold start. Use Neon's free plan for testing or part-time use. For 24/7 use, pick Atlas or a paid Neon plan.

1. Sign up at <https://console.neon.tech> and create a project. Pick the region closest to your Railway region.
2. Project dashboard → **Connect** → copy the connection string. It looks like:

   ```
   postgresql://neondb_owner:<password>@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

3. Keep the `sslmode` parameter. Neon only accepts encrypted connections, and the bridge's Postgres driver (`pg`) turns on TLS only when the URL asks for it. Without `sslmode` the connection fails.
   - `sslmode=require` works. The current `pg` treats it as `verify-full` (encrypted, certificate and hostname checked) and logs a one-time `SECURITY WARNING` about this at startup.
   - To avoid that warning, change it to `sslmode=verify-full`. It behaves the same, and it's the mode Neon recommends.
   - `channel_binding=require` is ignored by `pg`. You can leave it in or remove it.

The bridge creates its tables on first use. You don't need to run any SQL.

## Set `DATABASE_URL` on Railway

1. Railway project → the bridge service → **Variables** → **New Variable**: name `DATABASE_URL`, value the connection string from above.
2. Click **Deploy** to apply the change.
3. The new database starts empty, so the bot DMs you a new **Sign in to Minecraft** code. Sign in again. To keep your settings, run `/setup export` **before** switching and `/setup import` afterwards. Links, the white/blacklist and the waitlist are not part of the export. See [storage.md](storage.md#switching-backends).
4. Check the logs for `MongoDB storage connected` or `Postgres storage connected`, and send a test message.

## Remove the Railway Volume

Once the bot runs on the new database, the Volume holds only the old SQLite file. Delete it to stop paying for it: open the Volume on the project canvas → **Settings** → delete it, then redeploy if Railway asks. The bridge doesn't need a Volume when `DATABASE_URL` is set, and its "no Volume" startup check only applies to SQLite. `RAILWAY_RUN_UID=0` was only needed for the Volume; leaving it set is harmless.

Back up first if you might want the old data (links, blacklist) later. Deleting a Volume can't be undone.

More detail: [storage.md](storage.md) · [railway.md](railway.md).
