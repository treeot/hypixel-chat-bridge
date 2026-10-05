import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const guildlbArea = flatArea({
  id: 'guildlb',
  label: 'GuildLB',
  emoji: '🏆',
  description:
    'With sync on, `/blacklist add` and `/blacklist remove` also update your guild’s GuildLB alliance blacklist. It needs `GUILDLB_GUILD_KEY` in the environment; without it the setting does nothing.',
  specs: (): FieldSpec[] => [{ kind: 'toggle', key: 'syncBlacklist', label: 'Sync /blacklist to GuildLB' }]
})
