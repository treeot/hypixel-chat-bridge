# Contributing

Bug reports, fixes, parser fixtures and docs are welcome.

## Setup

Requirements: Node ≥ 22.13 and npm. Docker is optional (for the Mongo/Postgres tests and the image).

```bash
git clone https://github.com/treeot/hypixel-chat-bridge && cd hypixel-chat-bridge
npm ci
cp .env.example .env   # fill in the three required values
npm run dev            # runs index.ts with tsx
```

`npm run dev` is for local development only. It signs in **offline** (no Microsoft login) as a dev user named `bridge1`, `bridge2`, … and connects to `MINECRAFT_HOST`, so point `MINECRAFT_HOST` at a local offline-mode server (for example a 1.8.9 server with `online-mode=false`). Hypixel rejects offline logins. The bot publishes slash commands to `DISCORD_SERVER_ID` in every mode and ignores other servers. To run against Hypixel with a real account, use `npm run build && npm start`.

## Checks (the same ones CI runs)

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build && npm run docs:check
```

The MongoDB and Postgres storage suites run when their URLs are set:

```bash
docker run --rm -d -p 27017:27017 --name bridge-mongo mongo:7
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=pw --name bridge-pg postgres:16
TEST_MONGO_URL=mongodb://localhost:27017 TEST_POSTGRES_URL=postgres://postgres:pw@localhost:5432/postgres npm test
```

Docker image: `docker build -t hcb:dev . && bash scripts/docker-smoke.sh hcb:dev`.

## Generated docs

`docs/configuration.md`, `docs/commands.md` and `.env.example` are generated. After adding an env var (`src/core/envCatalog.ts`) or a command, run `npm run docs:gen` and commit the result. Never edit them by hand; CI fails if they are stale.

## Architecture rules

- `src/minecraft/` and `src/discord/` never import each other; `src/relay/` and the composition root connect them through `src/core/contracts.ts`.
- Only `src/core/env.ts` reads `process.env`. Only `src/storage/` talks to a database driver.
- No hardcoded Discord IDs, guild names or rank names in `src/` (a test enforces this).
- Everything sent in-game goes through `src/safety`, which fails closed.
- Heavy modules (`skyhelper-networth`, `@napi-rs/canvas`) load with `import()` on first use.

## Parser fixtures

Hypixel chat formats live only in `src/minecraft/parser.ts`. If a line parses wrong, add it to `test/fixtures/hypixel-lines/` with the expected result and fix the parser. Remove real player names unless the line is public.

## Commits and PRs

- Commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `build:`, `ci:`, `chore:`.
- One topic per PR. Add a test for behavior changes, and fill in the PR template.
- Don't copy code from projects without a license (e.g. other Hypixel bridges); ideas are fine, code is not.
- By contributing you agree your work is released under the MIT license.
