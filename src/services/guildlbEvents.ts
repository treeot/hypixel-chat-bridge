export interface EventGuildRef {
  id: string
  name: string
}

export interface EventSummary {
  id: string
  name: string
  mode: string
  status: string
  startAt: string
  endAt: string
  guildA: EventGuildRef
  guildB: EventGuildRef | null
}

export interface EventStanding {
  event: {
    id: string
    name: string
    guildA: string
    guildB: string
    startAt: string
    endAt: string
    mode: string
    status: string
    config: unknown
  }
  guilds: Array<{ id: string; name: string; points: number; updatedAt: string }>
  members: Array<{
    uuid: string
    name: string
    guildId: string
    profileId: string
    points: number
    deltas: Record<string, number>
    updatedAt: string
  }>
  asOf: string
}
