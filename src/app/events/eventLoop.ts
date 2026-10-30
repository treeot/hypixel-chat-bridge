import type { EventAnnounceDeps, EventChannel } from './eventAnnounce'
import type { EventTransition } from './eventPoll'

/** How often each guild's events are polled: 15 minutes keeps scoreboards fresh without hammering the GuildLB API. */
export const EVENT_POLL_INTERVAL_MS = 15 * 60 * 1000

export interface EventLoopDeps {
  /** The configured announcement channel; undefined means this guild runs nothing. */
  readChannelId(): Promise<string | undefined>
  /** The Hypixel guild name, or undefined while it cannot be resolved. */
  resolveGuild(): Promise<string | undefined>
  makeChannel(channelId: string): EventChannel
  poll(guild: string): Promise<EventTransition[]>
  announce(transitions: EventTransition[], deps: Pick<EventAnnounceDeps, 'guild' | 'channel'>): Promise<void>
  log: { warn(message: string, meta?: Record<string, unknown>): void }
}

/** One poll and announce pass. Never throws. */
export async function tickEvents(deps: EventLoopDeps): Promise<void> {
  try {
    const channelId = await deps.readChannelId()
    if (!channelId) return
    const guild = await deps.resolveGuild()
    if (!guild) return
    const transitions = await deps.poll(guild)
    if (transitions.length === 0) return
    await deps.announce(transitions, { guild, channel: deps.makeChannel(channelId) })
  } catch (error) {
    deps.log.warn('Event poll failed', { error: String(error) })
  }
}

/** Starts the recurring tick without blocking; stop() clears it. A tick never overlaps the previous one. */
export function startEventLoop(deps: EventLoopDeps, intervalMs = EVENT_POLL_INTERVAL_MS): { stop(): void } {
  let running = false
  const timer = setInterval(() => {
    if (running) return
    running = true
    void tickEvents(deps).finally(() => {
      running = false
    })
  }, intervalMs)
  timer.unref?.()
  return { stop: () => clearInterval(timer) }
}
