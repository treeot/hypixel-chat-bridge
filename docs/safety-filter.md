# Ban-safety filter

The bot runs everything it says in Minecraft through one filter first: Discord to Minecraft chat, cross-guild relay lines, in-game command replies (which can echo player names or API data), slash commands such as `/execute`, and REST API sends. If the filter blocks a line, **nothing is sent** (fail closed). It exists to keep relayed text from getting the bot account muted or banned.

## Categories

All are on by default.

| Category | Action | Catches |
|---|---|---|
| `slurs` | block | Slurs, including separator, leetspeak and look-alike-letter variants. Never overridden by allowed words. |
| `profanity` | block | Swear words, with a whitelist for innocent words that contain them. |
| `links` | strip, or block if nothing is left | URLs, bare domains, `discord.gg/...`, and obfuscated forms like `play dot example dot net` or `[.]`. |
| `advertising` | block | Real-money trading (buy/sell coins with `$`, `usd`, PayPal, crypto and similar), `free rank`, `join my server`, `giveaway ... dm`. |
| `personalInfo` | block | Email addresses, phone numbers, IPv4 (including `1 dot 2 dot 3 dot 4`) and IPv6 addresses. |

The owner can also keep two word lists:

- **Blocked words:** always blocked (reason `custom`).
- **Allowed words:** override profanity and advertising hits, never slurs.

The bridge stores these settings in the database under `filters`. A missing or invalid value falls back to its default (everything on), and accounts reload the settings with `refreshSafety`. Edit them in `/setup panel` → **Chat filters** (category toggles, extra blocked words, allowed words); saving reloads every account.

## What is checked

- **Chat lines** (Discord relay and relay-group lines): the filter checks the whole `author: message` text, strips links, checks the result again, then splits it at spaces into at most 4 lines. It checks each line once more as it goes out.
- **Commands**: chat-family commands (`/gc`, `/oc`, `/msg`, ...) have their text filtered like chat. Commands that only take names, ranks or durations (`/g invite`, `/g setrank`, `/g mute`, ...) pass as-is when their arguments look like names. `/g kick` checks only the reason. The filter blocks any other command whose arguments it would block or change, and never rewrites it.

## Repeated characters

On Discord to Minecraft chat, runs of the same character are capped at 3 (`aaaaaaa` becomes `aaa`).

## Pacing

Each account sends at most one line every 1.1 seconds. The bot retries after "You are sending commands too fast". After Hypixel's "You cannot say the same message twice" it retries once with a trailing ` ·` added. It reports Hypixel's own rejections (`We blocked your comment`, advertising) back as failures.

## Mute guard

When an account sees its own "Your mute will expire in ..." notice, it records when the mute ends and posts one "Major Chat Infraction: Mute" event to that account's guild channel. Repeats of the same mute (the expiry drifts slightly, 60 s tolerance) don't post again. Until the mute ends, the bot holds back Discord messages and reacts with ⏸️, and drops chat-family commands (`/gc`, `/msg`, ...).

## What you see in Discord

A blocked relay message gets ⛔ plus a reason emoji.

| Reaction | Meaning |
|---|---|
| 🤬 | slurs, profanity or a blocked word |
| 🔗 | nothing left after removing links |
| 📢 | advertising |
| 🔒 | personal info |
| ⏸️ | the bot is muted in-game |
| ✂️ | sent, but cut to 4 lines |
| ❌ | empty message or bot offline |

The filter can't catch everything, and Hypixel's own rules still apply to the account. See the ban-risk warning in the [README](../README.md).
