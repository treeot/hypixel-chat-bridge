# FAQ

## Can this get my Minecraft account banned?
Possibly, as with any bot on Hypixel. Read the warning in the [README](../README.md). The bridge's [safety filter](safety-filter.md) lowers the risk but can't remove it.

## What do I need to set up?
A Discord bot and a Minecraft account for the bot. Three variables are required: `DISCORD_TOKEN`, `OWNER_ID` and `GUILD_CHANNEL_ID`. A Hypixel API key (`HYPIXEL_API_KEY`) is optional, but live stat commands, join requirements, GEXP, verify/link and Apply need it. See [configuration.md](configuration.md).

## How do I sign in to Minecraft?
On first start the bot DMs `OWNER_ID` a "Sign in to Minecraft" embed with a Microsoft device-code link. Open it, enter the code, and sign in. The bot stores the tokens in the database, so redeploys don't ask again as long as the database persists.

## Which Discord settings does the bot need?
In the Developer Portal → Bot, turn on **Message Content Intent** and **Server Members Intent**. Leave Presence off. The bot's role must sit above the verified role you want it to give.

## Where do I get a Hypixel API key?
At <https://developer.hypixel.net>.

## Which database should I use?

| Choice | When |
|---|---|
| SQLite (default) | Simplest. On Railway, attach a Volume at `/app/data` and set `RAILWAY_RUN_UID=0`. |
| MongoDB or Postgres | You already run one, or want a free hosted one instead of a Railway Volume. Set `DATABASE_URL`. On Atlas, allow `0.0.0.0/0`. |

Details: [storage.md](storage.md), [railway.md](railway.md) and [free-database.md](free-database.md).

## Why do I see an ExperimentalWarning about SQLite?
`node:sqlite` is experimental on Node 22. The bridge hides that one warning; see [storage.md](storage.md).

## Can one bridge serve several guilds?
Yes, one Minecraft account per guild, with optional cross-guild relay groups. See [multi-guild.md](multi-guild.md).

## Why was my message not sent to Minecraft?
Check the reaction the bot added; the legend is in [troubleshooting.md](troubleshooting.md). Blocked messages are never sent. Rules: [safety-filter.md](safety-filter.md).

## Can I use GuildLB?
Yes, as an option. With `GUILDLB_API_KEY` set, `!nw` can show GuildLB's stored networth when you have no Hypixel key. With `GUILDLB_GUILD_KEY` set, staff get `/alliance blacklist`, and join requests, Apply, `/invite` and waitlist invites check the alliance blacklist: listed players are held for staff, or denied when join auto-deny is on. See [guildlb.md](guildlb.md).

## Does image mode need extra setup?
No. Image mode uses `@napi-rs/canvas`, a regular dependency that ships prebuilt binaries, so `npm ci` and the Docker image already include it and no system libraries are needed. If it fails to load on your platform, the channel falls back to embed mode and the bot posts a one-time notice saying so.

## How much does Railway cost?
About \$3.80/month for one guild (an estimate); see [railway.md](railway.md).

## Is there a `/setup` command?
Yes. The owner (`OWNER_ID`) runs `/setup panel` to edit formats, ranks, in-game commands, join requirements, GEXP, verify, chat relay, chat filters, accounts and GuildLB settings. `/setup show`, `/setup export` and `/setup import` list, save and load them. See [commands.md](commands.md).

## How do I update?
- **Railway:** redeploy the service, or turn on auto-deploy so every push to your branch deploys. Your data survives if it is on a volume or external database ([storage.md](storage.md)).
- **Docker:** `docker pull` the new image, then restart the container.
- **Node:** `git pull`, `npm ci`, `npm run build`, then restart the bridge.
