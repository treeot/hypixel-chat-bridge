# Railway

The one-click template deploys **one service** (this repo, built from its `Dockerfile`) with **a Volume at `/app/data`**. Data lives in SQLite on that Volume unless you set `DATABASE_URL`. Estimated cost for one guild is about \$3.80/month, inside the Hobby plan's \$5 of included usage (see the cost table in the README).

## Deploy

1. Click **Deploy on Railway** in the README.
2. Fill in `DISCORD_TOKEN`, `OWNER_ID` and `GUILD_CHANNEL_ID` (see the README quickstart for where to find them). `HYPIXEL_API_KEY` is optional: without it, live stat commands, join requirements, GEXP, verify/link and Apply are disabled (get a key at <https://developer.hypixel.net>). Leave everything else as it is.
3. Click **Deploy**. The bot DMs `OWNER_ID` an embed titled `Sign in to Minecraft` (falling back to a mention in the officer channel if the DM fails). Open the link in it, enter the code, and sign in with the bot's Minecraft account.

## Template settings

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

Do not add replicas: Railway does not allow replicas on a service with a Volume, and the bridge must run one Minecraft session per account anyway.

## Bridge + Dashboard template

The optional dashboard runs as a second service. The bridge stays private; only the dashboard has a public domain.

| Service | Variable | Value |
|---|---|---|
| Bridge | `REST_API_TOKEN` | random, 48 characters |
| Bridge | `REST_API_PORT` | `3000` |
| Bridge | `DASHBOARD_API` | `true` |
| Dashboard | `RAILWAY_DOCKERFILE_PATH` | `dashboard/Dockerfile` |
| Dashboard | `BRIDGE_URL` | `http://<bridge service>.railway.internal:3000` |
| Dashboard | `BRIDGE_TOKEN` | the bridge's `REST_API_TOKEN` |
| Dashboard | `AUTH_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_TRUST_HOST` | see [dashboard.md](dashboard.md) |

Give the bridge no public domain. Setup steps and troubleshooting: [dashboard.md](dashboard.md). It adds about \$1–2/month: one guild with the dashboard costs about \$5–6/month (just over the Hobby plan's \$5 included usage).

## Safety guard

If the bridge runs on Railway (any of `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_PROJECT_ID` set) with SQLite and no Volume (`RAILWAY_VOLUME_MOUNT_PATH` unset), it refuses to start. The message says the data would be wiped on the next redeploy. Fix it by attaching a Volume at `/app/data` or by setting `DATABASE_URL`.

If it says `Cannot write to the data directory … RAILWAY_RUN_UID=0`, add that variable to the service and redeploy.

## Using Railway Postgres instead

Add **Postgres** to the project, then set the bridge's `DATABASE_URL` to `${{Postgres.DATABASE_URL}}` (a reference variable). This adds about \$1/month. You can then remove the Volume.

## Using a free external database

To save the Volume cost (about \$0.15/month) or the Railway Postgres cost (about \$1/month), use a free MongoDB Atlas or Neon database and delete the Volume. Step by step: [free-database.md](free-database.md).
