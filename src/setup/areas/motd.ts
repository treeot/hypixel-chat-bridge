import type { FieldSpec } from '../fields'
import { MOTD_LINE_MAX, MOTD_MAX_LINES } from '../../settings/motd'
import { flatArea } from './flat'

export const motdArea = flatArea({
  id: 'motd',
  label: 'Message of the Day',
  emoji: '📣',
  description:
    'A message of the day for your guild: up to 5 lines, one per line of the box. & colour codes work (&a green, &l bold). Press “Push to guild MOTD” to set it in game (the bot must be online).',
  perAccount: true,
  specs: (): FieldSpec[] => [
    { kind: 'text', key: 'message', label: 'Message of the day', maxLength: MOTD_MAX_LINES * (MOTD_LINE_MAX + 1), optional: true, paragraph: true }
  ],
  action: { label: 'Push to guild MOTD', build: accountId => ({ kind: 'pushMotd', accountId: accountId ?? 0 }) }
})
