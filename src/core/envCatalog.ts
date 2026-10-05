/** Documentation only: env.ts is the sole reader of the environment; test/env-catalog.test.ts keeps the two in sync. */
export type EnvGroup = 'required' | 'discord' | 'minecraft' | 'accounts' | 'storage' | 'restApi' | 'guildlb' | 'runtime' | 'platform'

export interface EnvVarDoc {
  name: string
  group: EnvGroup
  required: boolean
  readBy: 'bridge' | 'node' | 'railway'
  default?: string
  secret?: boolean
  description: string
}

export const ENV_GROUP_NOTES: Partial<Record<EnvGroup, string>> = {
  accounts: "The first login of each account DMs a Microsoft device code to OWNER_ID; the tokens are stored in the database, so redeploys don't ask again."
}

export const ENV_GROUPS: Record<EnvGroup, string> = {
  required: 'Required',
  discord: 'Discord',
  minecraft: 'Hypixel and Minecraft',
  accounts: 'Multiple guilds (accounts and relay groups)',
  storage: 'Storage',
  restApi: 'REST API',
  guildlb: 'GuildLB (optional)',
  runtime: 'Runtime',
  platform: 'Set by the platform'
}

export const ENV_VARS: readonly EnvVarDoc[] = [
  {
    name: 'DISCORD_TOKEN',
    group: 'required',
    required: true,
    readBy: 'bridge',
    secret: true,
    description: 'Discord bot token (Developer Portal → your application → Bot → Reset Token).'
  },
  {
    name: 'OWNER_ID',
    group: 'required',
    required: true,
    readBy: 'bridge',
    description: 'Your Discord user ID. Runs `/setup`, receives Microsoft sign-in codes and outage alerts by DM.'
  },
  { name: 'GUILD_CHANNEL_ID', group: 'required', required: true, readBy: 'bridge', description: 'Discord channel bridged to guild chat for account 1.' },

  {
    name: 'OFFICER_CHANNEL_ID',
    group: 'discord',
    required: false,
    readBy: 'bridge',
    description: 'Discord channel bridged to officer chat for account 1. Officer relay is off when unset.'
  },
  {
    name: 'STAFF_ROLE_ID',
    group: 'discord',
    required: false,
    readBy: 'bridge',
    description: 'Role allowed to run staff commands. When unset, staff commands are owner-only.'
  },
  {
    name: 'DISCORD_SERVER_ID',
    group: 'discord',
    required: false,
    readBy: 'bridge',
    description:
      'Restrict the bot to one Discord server and publish slash commands there instantly. Interactions and messages from any other server are ignored.'
  },
  { name: 'LOG_CHANNEL_ID', group: 'discord', required: false, readBy: 'bridge', description: 'Channel for error and alert logs.' },

  {
    name: 'HYPIXEL_API_KEY',
    group: 'minecraft',
    required: false,
    readBy: 'bridge',
    secret: true,
    description:
      'Hypixel API key, sent only as the `API-Key` header. Without it, live stat commands, join requirements, GEXP, verify/link and Apply reply with a one-line notice naming this variable.'
  },
  {
    name: 'MINECRAFT_HOST',
    group: 'minecraft',
    required: false,
    readBy: 'bridge',
    default: 'mc.hypixel.net',
    description: 'Server the Minecraft accounts connect to.'
  },

  {
    name: 'RELAY_GROUP',
    group: 'accounts',
    required: false,
    readBy: 'bridge',
    description: 'Relay group of account 1. Accounts with the same group share guild and officer chat across guilds.'
  },
  {
    name: 'ACCOUNT_LABEL',
    group: 'accounts',
    required: false,
    readBy: 'bridge',
    default: 'G1',
    description: 'Short label for account 1 (max 16 characters), shown on lines relayed to other guilds.'
  },
  {
    name: 'ACCOUNT_<n>_GUILD_CHANNEL_ID',
    group: 'accounts',
    required: false,
    readBy: 'bridge',
    description: 'Guild chat channel of account n (2 ≤ n ≤ 99). Setting it adds the account, and it is required for every extra account.'
  },
  { name: 'ACCOUNT_<n>_OFFICER_CHANNEL_ID', group: 'accounts', required: false, readBy: 'bridge', description: 'Officer chat channel of account n.' },
  { name: 'ACCOUNT_<n>_RELAY_GROUP', group: 'accounts', required: false, readBy: 'bridge', description: 'Relay group of account n.' },
  { name: 'ACCOUNT_<n>_LABEL', group: 'accounts', required: false, readBy: 'bridge', default: 'G<n>', description: 'Label of account n (max 16 characters).' },

  {
    name: 'DATABASE_URL',
    group: 'storage',
    required: false,
    readBy: 'bridge',
    secret: true,
    description:
      '`mongodb://`, `mongodb+srv://`, `postgres://` or `postgresql://` URL. Unset: SQLite at `./data/bridge.db`, or on the Railway Volume. See docs/storage.md.'
  },

  {
    name: 'REST_API_TOKEN',
    group: 'restApi',
    required: false,
    readBy: 'bridge',
    secret: true,
    description: 'Enables the REST API. At least 16 characters; clients send `Authorization: Bearer <token>`. See [REST API](rest-api.md).'
  },
  { name: 'REST_API_PORT', group: 'restApi', required: false, readBy: 'bridge', default: '3000', description: 'Port the REST API listens on.' },

  {
    name: 'GUILDLB_API_KEY',
    group: 'guildlb',
    required: false,
    readBy: 'bridge',
    secret: true,
    description: 'GuildLB website-api key: stored networth for `!nw` when there is no Hypixel key.'
  },
  {
    name: 'GUILDLB_GUILD_KEY',
    group: 'guildlb',
    required: false,
    readBy: 'bridge',
    secret: true,
    description: 'GuildLB guild-api key bound to your guild: alliance blacklist checks and `/alliance`. Must differ from `GUILDLB_API_KEY`.'
  },
  {
    name: 'GUILDLB_API_URL',
    group: 'guildlb',
    required: false,
    readBy: 'bridge',
    default: 'https://guildlb.com',
    description: 'GuildLB base URL. https only, with no query string or credentials.'
  },

  { name: 'LOG_LEVEL', group: 'runtime', required: false, readBy: 'bridge', default: 'info', description: 'One of `debug`, `info`, `warn`, `error`.' },
  {
    name: 'NODE_OPTIONS',
    group: 'runtime',
    required: false,
    readBy: 'node',
    default: '--max-old-space-size=256',
    description:
      'Node.js flags. Must be set in the process environment (Docker, Compose, Railway), not in `.env`, because Node reads it before the bridge starts. Preset in the Docker image, docker-compose.yml and the Railway template.'
  },

  {
    name: 'RAILWAY_ENVIRONMENT',
    group: 'platform',
    required: false,
    readBy: 'bridge',
    description: 'Older Railway environment marker. Any Railway marker turns on the "SQLite needs a Volume" guard.'
  },
  {
    name: 'RAILWAY_ENVIRONMENT_NAME',
    group: 'platform',
    required: false,
    readBy: 'bridge',
    description: 'Set by Railway. Marks the process as running on Railway.'
  },
  {
    name: 'RAILWAY_ENVIRONMENT_ID',
    group: 'platform',
    required: false,
    readBy: 'bridge',
    description: 'Set by Railway. Marks the process as running on Railway.'
  },
  { name: 'RAILWAY_PROJECT_ID', group: 'platform', required: false, readBy: 'bridge', description: 'Set by Railway. Marks the process as running on Railway.' },
  {
    name: 'RAILWAY_VOLUME_MOUNT_PATH',
    group: 'platform',
    required: false,
    readBy: 'bridge',
    description: 'Set by Railway when a Volume is attached. The SQLite file goes to `<path>/bridge.db`.'
  },
  {
    name: 'RAILWAY_RUN_UID',
    group: 'platform',
    required: false,
    readBy: 'railway',
    default: '0',
    description:
      'Read by Railway, not the bridge: the uid the container runs as. The template sets `0` because Railway mounts Volumes as root (docs.railway.com/volumes#permissions).'
  }
]
