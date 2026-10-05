# Security policy

## Supported versions

Only the latest release (and `main`) gets fixes.

## Reporting

**Do not open a public issue.** Use GitHub's private reporting: repository → Security → **Report a vulnerability**. You'll get a reply within 7 days.

Report these privately:

- ways to read or use secrets (Discord token, Hypixel/GuildLB keys, `DATABASE_URL`, `REST_API_TOKEN`, the Minecraft login cache), including through logs or error messages;
- REST API auth bypasses;
- ways to make the bot run commands or send text it shouldn't (permission bypasses, ban-safety filter bypasses that could get the account banned, relay-marker spoofing);
- supply-chain issues in the image or dependencies.

Include the version or commit, the deploy method, steps to reproduce, and the impact. We'll agree on a disclosure date with you and credit you in the release notes unless you'd rather not.

## Operator tips

- The database stores the bot's Minecraft login tokens so it can reconnect without signing in again. Anyone with access to the database (the SQLite file, `DATABASE_URL`, or your Railway project) can use that Minecraft account. Keep it private, and back it up only to places you trust.
- Treat every variable marked 🔒 in [docs/configuration.md](docs/configuration.md) as a password.
- Put the REST API behind HTTPS and use a random token (`openssl rand -hex 32`).
- Use a dedicated Minecraft account for the bot.
