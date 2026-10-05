# Troubleshooting

Start with the logs (Railway: service → Deployments → View logs; Docker: `docker compose logs -f`). Set `LOG_LEVEL=debug` for more detail, and **remove tokens and IDs before sharing logs**.

## The bot does not start

| Log says | Fix |
|---|---|
| `Invalid environment:` followed by a list | Each line names a variable and the problem. Fix all of them in Variables / `.env`. IDs are 17-20 digit Discord IDs (Discord Settings → Advanced → Developer Mode, then right-click → Copy ID). See [configuration.md](configuration.md). |
| `… this Railway service has no Volume — everything would be wiped on the next redeploy.` | SQLite on Railway without a Volume. Attach a Volume at `/app/data`, or set `DATABASE_URL`. See [railway.md](railway.md). |
| `Cannot write to the data directory …` mentioning `RAILWAY_RUN_UID=0` | Railway mounts Volumes as root. Add `RAILWAY_RUN_UID=0` to the service variables and redeploy. In Docker, make the data volume writable by uid 1000. |
| `An invalid token was provided.` | `DISCORD_TOKEN` is wrong or was reset. Developer Portal → Bot → Reset Token, then paste the new one. |
| `Privileged intent provided is not enabled or whitelisted.` | Developer Portal → your app → Bot → turn on **Server Members Intent** and **Message Content Intent** (Presence stays off), then save. |
| `DATABASE_URL: must start with mongodb://, mongodb+srv://, postgres:// or postgresql://` | Use one of those URL types, or leave it unset for SQLite. |
| MongoDB `Server selection timed out` | Atlas → Network Access → allow `0.0.0.0/0` (Railway has no fixed outbound IP). See [storage.md](storage.md). |
| `ExperimentalWarning` about SQLite | Other warnings are still shown. The bridge hides this one on Node 22.13+; if you see it, update the bridge or Node. |

## Minecraft sign-in

- **No code arrived.** The bot DMs `OWNER_ID` an embed titled `Sign in to Minecraft`, so you need to share a server with the bot and allow DMs from server members. If the DM fails, the bot mentions you in that account's officer channel instead (if one is set).
- **Asked for a new code after every redeploy.** The bridge keeps the login cache in the database, so the database is not persisting. On Railway, check the Volume is attached (or `DATABASE_URL` is set). In Docker, check the data volume is mounted.
- **Wrong Minecraft account.** Sign in with the account that should chat in the guild; the sign-in link is a Microsoft device-code page.

## Messages are not relayed

- **Discord → Minecraft does nothing.** Check that **Message Content Intent** is on, and that the bot can view the channel and has Add Reactions.
- **Minecraft → Discord does nothing.** Check the channel ID in `GUILD_CHANNEL_ID`, and the log for the account being kicked or reconnecting.
- **A Discord message starting with `#` is never relayed.** The bridge skips lines that start with `#` on purpose, with no reaction, so you can write notes or commands for other bots. Remove the `#` to send it.
- **In-game `!` commands and their replies don't show in Discord.** When a guild member runs an enabled in-game command (with the prefix set in `/setup`, `!` by default), the bridge answers in game and does not relay the command line or the bot's reply to Discord. Unknown or disabled commands are relayed like normal chat.
- **Messages appear as embeds instead of webhooks.** The bot lacks **Manage Webhooks** in that channel. The bot posts `Webhook mode needs the Manage Webhooks permission in this channel; using embed mode until it is granted.` Grant the permission and the channel switches back.

## Reactions on your Discord message

No reaction means the message was sent.

| Reaction | Meaning |
|---|---|
| ⛔ | Not sent. Usually a second reaction says why. |
| 🤬 | Blocked by the safety filter: slur, profanity or an owner-blocked word ([safety-filter.md](safety-filter.md)). |
| 🔗 | Blocked: nothing was left once links were removed, or the link was disguised. |
| 📢 | Blocked: looks like advertising or real-money trading. |
| 🔒 | Blocked: personal info such as an email, phone number or IP address. |
| ⏸️ | The Minecraft account is muted in the guild. |
| ✂️ | Sent, but shortened to fit Minecraft's chat limits. |
| ❌ | Empty message, or (after ⛔) the Minecraft account is offline. |

## Commands

- **Slash commands missing.** Global commands can take up to an hour to appear the first time. Set `DISCORD_SERVER_ID` to publish to your server immediately.
- **Verify cannot give the role.** The bot's role must be **above** the verified role in Server Settings → Roles, and the bot needs Manage Roles.
- **Stats commands fail.** Check `HYPIXEL_API_KEY` (from <https://developer.hypixel.net>); GuildLB keys are separate, see [guildlb.md](guildlb.md).

Still stuck? Open an issue and include your deploy method, storage backend and a log excerpt with secrets removed.
