import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const guildlbArea = flatArea({
  id: 'guildlb',
  label: 'GuildLB',
  emoji: '🏆',
  description:
    'The default for the `alliance` option on `/blacklist add` and `/blacklist remove`. With it on, they also update your guild’s GuildLB alliance blacklist unless staff pass `alliance: false`. It needs `GUILDLB_GUILD_KEY` in the environment; without it nothing is sent.',
  specs: (): FieldSpec[] => [{ kind: 'toggle', key: 'syncBlacklist', label: 'Share /blacklist with the alliance by default' }]
})
