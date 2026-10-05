import type { SendResult } from '../core/contracts'
import type { BlockReason } from '../safety'

export const REACT = {
  empty: '❌',
  truncated: '✂️',
  failure: '⛔',
  offline: '❌',
  muted: '⏸️',
  filterReasons: { slurs: '🤬', profanity: '🤬', custom: '🤬', links: '🔗', advertising: '📢', personalInfo: '🔒' } satisfies Record<BlockReason, string>
} as const

export function reactionsFor(result: SendResult | void): string[] {
  if (!result) return []
  if (result.ok) return result.truncated ? [REACT.truncated] : []
  switch (result.reason) {
    case 'filtered':
      return result.filterReason ? [REACT.failure, REACT.filterReasons[result.filterReason]] : [REACT.failure]
    case 'muted':
      return [REACT.muted]
    case 'offline':
      return [REACT.failure, REACT.offline]
    default:
      return [REACT.failure]
  }
}
