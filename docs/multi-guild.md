# Multiple guilds

One bridge can serve several Hypixel guilds. Each guild needs **its own Minecraft account** that is a member of that guild. Each account has its own Discord channels, send queue and reconnect loop, so a crash or mute on one account doesn't affect the others.

## Add an account

You can add an account in Discord with `/setup` → **Accounts** (owner only), or with environment variables as below.

Account 1 uses `GUILD_CHANNEL_ID`, `OFFICER_CHANNEL_ID`, `RELAY_GROUP` and `ACCOUNT_LABEL`. Each extra account uses a number n of 2 or more:

```env
ACCOUNT_2_GUILD_CHANNEL_ID=223456789012345678
ACCOUNT_2_OFFICER_CHANNEL_ID=323456789012345678
ACCOUNT_2_RELAY_GROUP=alliance
ACCOUNT_2_LABEL=Beta
```

| Variable | Meaning |
|---|---|
| `ACCOUNT_2_GUILD_CHANNEL_ID` | Required. Setting it creates the account. |
| `ACCOUNT_2_OFFICER_CHANNEL_ID` | Optional officer chat channel. |
| `ACCOUNT_2_RELAY_GROUP` | Optional. Accounts with the same group share chat. |
| `ACCOUNT_2_LABEL` | Optional short name (default `G2`). |

On first start each new account DMs the owner (`OWNER_ID`) a Microsoft sign-in code. Sign in with **that guild's** Minecraft account. The bot caches the login in the database, so redeploys don't ask again.

## Relay groups (cross-guild chat)

Accounts with the same relay group share chat. When someone talks in guild A's chat:

1. The line is posted to guild A's Discord channel.
2. Every other account in the group says it in its own guild chat as `»[A] Name: message`.
3. The line is also posted to each peer's Discord channel, tagged with the source label.

Officer chat relays to the peers' officer chat the same way. Group names are case-insensitive. Lines typed in a bridged Discord channel relay the same way, once.

To prevent relay loops, the bridge drops a line when **one of your own bot accounts** says it, or when it starts with the marker `»` and comes from one of them. A real player who types `»` counts as a normal player. A 10-second duplicate filter also catches echo races.

The bridge strips brackets, colons, `§` and control characters from labels and cuts them to 16 characters, so a label can't fake another sender.

### Example: two allied guilds plus one separate guild

```env
GUILD_CHANNEL_ID=111111111111111111
RELAY_GROUP=alliance
ACCOUNT_LABEL=Alpha

ACCOUNT_2_GUILD_CHANNEL_ID=222222222222222222
ACCOUNT_2_RELAY_GROUP=alliance
ACCOUNT_2_LABEL=Beta

ACCOUNT_3_GUILD_CHANNEL_ID=333333333333333333
ACCOUNT_3_LABEL=Gamma
```

Alpha and Beta see each other's chat. Gamma is bridged to its own channel only. A group with a single account relays nothing (the bridge logs a warning).

Two accounts may share one Discord channel. Each line still appears there once.

## Commands with several accounts

With two or more accounts, slash commands that act through a Minecraft account (`/kick`, `/mute`, `/unmute`, `/promote`, `/demote`, `/setrank`, `/invite`, `/execute`, `/online`, `/inactive`, `/reqs`, `/gexp`, `/guildtop`, `/members`) get an optional `account` choice. Without it they use the account that owns the channel you run them in, otherwise account 1. In-game `!` commands reply through the account that saw them. See [commands.md](commands.md).

## Safety

Every line an account says passes the ban-safety filter first ([safety-filter.md](safety-filter.md)). The whole bridge shares one set of filter settings: change them once in `/setup` and every account refreshes its copy. Each account tracks its own mute state, send queue and pacing.
