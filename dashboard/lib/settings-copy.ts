import type { AreaId } from '@bridge/settings/registry'
import { FILTER_LABELS } from '@bridge/settings/filters'
import { RULE_HINTS, RULE_LABELS } from '@bridge/settings/joinRequests'
import { DEFAULT_TEMPLATES } from '@bridge/discord/renderers/settings'
import { pathMatches } from './form-options'

/** Sidebar grouping of the settings areas. An area missing here lands in a trailing "Other" group. */
export const AREA_GROUPS: { title: string; areas: AreaId[] }[] = [
  { title: 'Bot', areas: ['features', 'accounts', 'formats', 'commands'] },
  { title: 'Members', areas: ['ranks', 'joinRequests', 'gexp', 'verify'] },
  { title: 'Alliance & safety', areas: ['filters', 'guildlb'] },
  { title: 'Dashboard', areas: ['branding'] }
]

/** Areas left out of the settings sidebar: Chat relay's two switches live on Features, and /settings/relay goes there. */
export const HIDDEN_AREAS: AreaId[] = ['relay']

/** One line under each settings page title. */
export const AREA_DESCRIPTIONS: Partial<Record<AreaId, string>> = {
  accounts: 'The Minecraft accounts the bot signs in with, and the Discord channels each one relays to.',
  relay: 'Which in-game chats are copied to Discord and back.',
  formats: 'How relayed messages and guild events look in Discord.',
  ranks: 'Guild ranks per account, used by promote, demote and set rank.',
  commands: 'The prefix for in-game commands and which ones members can use.',
  joinRequests: 'Requirements applicants must meet, and what happens when they do or don’t.',
  gexp: 'Weekly guild experience tracking and the minimum members should earn.',
  filters: 'What the bot won’t say in game: these filters check every message it sends there.',
  verify: 'The roles and nickname given to members who link their Minecraft account.',
  guildlb: 'Checks against the shared GuildLB alliance list.',
  features: 'Turn whole features and commands on or off. Switches save as soon as you flip them.',
  branding: 'The name, logo, colour and login text shown on this dashboard.'
}

/**
 * Words shown for one settings field. `label` names it, `help` is one line under the label,
 * `placeholder` fills an empty input, `unit` sits after the input (e.g. "days"), and
 * `options` names an enum's values (value → shown text). Write for guild staff, not developers.
 */
export interface FieldCopy {
  label: string
  help?: string
  placeholder?: string
  unit?: string
  options?: Record<string, string>
  /** Replaces "Enter a number" and the like when the field holds the wrong kind of value, e.g. a half-typed colour. */
  invalid?: string
}

const MODE_OPTIONS = {
  webhook: 'Webhook (looks like the player)',
  embed: 'Embed',
  plain: 'Plain text',
  image: 'Image (Minecraft font)'
}

const EVENT_LABELS: Record<string, string> = {
  login: 'Post logins',
  logout: 'Post logouts',
  join: 'Post member joins',
  leave: 'Post member leaves',
  kick: 'Post kicks',
  promote: 'Post promotions',
  demote: 'Post demotions',
  mute: 'Post mutes',
  unmute: 'Post unmutes',
  levelUp: 'Post guild level-ups',
  quest: 'Post guild quests',
  other: 'Post other guild events'
}

const TEMPLATE_LABELS: Record<keyof typeof DEFAULT_TEMPLATES, string> = {
  webhookName: 'Webhook name',
  webhookContent: 'Webhook message',
  embedAuthor: 'Embed author line',
  embedDescription: 'Embed text',
  embedFooter: 'Embed footer (optional)',
  plain: 'Plain text line'
}

const TEMPLATE_HELP = 'Leave blank to use the default.'

/** The format fields, shared by the All channels defaults (prefix '') and each channel override (prefix 'channels.*.'). */
function formatCopy(prefix: string): Record<string, FieldCopy> {
  const out: Record<string, FieldCopy> = {
    [`${prefix}mode`]: {
      label: 'Message style',
      help: "How relayed chat looks in Discord. Webhook needs the bot's Manage Webhooks permission.",
      options: MODE_OPTIONS
    },
    [`${prefix}templates`]: { label: 'Message templates', help: 'The text of each relayed line. Leave any blank to use the default.' },
    [`${prefix}events`]: { label: 'Guild events', help: 'Which guild events are posted to Discord.' },
    [`${prefix}embedTimestamp`]: {
      label: 'Show the time on embeds',
      help: 'Adds the time each message was sent under Embed-style messages and guild event embeds.'
    }
  }
  for (const [key, label] of Object.entries(TEMPLATE_LABELS)) {
    const help = key === 'plain' ? `${TEMPLATE_HELP} Discord formatting works: **bold**, *italic*.` : TEMPLATE_HELP
    out[`${prefix}templates.${key}`] = { label, help, placeholder: DEFAULT_TEMPLATES[key as keyof typeof DEFAULT_TEMPLATES] }
  }
  for (const [key, label] of Object.entries(EVENT_LABELS)) out[`${prefix}events.${key}`] = { label }
  return out
}

const WORD_HELP = 'Up to 32 characters each, 100 words at most.'

/**
 * Field copy per settings area, keyed by dotted path with `*` for any array index or record key
 * (`list.*.relayGroup`, `accounts.*.*.name`). Every field the generic form renders must have an
 * entry; test/settings-copy.test.ts fails otherwise. A `*`-ending entry names one item of a list
 * or record ("Account", "Rule") and is used in error messages like "Account #2 → Guild channel".
 * To add copy: put `'path': { label, help?, placeholder?, unit?, options? }` under the area.
 */
export const SETTINGS_COPY: Partial<Record<AreaId, Record<string, FieldCopy>>> = {
  accounts: {
    nextId: { label: 'Next account number' },
    list: { label: 'Accounts', help: 'The Minecraft accounts the bot signs in with.' },
    'list.*': { label: 'Account' },
    'list.*.id': { label: 'Account number' },
    'list.*.enabled': { label: 'On', help: 'Turn this account off to log it out without losing its settings.' },
    'list.*.label': { label: 'Label', help: 'Up to 16 characters, e.g. Main. Shown as the tag in relayed lines.', placeholder: 'e.g. Main' },
    'list.*.guildChannelId': { label: 'Guild chat channel', help: 'Discord channel that guild chat is copied to and from.' },
    'list.*.officerChannelId': { label: 'Officer chat channel (optional)', help: 'Discord channel that officer chat is copied to and from.' },
    'list.*.relayGroup': {
      label: 'Shared chat group (optional)',
      help: 'Give two accounts the same word, e.g. allies, and their guild chats are copied to each other. Leave blank to keep this guild separate.',
      placeholder: 'e.g. allies'
    }
  },
  relay: {
    guild: { label: 'Relay guild chat', help: 'Copy guild chat between Minecraft and Discord.' },
    officer: { label: 'Relay officer chat', help: 'Copy officer chat between Minecraft and Discord.' }
  },
  formats: {
    ...formatCopy(''),
    channels: { label: 'Channel overrides', help: 'Give a single Discord channel its own message style.' },
    'channels.*': { label: 'Channel' },
    ...formatCopy('channels.*.')
  },
  ranks: {
    accounts: { label: 'Ranks per account', help: 'The guild ranks of each account, used by promote, demote and set rank.' },
    'accounts.*': { label: 'Account' },
    'accounts.*.*': { label: 'Rank' },
    'accounts.*.*.name': { label: 'Rank name', help: 'Rank name exactly as in /g list, e.g. Officer.', placeholder: 'e.g. Officer' },
    'accounts.*.*.ingameTag': {
      label: 'Tag in game chat (optional)',
      help: 'The rank tag Hypixel shows, e.g. OFF. Leave blank if it matches the rank name.',
      placeholder: 'e.g. OFF'
    },
    'accounts.*.*.tag': { label: 'Tag shown in Discord', help: 'Short label before the name in relayed lines.' },
    'accounts.*.*.color': {
      label: 'Chat colour (optional)',
      help: 'Colour of the tag in Discord, like #55ffff. Leave blank for the default.',
      invalid: 'Enter a colour like #55ffff, or leave it blank'
    }
  },
  commands: {
    prefix: { label: 'Command prefix', help: '1 to 3 characters that start an in-game command, such as ! or .', placeholder: '!' },
    toggles: { label: 'Commands', help: "A command that's off is relayed as normal chat." },
    'toggles.*': { label: 'Command' }
  },
  joinRequests: {
    enabled: { label: 'Join requirements on', help: 'Check applicants against these requirements.' },
    mode: { label: 'Applicants must meet', options: { all: 'All rules', any: 'Any one rule' } },
    rules: { label: 'Rules', help: 'Requirements an applicant is checked against.' },
    'rules.*': { label: 'Rule' },
    'rules.*.type': { label: 'Requirement', options: { ...RULE_LABELS } },
    'rules.*.min': { label: 'Minimum', help: `You can write 1.5k, 2m or 1.5b, e.g. ${RULE_HINTS.networth.replace('e.g. ', '')} networth.` },
    autoAccept: { label: 'Auto-accept players who meet them', help: 'Accept applicants who meet the rules without staff review.' },
    autoDeny: { label: 'Auto-deny players who do not', help: 'Decline applicants who miss the rules without staff review.' },
    capacity: {
      label: 'Guild capacity',
      help: 'Members the guild can hold before applicants join the waitlist. Hypixel max is 125.',
      placeholder: '125',
      unit: 'members'
    },
    waitlist: { label: 'Waitlist players when the guild is full', help: 'Queue qualified applicants until a spot opens.' },
    kickUnqualifiedOnJoin: {
      label: 'Kick members who join without meeting them',
      help: 'Careful: kicks anyone who joins without meeting the rules, including people invited by staff.'
    },
    ranks: { label: 'Starting rank by SkyBlock level', help: 'New members get the highest rank whose minimum SkyBlock level they reach.' },
    'ranks.*': { label: 'Starting rank' },
    'ranks.*.name': { label: 'Guild rank', help: 'In-game guild rank to give, e.g. Elite.', placeholder: 'e.g. Elite' },
    'ranks.*.minLevel': { label: 'Minimum SkyBlock level', placeholder: 'e.g. 300' },
    waitlistNotifyChannelId: { label: 'Waitlist notifications channel', help: 'Where the bot tells staff a spot opened for a waitlisted player.' },
    applyChannelId: { label: 'Apply button channel', help: 'Where the Apply button is posted.' },
    applyMessageId: { label: 'Apply button message' },
    applyPostedIn: { label: 'Apply button posted in' }
  },
  gexp: {
    enabled: { label: 'Weekly requirement on', help: 'Track weekly GEXP and list members below the requirement.' },
    weeklyRequirement: {
      label: 'Weekly GEXP needed',
      help: 'Guild experience a member should earn each week.',
      placeholder: 'e.g. 100000',
      unit: 'GEXP / week'
    },
    graceDays: { label: 'Grace period for new members', help: 'New members are exempt for this many days.', unit: 'days (0–30)' }
  },
  filters: {
    categories: { label: 'Filters', help: 'The kinds of message the bot stops.' },
    ...Object.fromEntries(Object.entries(FILTER_LABELS).map(([key, label]) => [`categories.${key}`, { label }])),
    blockedWords: { label: 'Extra blocked words', help: `Messages containing any of these are blocked. ${WORD_HELP}` },
    'blockedWords.*': { label: 'Blocked word' },
    allowedWords: { label: 'Allowed words', help: `Never flagged, even if they look like profanity or ads. ${WORD_HELP}` },
    'allowedWords.*': { label: 'Allowed word' }
  },
  verify: {
    roleId: { label: 'Verified role (optional)', help: 'Discord role given to members who link their Minecraft account.' },
    nicknameTemplate: {
      label: 'Nickname template (optional)',
      help: "{ign} becomes the player's Minecraft name. Discord limits nicknames to 32 characters.",
      placeholder: '{ign} | Guild'
    },
    rankRoles: {
      label: 'Rank roles (optional)',
      help: 'Give a verified member the Discord role that matches their current guild rank, on top of the verified role.'
    },
    'rankRoles.*': { label: 'Rank role' },
    'rankRoles.*.rank': { label: 'Guild rank', help: 'Rank name exactly as in /g list, e.g. Officer.', placeholder: 'e.g. Officer' },
    'rankRoles.*.roleId': { label: 'Discord role', help: 'Role given to members who hold this guild rank.' }
  },
  guildlb: {
    syncBlacklist: {
      label: 'Share /blacklist with the alliance by default',
      help: 'Players you blacklist are also added to the GuildLB list, unless you say otherwise.'
    },
    scammerCheck: { label: 'Check join requests against the GuildLB scammer list', help: 'Warn staff when an applicant is on the GuildLB list.' }
  },
  features: {
    verify: { label: 'Verify and link', help: 'The /verify and /link commands and related features.' },
    allianceChecks: { label: 'GuildLB alliance checks', help: 'Alliance checks and the /alliance command.' },
    slashCommands: { label: 'Slash commands', help: 'Discord slash commands that are switched off.' },
    'slashCommands.*': { label: 'Slash command' }
  },
  branding: {
    name: { label: 'Dashboard name', help: 'Shown in the top bar and the browser tab.', placeholder: 'Bridge Dashboard' },
    tagline: { label: 'Tagline', help: 'Short line next to the name on wide screens.' },
    logoUrl: {
      label: 'Logo link',
      help: 'Link to a square PNG or JPG starting with https://, e.g. a Discord image link.',
      placeholder: 'https://…/logo.png'
    },
    accent: { label: 'Accent colour', help: 'Used for highlights and switches. Pick one or type a hex code like #8b5cf6.', placeholder: '#8b5cf6' },
    loginText: { label: 'Login page text', help: 'Shown on the login card under the name.' }
  }
}

/**
 * The copy for one field. `path` is dotted and may be concrete (`list.0.label`, `channels.1234.mode`)
 * or already use `*`; an exact entry wins over a wildcard one.
 */
export function fieldCopy(area: AreaId, path: string): FieldCopy | undefined {
  const copy = SETTINGS_COPY[area]
  if (!copy) return undefined
  if (copy[path]) return copy[path]
  for (const [pattern, entry] of Object.entries(copy)) if (pathMatches(pattern, path)) return entry
  return undefined
}

// Areas the bot switches off without a key; their page says so and locks the form.
export const NEEDS_KEY: Partial<Record<AreaId, { key: 'hypixel' | 'guildlbGuild'; what: string; partly?: boolean }>> = {
  // Join requests still screen against the blacklist and GuildLB and post each request for staff, so the page stays editable.
  joinRequests: {
    key: 'hypixel',
    partly: true,
    what: "Without a Hypixel API key the bot can't check requirements, auto-accept or post the Apply button. Join requests are still posted for staff to check by hand, and the blacklist and GuildLB checks still run."
  },
  gexp: { key: 'hypixel', what: 'GEXP tracking needs a Hypixel API key' },
  verify: { key: 'hypixel', what: 'Verify needs a Hypixel API key to check players' },
  guildlb: { key: 'guildlbGuild', what: 'GuildLB needs a GuildLB key' }
}
