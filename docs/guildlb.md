# GuildLB integration (optional)

[GuildLB](https://guildlb.com) is a guild leaderboard with an alliance-wide blacklist. The bridge talks to its public website API (`/api/openapi.json`). It stays **off unless you set a key**.

| Variable | Used for |
|---|---|
| `GUILDLB_API_KEY` | Website key: stored networth for `!nw` when there is no Hypixel key |
| `GUILDLB_GUILD_KEY` | Guild key (bound to one guild): alliance blacklist checks and edits, and the scammer check. Must differ from `GUILDLB_API_KEY`. |
| `GUILDLB_API_URL` | Base URL override (default `https://guildlb.com`, https only) |

> **Without a Hypixel key:** the only GuildLB-backed in-game feature is `!nw`, which shows GuildLB's stored networth (labeled "GuildLB, as of <time>"). Live stats like SkyBlock level, skills or catacombs need your own Hypixel key.

## What each key can see

| Key | Can see |
|---|---|
| `GUILDLB_API_KEY` | Stored networth only (`/api/player/{name}/networth`) |
| `GUILDLB_GUILD_KEY` | Your guild's **own** blacklist, public and private entries (`GET /api/guild/blacklist`) |
| `GUILDLB_GUILD_KEY` | A per-player alliance check: every alliance guild's **public** entries for one player (`/api/alliance/blacklist/check/{player}`) |
| `GUILDLB_GUILD_KEY` | A per-player scammer check: SkyBlockZ plus every alliance guild's public SCAMMING entries (`/api/alliance/scammer/{player}`) |

GuildLB has no endpoint that lists other guilds' entries, so the bridge can only look them up one player at a time. Entries are **public** by default: they show up in other guilds' alliance and scammer checks. A **private** entry stays on your guild's own list. (GuildLB currently ignores `public` when adding, so new entries are public.)

## Alliance blacklist

These need `GUILDLB_GUILD_KEY`. Without it, `/alliance` is not published (it is hidden from the command list and `/help`), `!scammer` replies that it is disabled, and no alliance checks run.

| Command | Who | What it does |
|---|---|---|
| `/alliance blacklist add <player> <category> [reason] [public]` | Staff | Adds the player to your guild's GuildLB blacklist, then to the local blacklist |
| `/alliance blacklist remove <player>` | Staff | Removes your guild's own GuildLB entry, then the local entry |
| `/alliance blacklist check <player>` | Staff | Shows every alliance guild's entry for the player, plus local status |
| `/alliance blacklist list` | Staff | Pages through your guild's own GuildLB blacklist (other guilds' entries can't be listed) |
| `/alliance blacklist sync` | Staff | Previews, then pushes local blacklist entries that are missing on GuildLB (as category OTHER, up to 500 per run) |
| `/alliance scammer <player>` | Staff | Checks SkyBlockZ and the alliance's public SCAMMING entries; lists every flag and the SkyBlockZ status |
| `!scammer <player>` | Anyone in guild or officer chat (toggle `scammer`) | The same check, answered in one in-game line |

Entries added by the bridge record the staff member's Discord user ID as `addedBy`, as GuildLB requires.

**Scammer check results.** When SkyBlockZ is unreachable, GuildLB still answers from alliance entries and the bridge says so ("SkyBlockZ unreachable — result covers alliance entries only"); it never calls that result clear. A lookup can take a few seconds because GuildLB refreshes SkyBlockZ live.

`/blacklist add` and `/blacklist remove` also take an `alliance` option that sends the change to your guild's GuildLB blacklist (as category OTHER). Leave it out and the GuildLB setting in `/setup` decides; it is off by default.

**Checks.** In-game join requests, the Apply button, staff `/invite` and automatic waitlist invites all check the alliance blacklist by Mojang UUID. Join requests are checked even while join requirements are off. The bridge never auto-accepts, invites or passes a listed player through Apply:

- The join-request auto-deny setting picks the outcome for join requests and Apply. With auto-deny off (the default), the player is **held for staff** review. With it on, they are **denied**. `/invite` and waitlist invites are blocked either way.
- The bot tells officers which guild listed the player and why, in officer chat for join requests and in the officer channel for `/invite` and the waitlist. Apply shows the applicant a generic "contact staff" reply, never the reasons.
- The **local whitelist overrides** the alliance list: a whitelisted player continues, and the bot still tells officers that the player is listed.
- **While GuildLB is down** (or rate-limited), the check is **skipped** and the flow goes on as if the player were not listed. One warning is logged per outage. If GuildLB is unreliable for you, turn off auto-accept.

**Scammer check on join.** Turn on "Check join requests against the GuildLB scammer list" in the GuildLB panel of `/setup` (off by default; needs `GUILDLB_GUILD_KEY`). The same flows then also check the scammer list when the player is not on the alliance blacklist. A flagged player gets the same treatment as a listed one: held for staff (or denied with auto-deny on), officers told which sources flagged them, the local whitelist overrides it, and a GuildLB failure lets the flow go on. A player with no flags continues even when SkyBlockZ is unreachable. Each screened player then costs two guild-key requests instead of one.

**Sync pacing.** `/alliance blacklist sync` sends at most 80 entries per minute, leaving about 20 of the 100 guild-key requests per minute for the checks above. A 500-entry sync takes about 7 minutes.

## Getting keys

- **Alliance guild owners** can create a rate-limited website key themselves on GuildLB.
- **Everyone else** applies at <https://guildlb.com/api>.
- **Guild keys** come from GuildLB admins, bound to one guild.

## Rules the client follows

- The bridge uses only GuildLB's own data and **stored** values. It never asks GuildLB to fetch live Hypixel data for it.
- Stored networth (`/api/player/{name}/networth`) returns what GuildLB already has. A player GuildLB does not track returns `404 PLAYER_NOT_TRACKED`. GuildLB queues untracked players; try again in a few minutes.
- The client sends keys only in the `Authorization` header, never in URLs, logs or error messages.
- The client sends at most 100 requests per minute per key. When the next rate-limit window is close, it waits instead of failing, and it honors `Retry-After`.
- The client caches stored networth lookups for 5 minutes and never caches blacklist reads or writes.
- The client normalizes and path-escapes names and UUIDs before any request.

## Failure behavior

A slow or down GuildLB must not block chat relay or join handling. Any GuildLB error falls back to the non-GuildLB path, and the bridge logs one warning per outage. Requests time out after 8 seconds.
