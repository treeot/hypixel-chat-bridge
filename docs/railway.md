# Railway

The one-click template deploys **two services** from this repo:

- **`bridge`**: the bot, built from the root `Dockerfile`, with **a Volume at `/app/data`**. Data lives in SQLite on that Volume unless you set `DATABASE_URL`. It has no public domain.
- **`dashboard`**: the web dashboard, built from `dashboard/Dockerfile`, with a public domain. It's optional: [remove it](#remove-the-dashboard) if you don't want it.

Estimated cost for one guild is about \$5–6/month with the dashboard (just over the Hobby plan's \$5 of included usage), or about \$3.80 without it (see the cost table in the README).

## Deploy

1. Click **Deploy on Railway** in the README.
2. Fill in `DISCORD_TOKEN`, `OWNER_ID` and `GUILD_CHANNEL_ID` (see the README quickstart for where to find them). `HYPIXEL_API_KEY` is optional: without it, live stat commands, join requirements, GEXP, verify/link and Apply are disabled (get a key at <https://developer.hypixel.net>). Leave everything else as it is.
3. For the dashboard, fill in `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`: the Client ID and Client Secret from the same Discord application as your bot (Developer Portal → OAuth2). Skip the dashboard? [Remove it](#remove-the-dashboard) after deploying.
4. Click **Deploy**. The bot DMs `OWNER_ID` an embed titled `Sign in to Minecraft` (falling back to a mention in the officer channel if the DM fails). Open the link in it, enter the code, and sign in with the bot's Minecraft account.
5. Dashboard only: in the Developer Portal → OAuth2 → Redirects, add `https://<your dashboard domain>/api/auth/callback/discord` (the domain is on the `dashboard` service in Railway). Then open that domain and log in with Discord.

## Template settings

### `bridge` service

Railway auto-detects the `Dockerfile` in the repo root and builds it, and its default restart policy is **On Failure**. The template sets the rest:

| Setting | Value | Required | Description |
|---|---|---|---|
| Builder | Dockerfile (auto-detected from the repo root) | - | - |
| Restart policy | `ON_FAILURE` (Railway default) | - | - |
| Volume | mount path `/app/data` | - | SQLite file `/app/data/bridge.db`, plus the Minecraft login cache when using SQLite |
| `DISCORD_TOKEN` | *(you fill in)* | required | Discord bot token (Developer Portal → your application → Bot → Reset Token). |
| `HYPIXEL_API_KEY` | empty | optional | Hypixel API key, sent only as the `API-Key` header. Without it, live stat commands, join requirements, GEXP, verify/link and Apply reply with a one-line notice naming this variable. |
| `OWNER_ID` | *(you fill in)* | required | Your Discord user ID. Runs `/setup`, receives Microsoft sign-in codes and outage alerts by DM. |
| `GUILD_CHANNEL_ID` | *(you fill in)* | required | Discord channel bridged to guild chat for account 1. |
| `OFFICER_CHANNEL_ID` | empty | optional | Discord channel bridged to officer chat for account 1. Officer relay is off when unset. |
| `STAFF_ROLE_ID` | empty | optional | Role allowed to run staff commands. When unset, staff commands are owner-only. |
| `DATABASE_URL` | empty | optional | `mongodb://`, `mongodb+srv://`, `postgres://` or `postgresql://` URL. Unset: SQLite at `./data/bridge.db`, or on the Railway Volume. See docs/storage.md. |
| `GUILDLB_API_KEY` | empty | optional | GuildLB website-api key: stored networth for `!nw` when there is no Hypixel key. |
| `GUILDLB_GUILD_KEY` | empty | optional | GuildLB guild-api key bound to your guild: alliance blacklist checks and `/alliance`. Must differ from `GUILDLB_API_KEY`. |
| `NODE_OPTIONS` | `--max-old-space-size=256` | preset | Caps the heap so memory use stays low on the Hobby plan |
| `RAILWAY_RUN_UID` | `0` | preset | Railway mounts Volumes as root; the image runs as uid 1000 and could not write otherwise ([Railway docs](https://docs.railway.com/volumes#permissions)) |
| `REST_API_TOKEN` | `${{secret(48)}}` | preset | Password for the REST API; the dashboard uses it. |
| `REST_API_PORT` | `3000` | preset | Port the REST API listens on (private network only). |
| `DASHBOARD_API` | `true` | preset | Turns on the dashboard endpoints. Set `false` if you remove the dashboard. |

Do not add replicas: Railway does not allow replicas on a service with a Volume, and the bridge must run one Minecraft session per account anyway.

### `dashboard` service

| Setting | Value | Required | Description |
|---|---|---|---|
| `RAILWAY_DOCKERFILE_PATH` | `dashboard/Dockerfile` | preset | Builds the dashboard instead of the bridge. |
| `BRIDGE_URL` | `http://${{bridge.RAILWAY_PRIVATE_DOMAIN}}:3000` | preset | Where the dashboard reaches the bridge (private network). |
| `BRIDGE_TOKEN` | `${{bridge.REST_API_TOKEN}}` | preset | Must equal the bridge's `REST_API_TOKEN`. |
| `AUTH_SECRET` | `${{secret(32)}}` | preset | Signs the login cookie. |
| `AUTH_TRUST_HOST` | `true` | preset | Lets the login work behind Railway's proxy. |
| `AUTH_DISCORD_ID` | *(you fill in)* | required for the dashboard | Client ID of your bot's Discord application. |
| `AUTH_DISCORD_SECRET` | *(you fill in)* | required for the dashboard | Client Secret of the same application. |

`${{bridge.…}}` refers to the bridge service by its name. If you rename the bridge service, update both references. Setup details and troubleshooting: [dashboard.md](dashboard.md).

## Remove the dashboard

1. Delete the `dashboard` service (its card → Settings → Delete service).
2. On the `bridge` service, set `DASHBOARD_API=false`.

The bridge keeps running with all its data. This brings one guild back to about \$3.80/month.

## Safety guard

If the bridge runs on Railway (any of `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_PROJECT_ID` set) with SQLite and no Volume (`RAILWAY_VOLUME_MOUNT_PATH` unset), it refuses to start. The message says the data would be wiped on the next redeploy. Fix it by attaching a Volume at `/app/data` or by setting `DATABASE_URL`.

If it says `Cannot write to the data directory … RAILWAY_RUN_UID=0`, add that variable to the service and redeploy.

## Using Railway Postgres instead

Add **Postgres** to the project, then set the bridge's `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (a reference variable). This adds about \$1/month. You can then remove the Volume.

## Using a free external database

To save the Volume cost (about \$0.15/month) or the Railway Postgres cost (about \$1/month), use a free MongoDB Atlas or Neon database and delete the Volume. Step by step: [free-database.md](free-database.md).
