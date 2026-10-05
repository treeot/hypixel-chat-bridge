# hypixel-chat-bridge

Two-way chat bridge between Hypixel guild chat and Discord. One process can serve several guilds, everything the bot says is checked by a ban-safety filter, and it deploys to Railway from a template in a few minutes.

[![CI](https://github.com/treeot/hypixel-chat-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/treeot/hypixel-chat-bridge/actions/workflows/ci.yml)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/hypixel-chat-bridge?referralCode=AZj5w0&utm_medium=integration&utm_source=docs&utm_campaign=hypixel-chat-bridge)

<!-- prettier-ignore -->
> [!WARNING]
> This bridge connects to Hypixel through Mineflayer, which is not an official Minecraft client, so your Minecraft account could be banned. Use it at your own risk; the authors are not responsible for any bans.

## Features

- **Guild and officer chat, both ways**, with Discord mentions, emoji, replies and attachments turned into readable text.
- **Four formats per channel:** webhook (default), embed, plain, or image (Minecraft font); falls back to embed if one can't be used.
- **Several guilds, one bridge:** one account per guild, optional relay groups for cross-guild chat. See [multi-guild](docs/multi-guild.md).
- **Ban-safety filter** (slurs, profanity, links, ads, personal info, pacing, mute guard). See [safety filter](docs/safety-filter.md).
- **Guild events:** join, leave, kick, promote, demote, mute, unmute, level-up, quest.
- **In-game `!` commands**, each toggleable, plus **slash commands** for moderation, verify and GEXP. See [commands](docs/commands.md).
- **Join requests:** requirements, auto-accept/deny, blacklist/whitelist, Apply button, waitlist when full.
- **GEXP:** weekly leaderboard (`/gexp`, `/guildtop`) and an optional weekly requirement (`/inactive`).
- **Verification:** `/verify` checks the Discord name on the Hypixel profile; optional role and nickname.
- **Setup in Discord** with `/setup`; only three environment variables are required.
- **Storage:** SQLite (default), MongoDB or Postgres. See [storage](docs/storage.md), or [use a free database](docs/free-database.md) to drop the Railway Volume.
- Optional [REST API](docs/rest-api.md) for sending chat or commands from other tools.
- Optional [GuildLB](docs/guildlb.md): stored networth for `!nw` and the alliance blacklist (`/alliance blacklist ...`).

## Before you start: create the Discord bot

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → **Bot** → **Reset Token**. Copy the token: this is `DISCORD_TOKEN`.
2. On the same page, under **Privileged Gateway Intents**, turn on **Server Members Intent** and **Message Content Intent**. The bot uses the gateway intents `Guilds`, `GuildMessages`, `MessageContent` and `GuildMembers`.
3. Invite the bot. Replace `YOUR_CLIENT_ID` with the Application ID from **General Information**:

   `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=939641920`

   | Permission           | Why                                                                       |
   | -------------------- | ------------------------------------------------------------------------- |
   | View Channels        | See the bridged channels.                                                 |
   | Send Messages        | Relay chat and reply to commands.                                         |
   | Embed Links          | Embed format, event embeds and command replies.                           |
   | Attach Files         | Image format.                                                             |
   | Read Message History | React to messages and resolve the message a reply points to.              |
   | Add Reactions        | Delivery-failure reactions such as ⛔, ✂️ and ⏸️.                         |
   | Manage Webhooks      | Webhook format (the default). Without it the channel falls back to embed. |
   | Manage Roles         | Optional verified role.                                                   |
   | Manage Nicknames     | Optional nickname template on verify.                                     |

4. In Discord, turn on Settings → Advanced → **Developer Mode**. Right-click your name → **Copy User ID** (`OWNER_ID`). Right-click the channel for guild chat → **Copy Channel ID** (`GUILD_CHANNEL_ID`).

You also need a **Minecraft Java account** for the bot that is a member of your guild.

### Settings

| Variable            | Required | What it does                                                                                                   |
| ------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`     | yes      | Discord bot token.                                                                                             |
| `OWNER_ID`          | yes      | Your Discord user ID. Runs `/setup` and gets the Microsoft sign-in code by DM.                                 |
| `GUILD_CHANNEL_ID`  | yes      | Discord channel bridged to guild chat.                                                                         |
| `HYPIXEL_API_KEY`   | no       | Live stat commands, join requirements, GEXP, verify/link and Apply. Without it they reply with a short notice. |
| `DATABASE_URL`      | no       | MongoDB or Postgres URL. Unset: SQLite.                                                                        |
| `GUILDLB_API_KEY`   | no       | GuildLB website key: stored networth for `!nw`.                                                                |
| `GUILDLB_GUILD_KEY` | no       | GuildLB guild key: alliance blacklist.                                                                         |

[docs/configuration.md](docs/configuration.md) lists every variable (officer channel, staff role, extra accounts, REST API, …).

## Quickstart

### Railway

1. Click **Deploy on Railway** above.
2. Fill in `DISCORD_TOKEN`, `OWNER_ID` and `GUILD_CHANNEL_ID` (and `HYPIXEL_API_KEY` if you have one), then click **Deploy**.
3. The bot DMs you an embed headed **Sign in to Minecraft** with a Microsoft device code. Open the link, enter the code, and sign in with the bot's Minecraft account. Chat starts relaying.
4. Optional: run `/setup` in Discord to set formats, ranks, commands, join requirements and more.

The template keeps data in SQLite on a Railway Volume at `/app/data`. To use your own database, set `DATABASE_URL` (a free one works: [docs/free-database.md](docs/free-database.md)). Details: [docs/railway.md](docs/railway.md).

### Docker Compose

```bash
git clone https://github.com/treeot/hypixel-chat-bridge && cd hypixel-chat-bridge
cp .env.example .env   # fill in DISCORD_TOKEN, OWNER_ID, GUILD_CHANNEL_ID
docker compose up -d && docker compose logs -f bridge
```

Data goes to SQLite in the `bridge-data` volume. For Postgres, first set `DATABASE_URL=postgres://bridge:bridge@postgres:5432/bridge` in `.env`, then run `docker compose --profile postgres up -d`. For MongoDB, set `DATABASE_URL=mongodb://mongo:27017` and use `--profile mongo`.

### Node

Requires Node ≥ 22.13.

```bash
git clone https://github.com/treeot/hypixel-chat-bridge && cd hypixel-chat-bridge
npm ci
cp .env.example .env   # fill in the three required values
npm run build && npm start
```

To keep memory low, set `NODE_OPTIONS=--max-old-space-size=256` in the shell or service that starts Node. It has no effect inside `.env`.

## Cost on Railway

Railway's Hobby plan is \$5/month and includes \$5 of usage. Rates: RAM \$10/GB-month, CPU \$20/vCPU-month, Volume \$0.15/GB-month, egress \$0.05/GB.

| Setup                                             | Estimate / month |
| ------------------------------------------------- | ---------------- |
| One guild, SQLite on a Volume (default template)  | ≈ \$3.80         |
| One guild, Railway Postgres instead of SQLite     | ≈ \$4.65         |
| One guild, free MongoDB Atlas database, no Volume | ≈ \$3.65         |
| Each extra guild account                          | ≈ +\$1.00        |

These are estimates. They assume the bot uses about 300 MB RAM and 0.03 vCPU (≈ \$3.60), plus about \$0.15 for the Volume and \$0.05 for egress, at the Hobby rates above. The Postgres row drops the Volume (\$0.15) and adds about \$1 for Railway Postgres. If you run the bot, share your Railway usage in an issue so we can replace these with real numbers.

To trim the bill, use a free hosted database instead of the Volume or Railway Postgres: [docs/free-database.md](docs/free-database.md). It saves about \$0.15/month against the default template and about \$1/month against Railway Postgres. MongoDB Atlas's free tier suits a bot that runs 24/7; Neon's free compute isn't enough for a bot that runs 24/7 in an active guild (details in the guide).

## Docs

[Configuration](docs/configuration.md) · [Commands](docs/commands.md) · [Multiple guilds](docs/multi-guild.md) · [Storage](docs/storage.md) · [Free database](docs/free-database.md) · [Railway](docs/railway.md) · [Safety filter](docs/safety-filter.md) · [REST API](docs/rest-api.md) · [GuildLB](docs/guildlb.md) · [FAQ](docs/faq.md) · [Troubleshooting](docs/troubleshooting.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## License

MIT, see [LICENSE](LICENSE). Bundled font: [Monocraft](https://github.com/IdreesInc/Monocraft) by IdreesInc, SIL Open Font License 1.1 (`assets/fonts/Monocraft-LICENSE.txt`).

Not affiliated with Hypixel, Mojang or Microsoft.
