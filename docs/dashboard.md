# Dashboard

## What it is

A web page for running the bridge without editing variables or typing slash commands. The Railway template includes it as a second service; it's optional. You log in with Discord. It talks to the bridge over its REST API. Pages: Overview, Chat, Guild, Lists, Settings (including Features), Audit.

**Staff** (members of `STAFF_ROLE_ID`) can use:

- Overview
- Chat (read and send)
- Guild member actions and invite (no raw `/command` box)
- Lists (add and remove)
- Features and Settings, read-only
- Audit

**Admins** (`OWNER_ID`, plus members of `ADMIN_ROLE_ID` if set) can do everything staff can, plus edit Features and Settings, use the raw `/command` box, and import or export settings. Admin-role members can also use `/setup` in Discord.

If neither `STAFF_ROLE_ID` nor `ADMIN_ROLE_ID` is set, only the owner can log in. Access is checked against the member's Discord roles on every page, so removing a role takes effect right away.

## Two ways to run it

- **One service (combined).** The bridge's own Dockerfile also builds the dashboard; set `DASHBOARD_ENABLED=true` and it runs in the same service, reached over loopback. No second service, no `BRIDGE_URL`/`BRIDGE_TOKEN`. This is the easiest way to add the dashboard to a bridge you already run — redeploy and flip one variable. See [Run it in one service](#run-it-in-one-service).
- **Two services (split).** A separate dashboard service talks to the bridge over the private network. Isolates the two (a dashboard restart never touches the bot) at the cost of a second service. See [Add the dashboard to an existing bridge](#add-the-dashboard-to-an-existing-bridge).

## Run it in one service

The bridge service builds the dashboard into its image either way; `DASHBOARD_ENABLED` decides whether it starts. To turn it on:

1. On the bridge service, set:
   - `DASHBOARD_ENABLED` = `true`
   - `REST_API_TOKEN` = `${{secret(48)}}` (the dashboard uses it to reach the bridge over loopback)
   - `AUTH_SECRET` = `${{secret(32)}}`, `AUTH_TRUST_HOST` = `true`
   - `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`: Client ID and Client Secret from your bot's application (Developer Portal → OAuth2)
2. In **Settings → Networking**, click **Generate domain** and set the port to `3100`.
3. Add the redirect URL: Discord Developer Portal → your application → OAuth2 → Redirects → add `https://<your domain>/api/auth/callback/discord` and save.
4. Open the domain and log in with the `OWNER_ID` account.

`DASHBOARD_API`, `BRIDGE_URL` and `BRIDGE_TOKEN` are set for you from the bridge's own variables; you only need them in the split setup. To turn the dashboard off again, set `DASHBOARD_ENABLED=false` (or remove it) and redeploy.

## Deploy on Railway

The template in the README deploys the bridge and the dashboard together. Before you click **Deploy**, fill in `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET` (Developer Portal → your bot's application → OAuth2 → Client ID and Client Secret). After it deploys:

1. Copy the `dashboard` service's domain from Railway.
2. Developer Portal → OAuth2 → Redirects → add `https://<your dashboard domain>/api/auth/callback/discord` and save.
3. Open the domain and log in with the Discord account set as `OWNER_ID`.

Already running the bridge from before the dashboard existed? See the next section.

## Add the dashboard to an existing bridge

1. Note your bridge service's exact name: the title on its card in Railway. Below it's called `NAME`.
2. On the bridge service, set `REST_API_TOKEN` = `${{secret(48)}}`, `REST_API_PORT` = `3000` and `DASHBOARD_API` = `true`. Without `DASHBOARD_API=true`, every dashboard request gets a 404.
3. In the same Railway project, click **New → GitHub repo** and pick the same repo.
4. In the new service's **Variables**, set:
   - `RAILWAY_DOCKERFILE_PATH` = `dashboard/Dockerfile`
   - `BRIDGE_URL` = `http://${{NAME.RAILWAY_PRIVATE_DOMAIN}}:3000`
   - `BRIDGE_TOKEN` = `${{NAME.REST_API_TOKEN}}`
   - `AUTH_SECRET` = `${{secret(32)}}`, `AUTH_TRUST_HOST` = `true`
   - `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`: Client ID and Client Secret from your bot's application (Developer Portal → OAuth2)
5. In **Settings → Networking**, click **Generate domain**. Do not give the bridge a public domain.
6. Add the redirect URL: Discord Developer Portal → your application → OAuth2 → Redirects → add `https://<your dashboard domain>/api/auth/callback/discord` and save. The dashboard asks for the `identify` scope only.

## Variables

| Variable | Service | Required | Value | What it does |
|---|---|---|---|---|
| `DASHBOARD_ENABLED` | bridge | combined only | `true` | Starts the dashboard inside the bridge service. Leave off for the split setup or a bot-only deploy. |
| `DASHBOARD_API` | bridge | required | `true` | Turns on the dashboard endpoints. Default is off. Set for you when `DASHBOARD_ENABLED=true`. |
| `REST_API_TOKEN` | bridge | required | random, 16+ characters | Password for the REST API. |
| `REST_API_PORT` | bridge | required | `3000` | Port the REST API listens on. |
| `BRIDGE_URL` | dashboard | required | `http://${{bridge.RAILWAY_PRIVATE_DOMAIN}}:3000` | Where the dashboard reaches the bridge (private network). |
| `BRIDGE_TOKEN` | dashboard | required | `${{bridge.REST_API_TOKEN}}` | Must equal the bridge's `REST_API_TOKEN`. |
| `AUTH_DISCORD_ID` | dashboard | required | Application ID | Client ID of your Discord application. |
| `AUTH_DISCORD_SECRET` | dashboard | required | Client Secret | Lets the dashboard confirm who logged in. |
| `AUTH_SECRET` | dashboard | required | random string | Signs the login cookie. The template generates it. |
| `AUTH_TRUST_HOST` | dashboard | required | `true` | Lets the login work behind Railway's proxy. |
| `RAILWAY_DOCKERFILE_PATH` | dashboard | required | `dashboard/Dockerfile` | Builds the dashboard image; keep the service's root directory at the repo root. |
| `PORT` | dashboard | optional | `3100` | Port the dashboard binds to; match the HTTP Proxy target. The image already defaults to this. |

`bridge` in the references is the bridge service's name in Railway; use yours if it differs.

Who can log in is decided on the **bridge** side: a user gets in only if the bot sees them as staff or admin, which needs `DISCORD_SERVER_ID` and `STAFF_ROLE_ID` (and optionally `ADMIN_ROLE_ID`) set on the bridge. Without them the bot grants no role and every login is rejected with `forbidden`. See [configuration](configuration.md).

## Sessions and permissions

- **Login lasts 48 hours.** After that the Discord sign-in is needed again; active use within the window keeps the session alive.
- **Permissions are re-checked every 5 minutes.** Your dashboard role comes from your **Discord** roles — admin if you have the `ADMIN_ROLE_ID` role (or are the owner), staff if you have `STAFF_ROLE_ID`. The dashboard caches that role in the login token and refreshes it from the bridge once it's older than 5 minutes, so **gaining or losing the staff/admin Discord role** takes effect within about 5 minutes without logging out. If the bridge can't be reached for a check, the last known role is kept and the next attempt backs off ~30 seconds.

## Remove the dashboard

1. Delete the `dashboard` service in Railway (its card → Settings → Delete service).
2. On the bridge service, set `DASHBOARD_API=false`.

The bridge keeps running with all its data.

## Turning features off

**Settings → Features** lists the bridge's features in groups. Only the owner can switch features. Slash commands you switch off disappear from Discord within about a minute. `/setup` and `/help` always stay on.

## Branding

The owner can change how the dashboard looks in **Settings → Branding** (or the Branding panel in `/setup`). No redeploy is needed. Every field is optional; leave one empty to keep the default.

- **Name**: replaces "Bridge Dashboard" in the browser tab and on the login page, and "Bridge" in the top bar. Up to 40 characters.
- **Tagline**: small text next to the name in the top bar, hidden on narrow screens. Up to 80 characters.
- **Logo URL**: an `https://` image, shown in the top bar and on the login page.
- **Accent colour**: a hex colour like `#8b5cf6`, used for highlights and focus rings.
- **Login text**: replaces the sentence under the title on the login page. Up to 300 characters.

If the bridge is offline, the dashboard shows its defaults.

## Troubleshooting

- **Discord says `Invalid OAuth2 redirect_uri`:** add `https://<your dashboard domain>/api/auth/callback/discord` under OAuth2 → Redirects in the Developer Portal.
- **"Your Discord account is not the owner and does not have the staff role.":** check `OWNER_ID` is your Discord user ID, or give your account the role set in `STAFF_ROLE_ID`.
- **"The bridge is offline, so your access can't be checked. Try again in a minute.":** the bridge is down or restarting.
- **Banner "Bridge offline: can't reach the bridge. Check BRIDGE_URL and that the bridge is running.":** the bridge service is down, or `BRIDGE_URL` is wrong. Right after setup, check that the service name inside `BRIDGE_URL` and `BRIDGE_TOKEN` matches your bridge service's name exactly.
- **Banner "Bridge API rejected the token: check BRIDGE_TOKEN matches the bridge's REST_API_TOKEN.":** make `BRIDGE_TOKEN` equal the bridge's `REST_API_TOKEN`.
- **Banner "Dashboard API is off: set DASHBOARD_API=true on the bridge.":** add that variable to the bridge and redeploy it.
- **Login loops back with `error=Configuration`:** `AUTH_SECRET`, `AUTH_DISCORD_ID` or `AUTH_DISCORD_SECRET` is missing or wrong.
- **Every page shows a server error:** `BRIDGE_URL` or `BRIDGE_TOKEN` is missing. The dashboard's startup logs name the missing variable.

## Cost

The dashboard adds about \$1–2/month: one guild with it costs about \$5–6/month (just over the Hobby plan's \$5 included usage). [Remove it](#remove-the-dashboard) to get back to about \$3.80.
