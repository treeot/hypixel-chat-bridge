import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const motdArea = flatArea({
  id: 'motd',
  label: 'Message of the Day',
  emoji: '📣',
  description:
    'A message of the day for your guild. Set it, then press “Push to guild MOTD” to run /g motd in game (the bot must be online).',
  perAccount: true,
  specs: (): FieldSpec[] => [{ kind: 'text', key: 'message', label: 'Message of the day', maxLength: 128, optional: true, paragraph: true }],
  action: { label: 'Push to guild MOTD', build: accountId => ({ kind: 'pushMotd', accountId: accountId ?? 0 }) }
})
