import { FILTER_CATEGORIES, FILTER_LABELS } from '../../settings/filters'
import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const filtersArea = flatArea({
  id: 'filters',
  label: 'Chat filters',
  emoji: '🛡️',
  description:
    'Everything the bot says in game passes these filters, and a blocked message is never sent. Allowed words override profanity and advertising hits.',
  specs: (): FieldSpec[] => [
    ...FILTER_CATEGORIES.map((category): FieldSpec => ({ kind: 'toggle', key: `categories.${category}`, label: FILTER_LABELS[category] })),
    { kind: 'words', key: 'blockedWords', label: 'Extra blocked words' },
    { kind: 'words', key: 'allowedWords', label: 'Allowed words (override profanity/ads)' }
  ],
  effects: [{ kind: 'refreshSafety' }]
})
