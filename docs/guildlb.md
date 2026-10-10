# GuildLB integration (optional)

[GuildLB](https://guildlb.com) is a guild leaderboard with an alliance-wide blacklist. The bridge talks to its public website API (`/api/openapi.json`). It stays **off unless you set a key**.

| Variable | Used for |
|---|---|
| `GUILDLB_API_KEY` | Website key: stored networth for `!nw` when there is no Hypixel key |
| `GUILDLB_GUILD_KEY` | Guild key (bound to one guild): alliance blacklist checks and edits. Must differ from `GUILDLB_API_KEY`. |
| `GUILDLB_API_URL` | Base URL override (default `https://guildlb.com`, https only) |

> **Without a Hypixel key:** the only GuildLB-backed in-game feature is `!nw`, which shows GuildLB's stored networth (labeled "GuildLB, as of <time>"). Live stats like SkyBlock level, skills or catacombs need your own Hypixel key.

## Alliance blacklist

These need `GUILDLB_GUILD_KEY`. Without it, `/alliance` is not published (it is hidden from the command list and `/help`) and no alliance checks run.

| Command | Who | What it does |
|---|---|---|
| `/alliance blacklist add <player> <category> [reason] [public]` | Staff | Adds the player to your guild's GuildLB blacklist, then to the local blacklist |
| `/alliance blacklist remove <player>` | Staff | Removes your guild's own GuildLB entry, then the local entry |
| `/alliance blacklist check <player>` | Staff | Shows every alliance guild's entry for the player, plus local status |
| `/alliance blacklist list` | Staff | Pages through your guild's own GuildLB blacklist (other guilds' entries can't be listed) |
| `/alliance blacklist sync` | Staff | Previews, then pushes local blacklist entries that are missing on GuildLB (as category OTHER, up to 500 per run) |

`/blacklist add` and `/blacklist remove` also take an `alliance` option that sends the change to your guild's GuildLB blacklist (as category OTHER). Leave it out and the GuildLB setting in `/setup` decides; it is off by default.

**Checks.** In-game join requests, the Apply button, staff `/invite` and automatic waitlist invites all check the alliance blacklist by Mojang UUID. Join requests are checked even while join requirements are off. The bridge never auto-accepts, invites or passes a listed player through Apply:

- The join-request auto-deny setting picks the outcome for join requests and Apply. With auto-deny off (the default), the player is **held for staff** review. With it on, they are **denied**. `/invite` and waitlist invites are blocked either way.
- The bot tells officers which guild listed the player and why, in officer chat for join requests and in the officer channel for `/invite` and the waitlist. Apply shows the applicant a generic "contact staff" reply, never the reasons.
- The **local whitelist overrides** the alliance list: a whitelisted player continues, and the bot still tells officers that the player is listed.
- **While GuildLB is down** (or rate-limited), the check is **skipped** and the flow goes on as if the player were not listed. One warning is logged per outage. If GuildLB is unreliable for you, turn off auto-accept.

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
