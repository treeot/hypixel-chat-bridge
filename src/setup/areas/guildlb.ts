import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const guildlbArea = flatArea({
  id: 'guildlb',
  label: 'GuildLB',
  emoji: '🏆',
  description:
    'Share: the default for the `alliance` option on `/blacklist add` and `/blacklist remove`. With it on, they also update your guild’s GuildLB alliance blacklist unless staff pass `alliance: false`.\nScammer check: join requests, Apply, `/invite` and waitlist invites are also checked against the GuildLB scammer list (SkyBlockZ plus alliance scam entries). A flagged player is held for staff, or denied with join-request auto-deny on; the local whitelist overrides it.\nBoth need `GUILDLB_GUILD_KEY` in the environment; without it nothing is sent or checked.',
  specs: (): FieldSpec[] => [
    { kind: 'toggle', key: 'syncBlacklist', label: 'Share /blacklist with the alliance by default' },
    { kind: 'toggle', key: 'scammerCheck', label: 'Check join requests against the GuildLB scammer list' }
  ]
})
