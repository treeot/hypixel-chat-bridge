import type { FieldSpec } from '../fields'
import { flatArea } from './flat'

export const gexpArea = flatArea({
  id: 'gexp',
  label: 'GEXP',
  emoji: '📈',
  description: 'With the requirement on, `/gexp` lists members below the weekly guild experience requirement. New members are exempt for the grace days.',
  perAccount: true,
  specs: (): FieldSpec[] => [
    { kind: 'toggle', key: 'enabled', label: 'Weekly requirement on' },
    { kind: 'number', key: 'weeklyRequirement', label: 'Weekly GEXP requirement', min: 0, max: 10_000_000, integer: true },
    { kind: 'number', key: 'graceDays', label: 'Grace days for new members', min: 0, max: 30, integer: true }
  ]
})
