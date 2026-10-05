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

Send a message to guild or officer chat. Body: `chat` (`"guild"` or `"officer"`) and `message` (one line, not empty).

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
| 404 | `{"ok":false,"error":"Not found"}` | Unknown path or method. Checked after the token, so an unauthenticated request gets `401` instead. |
| 404 | `{"ok":false,"error":"Unknown account 7"}` | No account with that `accountId`. |
| 409 | `{"ok":false,"error":"screened","note":"…"}` | `invite` only: the alliance screen held the player; `note` says why. |
| 422 | `{"ok":false,"error":"blocked","reason":"…"}` | The safety filter blocked it; `reason` says why. |
| 503 | `{"ok":false,"error":"Account 1 is offline"}` | That account is disabled or not connected. |
| 500 | `{"ok":false,"error":"Internal server error"}` | Unexpected failure; check the bridge logs. |
