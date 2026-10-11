# Dashboard

## What it is

A web page for running the bridge without editing variables or typing slash commands. You log in with Discord. It talks to the bridge over its REST API. Pages: Overview, Chat, Guild, Lists, Features, Settings, Audit.

**Staff** (members of `STAFF_ROLE_ID`) can use:

- Overview
- Chat (read and send)
- Guild member actions and invite (no raw `/command` box)
- Lists (add and remove)
- Features and Settings, read-only
- Audit

**Owner** (`OWNER_ID`) can do everything staff can, plus edit Features and Settings, use the raw `/command` box, and import or export settings.

If `STAFF_ROLE_ID` is unset, only the owner can log in.

## Deploy on Railway

Add the dashboard as a second service next to your bridge. A one-click "Bridge + Dashboard" template link will be added here once the template is published. Until then, follow the steps below.

## Add the dashboard to an existing bridge

1. On the **bridge** service, set `REST_API_TOKEN` (any random string of 48 characters, or `${{secret(48)}}` in Railway), `REST_API_PORT=3000` and `DASHBOARD_API=true`. Without `DASHBOARD_API=true`, every dashboard request gets a 404.
2. In the same Railway project, click **New → GitHub repo** and pick the same repo.
3. In the new service's **Variables**, set the dashboard variables from the table below, plus `RAILWAY_DOCKERFILE_PATH=dashboard/Dockerfile`.
4. In **Settings → Networking**, click **Generate domain**. Do not give the bridge a public domain.
5. Add the redirect URL: Discord Developer Portal → your application → OAuth2 → Redirects → add `https://<your dashboard domain>/api/auth/callback/discord` and save. The dashboard asks for the `identify` scope only.

## Variables

| Variable | Service | Required | Value | What it does |
|---|---|---|---|---|
| `DASHBOARD_API` | bridge | required | `true` | Turns on the dashboard endpoints. Default is off. |
| `REST_API_TOKEN` | bridge | required | random, 16+ characters | Password for the REST API. |
| `REST_API_PORT` | bridge | required | `3000` | Port the REST API listens on. |
| `BRIDGE_URL` | dashboard | required | `http://<bridge service>.railway.internal:3000` | Where the dashboard reaches the bridge (private network). |
| `BRIDGE_TOKEN` | dashboard | required | `${{<bridge service>.REST_API_TOKEN}}` | Must equal the bridge's `REST_API_TOKEN`. |
| `AUTH_DISCORD_ID` | dashboard | required | Application ID | Client ID of your Discord application. |
| `AUTH_DISCORD_SECRET` | dashboard | required | Client Secret | Lets the dashboard confirm who logged in. |
| `AUTH_SECRET` | dashboard | required | random string | Signs the login cookie. The template generates it. |
| `AUTH_TRUST_HOST` | dashboard | required | `true` | Lets the login work behind Railway's proxy. |

## Turning features off

The Features page lists the bridge's features in groups. Only the owner can switch features. Slash commands you switch off disappear from Discord within about a minute. `/setup` and `/help` always stay on.

## Troubleshooting

- **Discord says `Invalid OAuth2 redirect_uri`:** add `https://<your dashboard domain>/api/auth/callback/discord` under OAuth2 → Redirects in the Developer Portal.
- **"Your Discord account is not the owner and does not have the staff role.":** check `OWNER_ID` is your Discord user ID, or give your account the role set in `STAFF_ROLE_ID`.
- **"The bridge is offline, so your access can't be checked. Try again in a minute.":** the bridge is down or restarting.
- **Banner "Bridge offline: can't reach the bridge. Check BRIDGE_URL and that the bridge is running.":** the bridge service is down, or `BRIDGE_URL` is wrong.
- **Banner "Bridge API rejected the token: check BRIDGE_TOKEN matches the bridge's REST_API_TOKEN.":** make `BRIDGE_TOKEN` equal the bridge's `REST_API_TOKEN`.
- **Banner "Dashboard API is off: set DASHBOARD_API=true on the bridge.":** add that variable to the bridge and redeploy it.
- **Login loops back with `error=Configuration`:** `AUTH_SECRET` is missing, or `BRIDGE_URL` or `BRIDGE_TOKEN` is missing. Check the dashboard's logs: the dashboard names a missing bridge variable there at startup.

## Cost

About \$1–2/month extra. One guild with the dashboard costs about \$5–6/month (just over the Hobby plan's \$5 included usage). You can delete the dashboard service at any time; the bridge keeps working.
