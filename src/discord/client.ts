import { ActivityType, Client } from 'discord.js'
import type { Env } from '../core/env'
import type { Logger } from '../core/logger'
import { boundary } from '../core/errors'
import { GATEWAY_INTENTS } from './permissions'

export interface DiscordClient {
  client: Client
  ready: Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

export function createDiscordClient(env: Env, log: Logger): DiscordClient {
  const client = new Client({
    intents: GATEWAY_INTENTS,
    presence: {
      status: 'idle',
      activities: [{ name: 'Starting...', type: ActivityType.Playing }]
    }
  })

  let resolveReady: () => void
  let rejectReady: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  client.once(
    'clientReady',
    boundary('discord:ready', log, async readyClient => {
      readyClient.user.setPresence({ activities: [{ name: 'Watching guild chat', type: ActivityType.Watching }], status: 'online' })
      log.info(`Discord client ready, logged in as ${readyClient.user.tag}`)
      resolveReady()
    })
  )

  client.on(
    'error',
    boundary('discord:client-error', log, error => {
      log.error('Discord client error', error)
    })
  )

  let shuttingDown = false

  return {
    client,
    ready,
    async start() {
      try {
        await client.login(env.discordToken)
      } catch (error) {
        rejectReady(error)
        throw error
      }
    },
    async stop() {
      if (shuttingDown) return
      shuttingDown = true
      client.destroy()
    }
  }
}
