# Storage backends

The bridge stores its data (settings, links, white/blacklist, waitlist, Minecraft login cache) in one of three databases, chosen by `DATABASE_URL`:

| `DATABASE_URL` | Backend | Notes |
|---|---|---|
| unset | SQLite (built-in `node:sqlite`) | File at `./data/bridge.db`, or `$RAILWAY_VOLUME_MOUNT_PATH/bridge.db` on Railway. The bridge creates the directory if needed. |
| `mongodb://…` / `mongodb+srv://…` | MongoDB | Database `Bridge`, one collection per name, `_id` = document id. Atlas: allow `0.0.0.0/0` in Network Access (Railway has no fixed egress IP). |
| `postgres://…` / `postgresql://…` | Postgres | One table per name: `(id text primary key, doc jsonb not null)`, created on first use. |

> [!IMPORTANT]
> The database holds the bot's Minecraft login tokens. Treat the SQLite file and `DATABASE_URL` like a password: anyone who can read them can use that Minecraft account.

Requires Node ≥ 22.13. On Node 22, `node:sqlite` is experimental and prints an `ExperimentalWarning`. The bridge suppresses that one warning; every other warning is still shown.

## Railway

The default template mounts a Volume at `/app/data` and leaves `DATABASE_URL` empty, so data lives in SQLite on the Volume. If the bridge runs on Railway (any Railway environment marker is set) with SQLite and **no** Volume, it refuses to start. Railway wipes the container filesystem on every redeploy, so you would lose links, settings and the Minecraft login. Fix it by attaching a Volume at `/app/data`, or by setting `DATABASE_URL` to a MongoDB or Postgres URL.

The template also sets `RAILWAY_RUN_UID=0`, because Railway mounts Volumes as root while the image runs as uid 1000. [railway.md](railway.md) lists the template's settings and explains how to switch to Railway Postgres.

To stop paying for the Volume, point `DATABASE_URL` at a free hosted database instead: [free-database.md](free-database.md) walks through Neon (Postgres) and MongoDB Atlas.

## Collections

| Collection | Document |
|---|---|
| `info` | One settings document per area: `{ id: <area>, ...settings }`. Areas: `accounts`, `chat`, `formats`, `ranks`, `commands`, `joinRequests`, `gexp`, `filters`, `verify`, `guildlb`. Per-guild overrides live in `joinRequests:<n>` and `gexp:<n>` (n = account number) and hold only the fields that guild changed. |
| `whitelist`, `blacklist` | `{ id: <minecraft uuid>, reason, discord, addedBy }` |
| `waitlist`, `waitlist_<n>` | `{ id: <discord user id>, uuid, ign, createdAt }`. Account 1 uses `waitlist`, account n uses `waitlist_<n>`. |
| `link` | `{ id: <discord user id>, uuid, ign }` |
| `auth_cache` | `{ id: <key>, value, updatedAt }` |

## Switching backends

The bridge has no tool to move data between backends (for example SQLite → Postgres). A new backend starts empty, so the bot asks for the Microsoft sign-in again. Carry your settings over with `/setup export` on the old deploy and `/setup import` on the new one; links, the white/blacklist and the waitlist are not part of the export.

## Running the storage tests

`npm test` always runs the SQLite contract suite. The Mongo and Postgres suites run only when these are set:

```bash
docker run --rm -d -p 27017:27017 --name bridge-mongo mongo:7
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=pw --name bridge-pg postgres:16
TEST_MONGO_URL=mongodb://localhost:27017 TEST_POSTGRES_URL=postgres://postgres:pw@localhost:5432/postgres npm test
```
