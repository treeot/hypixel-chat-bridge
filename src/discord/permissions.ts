import { GatewayIntentBits, PermissionFlagsBits, PermissionsBitField } from 'discord.js'

/** Only GuildMembers is needed: DMs, reactions, webhooks and attachments are REST-only; mention resolution reads the member cache it keeps populated. */
export const GATEWAY_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMembers
] as const

export const PRIVILEGED_INTENTS = ['Server Members Intent', 'Message Content Intent'] as const

export const BOT_PERMISSIONS = [
  { flag: 'ViewChannel', label: 'View Channels', reason: 'See the bridged channels.' },
  { flag: 'SendMessages', label: 'Send Messages', reason: 'Relay chat and reply to commands.' },
  { flag: 'EmbedLinks', label: 'Embed Links', reason: 'Embed format, event embeds and command replies.' },
  { flag: 'AttachFiles', label: 'Attach Files', reason: 'Image format (rendered chat PNGs).' },
  { flag: 'ReadMessageHistory', label: 'Read Message History', reason: 'React to messages and resolve the message a reply points to.' },
  { flag: 'AddReactions', label: 'Add Reactions', reason: 'Delivery-failure reactions such as ⛔, ✂️ and ⏸️.' },
  { flag: 'ManageWebhooks', label: 'Manage Webhooks', reason: 'Webhook format (the default). Without it the channel falls back to embeds.' },
  { flag: 'ManageRoles', label: 'Manage Roles', reason: 'Optional verified role.' },
  { flag: 'ManageNicknames', label: 'Manage Nicknames', reason: 'Optional nickname template on verify.' }
] as const satisfies readonly { flag: keyof typeof PermissionFlagsBits; label: string; reason: string }[]

export function permissionsInteger(): string {
  return new PermissionsBitField(BOT_PERMISSIONS.map(p => PermissionFlagsBits[p.flag])).bitfield.toString()
}

export function inviteUrl(clientId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot+applications.commands&permissions=${permissionsInteger()}`
}
