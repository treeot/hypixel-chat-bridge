import type { APIEmbed } from 'discord.js'
import type { EventStanding } from '../../services/guildlbEvents'

const DEFAULT_TOP = 10
const COLOURS = { active: 0x2ecc71, finalized: 0x95a5a6, cancelled: 0xe74c3c, other: 0x3498db } as const

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function remaining(endAt: string, now: number): string {
  const ms = Date.parse(endAt) - now
  if (!Number.isFinite(ms) || ms <= 0) return 'ending now'
  const mins = Math.floor(ms / 60_000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

function statusText(status: string, endAt: string, now: number): string {
  if (status === 'active') return remaining(endAt, now)
  if (status === 'cancelled') return 'cancelled'
  if (status === 'finalized') return 'ended'
  return status
}

function guildsOf(standing: EventStanding) {
  return Array.isArray(standing.guilds) ? standing.guilds : []
}

function membersOf(standing: EventStanding) {
  return Array.isArray(standing.members) ? standing.members : []
}

/** Stable across ticks unless a visible number changes, so unchanged boards are never re-edited. */
export function eventSignature(standing: EventStanding, top = DEFAULT_TOP): string {
  return JSON.stringify({
    s: standing.event?.status,
    g: guildsOf(standing).map(g => [g.id, g.points]),
    m: topMembers(standing, top).map(m => [m.uuid, m.points])
  })
}

function topMembers(standing: EventStanding, top: number) {
  return [...membersOf(standing)].sort((a, b) => b.points - a.points).slice(0, top)
}

export function renderEventEmbed(standing: EventStanding, opts: { top?: number; now?: number } = {}): APIEmbed {
  const top = opts.top ?? DEFAULT_TOP
  const now = opts.now ?? Date.now()
  const { event } = standing
  const guilds = guildsOf(standing)

  let standingLines: string[]
  if (guilds.length >= 2) {
    const sorted = [...guilds].sort((a, b) => b.points - a.points)
    const tied = sorted[0].points === sorted[1].points
    standingLines = sorted.map((g, i) => `${i === 0 && !tied ? '**[Leading]** ' : ''}${g.name}: ${fmt(g.points)} points`)
  } else {
    standingLines = guilds.map(g => `${g.name}: ${fmt(g.points)} points`)
  }

  const board = topMembers(standing, top)
  const boardLines = board.length ? board.map((m, i) => `${i + 1}. ${m.name}: ${fmt(m.points)}`) : ['No points yet.']

  const colour = event.status in COLOURS ? COLOURS[event.status as keyof typeof COLOURS] : COLOURS.other
  return {
    title: event.name,
    description: `${event.mode} | ${event.status} | ${statusText(event.status, event.endAt, now)}`,
    color: colour,
    fields: [
      { name: guilds.length >= 2 ? 'Guild standings' : 'Guild', value: standingLines.join('\n') || 'No data.' },
      { name: `Top ${top} members`, value: boardLines.join('\n') }
    ],
    footer: { text: `as of ${standing.asOf}` }
  }
}
