# REST API

An optional HTTP API that lets other tools send chat or commands through the bridge. It stays **off unless `REST_API_TOKEN` is set** (at least 16 characters) and listens on `REST_API_PORT` (default `3000`).

On Railway: service → Settings → Networking → **Generate Domain**, with target port = `REST_API_PORT`. Use HTTPS only, and treat the token like a password.

## Authentication

Every endpoint except `GET /health` needs:

```
Authorization: Bearer <REST_API_TOKEN>
```

The server compares the token in constant time (`timingSafeEqual` on SHA-256 digests). Send a single JSON object of at most 16 KB as the body. If you send a `Content-Type` header, it must be `application/json`; the server parses a request without one as JSON anyway.

## Choosing the account

Every endpoint takes `accountId`, a positive whole number. Leave it out to use **account 1**. On `POST` endpoints put it in the JSON body (or the query string, `?accountId=2`); on `GET /health` use the query string. The body value wins if both are set. See [multi-guild.md](multi-guild.md).

- A malformed `accountId` returns `400`.
- An account that does not exist returns `404`.
- An account that is disabled or not connected returns `503` (a disabled account counts as offline).

Everything the API sends in-game passes the ban-safety filter ([safety-filter.md](safety-filter.md)), and the bridge drops any text the filter blocks.

## Endpoints

### `GET /health`

No auth. Reports one account's state.

```bash
curl 'https://your-bridge.example/health?accountId=1'
```

```json
{ "ok": true, "accountId": 1, "label": "Main", "online": true, "username": "BotName" }
```

`online` is `false` for a disabled or disconnected account. `username` is `null` until the bot has logged in. An unknown or invalid `accountId` returns `404` or `400` with `{"ok":false,"error":"…"}`.

### `POST /chat`

Send a message to guild or officer chat. Body: `chat` (`"guild"` or `"officer"`) and `message` (one line, not empty), plus an optional `author` (one line, up to 32 characters) shown as the sender instead of `API`.

```bash
curl -X POST https://your-bridge.example/chat \
  -H "Authorization: Bearer $REST_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"chat":"guild","message":"Server restart in 5 minutes","accountId":1}'
```

### `POST /command`

Run a raw Minecraft command, e.g. `/g online`. Body: `command` (one line, not empty).

```bash
curl -X POST https://your-bridge.example/command \
  -H "Authorization: Bearer $REST_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"command":"/g online"}'
```

### `POST /moderation`

Body: `action`, `user` (a Minecraft username, 1-16 letters, digits or `_`) and sometimes `extra`.

| `action` | `extra` |
|---|---|
| `mute` | Optional duration: 1-4 digits followed by `s`, `m`, `h` or `d`, like `10m`, `1h`, `7d` (default `10m`). |
| `unmute` | Not accepted. |
| `kick` | Optional reason (one line, up to 100 characters). |
| `invite` | Not accepted. The player is screened first (see below). |
| `setrank` | **Required.** The rank name (letters, digits, `_` and spaces, up to 32). |

```bash
curl -X POST https://your-bridge.example/moderation \
  -H "Authorization: Bearer $REST_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"mute","user":"Notch","extra":"1h","accountId":2}'
```

`invite` runs the same alliance screen as `/invite`, join requests and Apply (the GuildLB alliance blacklist; it does nothing without `GUILDLB_GUILD_KEY`, see [guildlb.md](guildlb.md)). If the player is listed, the bot skips the invite and the API returns `409` with `{"ok":false,"error":"screened","note":"…"}`, where `note` says why.

## Responses

A successful request returns `200` with `{"ok":true,"accountId":1}`. For `POST /chat`, that means the bridge queued the message behind any earlier chat messages. `POST /command` and `POST /moderation` jump ahead of queued chat and go out next.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{"ok":true,"accountId":1}` | Sent. |
| 400 | `{"ok":false,"error":"…"}` | Invalid body, `Content-Type`, JSON, body over 16 KB, or `accountId`; the error says what was expected. |
| 401 | `{"ok":false,"error":"Unauthorized"}` | Missing or wrong token. |
| 404 | `{"ok":false,"error":"Not found"}` | Unknown path. Checked after the token, so an unauthenticated request gets `401` instead. |
| 405 | `{"ok":false,"error":"Method not allowed"}` | A dashboard path (below) called with the wrong method. Only with `DASHBOARD_API=true`. |
| 404 | `{"ok":false,"error":"Unknown account 7"}` | No account with that `accountId`. |
| 409 | `{"ok":false,"error":"screened","note":"…"}` | `invite` only: the alliance screen held the player; `note` says why. |
| 422 | `{"ok":false,"error":"blocked","reason":"…"}` | The safety filter blocked it; `reason` says why. |
| 503 | `{"ok":false,"error":"Account 1 is offline"}` | That account is disabled or not connected. |
| 500 | `{"ok":false,"error":"Internal server error"}` | Unexpected failure; check the bridge logs. |

## Dashboard endpoints

These endpoints exist so the separate dashboard service can manage the bridge. They are off by default: set `DASHBOARD_API=true` (with `REST_API_TOKEN`) to turn them on. While it is off, every path below returns `404`. They are not private to it: anyone holding `REST_API_TOKEN` can call them, so guard the token accordingly. All of them need the bearer token. Responses are JSON with `ok: true` on success and `{"ok":false,"error":"…"}` otherwise.

### Who did it: `X-Actor`

Every endpoint marked **write** below needs an `X-Actor` header holding the Discord user id (17-20 digits) of the person making the change. A write without a valid one returns `400`. The bridge records each write in the audit log under that id. The dashboard decides who may act (see `GET /dashboard/access`); the bridge only checks the token.

`POST /chat`, `/command` and `/moderation` also accept `X-Actor`. With a valid one, a successful call is written to the audit log (`chat.send`, `guild.command`, `guild.moderation`). Without it they work as before and nothing is recorded.

| Method | Path | Body | Response | Write |
|---|---|---|---|---|
| GET | `/dashboard/access?discordId=<id>` | | `{ role: "admin" \| "staff" \| "none" }`. Owner is admin; `STAFF_ROLE_ID` holders in the bot's server are staff (checked live, cached 60 s). | |
| GET | `/accounts` | | `{ accounts: [{ id, label, enabled, online, username, relayGroup }] }` | |
| GET | `/settings` | | `{ settings, overrides }`: every settings area plus per-account overrides. | |
| GET | `/settings/export` | | The settings bundle, the same file `/setup export` produces. | |
| POST | `/settings/import` | `{ bundle: string }` (up to 256 KB) | `{ written, notices }`; `400` with `issues` when the bundle is invalid. | yes |
| POST | `/settings/actions/:action/:accountId` | | `action` is `refreshRanks` or `postApply`. `{ message }`; `409` when the action cannot run (for example the account is offline). | yes |
| PUT | `/settings/:area` | `{ value }` (up to 256 KB) | `{ value, notices }`: the saved value plus what the bridge did after saving (reconnect accounts, refresh filters, republish slash commands). `400` with `issues` when invalid. | yes |
| GET | `/settings/:area/override/:accountId` | | `{ value }`. Only `joinRequests` and `gexp` can be set per account. | |
| PUT | `/settings/:area/override/:accountId` | `{ value }` (`{}` clears it) | `{ value }` | yes |
| GET | `/features/catalog` | | `{ chatCommands, slashCommands, missingEnv }`: every toggleable feature, what it requires, which slash commands are always on, which ones a `verify` or `allianceChecks` switch also turns off (`feature`), and the env var name for each missing key (`null` when set). | |
| GET | `/lists/whitelist`, `/lists/blacklist` | | `{ entries: [{ uuid, reason, discord, addedBy }] }` | |
| POST | `/lists/whitelist`, `/lists/blacklist` | `{ player, reason? }` (name or UUID) | `{ uuid, username }`; `404` for an unknown player. | yes |
| DELETE | `/lists/whitelist/:uuid`, `/lists/blacklist/:uuid` | | `{ removed }` | yes |
| GET | `/lists/alliance` | | `{ entries }`: the guild's GuildLB alliance blacklist. `409` without `GUILDLB_GUILD_KEY`, `502` when GuildLB fails. | |
| POST | `/lists/alliance` | `{ player, category, reason? }` | `{ status }`. Also adds the player to the local blacklist. | yes |
| DELETE | `/lists/alliance/:uuid` | | `{ status, removedLocally }` | yes |
| GET | `/lists/waitlist/:accountId` | | `{ entries }` | |
| DELETE | `/lists/waitlist/:accountId/:id` | | `{ removed }` | yes |
| GET | `/lists/links` | | `{ entries }`: Discord ↔ Minecraft links. | |
| DELETE | `/lists/links/:discordId` | | `{ removed }` | yes |
| GET | `/guild/:accountId/members` | | `{ guild: { name }, members: [{ uuid, username, rank, joined, weeklyGexp, belowRequirement }] }`. `404` unknown account, `503` offline, `409` without `HYPIXEL_API_KEY`, `502` when Hypixel fails. | |
| GET | `/events?accountId=<id>` | | A Server-Sent Events stream (see below). Leave out `accountId` for every account. | |
| GET | `/audit?limit=<1-100>&before=<id>` | | `{ entries }`, newest first (default 50). Pass the last entry's `id` as `before` for the next page. | |

### Live events

`GET /events` answers with `Content-Type: text/event-stream`. Each in-game chat line, guild event and connection status change becomes one frame:

```
id: 42
event: chat
data: {"accountId":1,"at":1760090000000,...}

```

`event` is `chat`, `event` or `status`. `data` is one line of JSON: `accountId`, `at` (milliseconds since the epoch) and the fields of the relayed message. On connect the stream first replays the bridge's recent scrollback (up to 200 items per account). To resume after a disconnect, send the last `id` you saw as the `Last-Event-ID` header and only newer items come back. Ids restart at 1 when the bridge restarts; a `Last-Event-ID` higher than the current id replays everything. A `: ping` comment line arrives every 25 seconds to keep proxies from closing the connection.
