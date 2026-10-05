import { NewsChannel, PermissionFlagsBits, TextChannel, type Client, type WebhookMessageCreateOptions } from 'discord.js'
import type { Logger } from '../core/logger'
import { discordErrorCode, DISCORD_MISSING_PERMISSIONS } from './transport'

/** Only webhooks this bot owns are used, never "first webhook in the channel". */

export const WEBHOOK_NAME = 'Hypixel Chat Bridge'

export interface WebhookLike {
  id: string
  name: string
  owner?: { id: string } | null
  send(payload: WebhookMessageCreateOptions): Promise<unknown>
}

export interface WebhookChannel {
  id: string
  canManageWebhooks(): boolean
  fetchWebhooks(): Promise<WebhookLike[]>
  createWebhook(opts: { name: string; avatar?: string | null; reason?: string }): Promise<WebhookLike>
}

export type WebhookUnavailableReason = 'missing-permission' | 'no-channel' | 'not-ready' | 'create-failed'

export class WebhookUnavailableError extends Error {
  constructor(
    readonly channelId: string,
    readonly reason: WebhookUnavailableReason,
    cause?: unknown
  ) {
    super(`Webhook unavailable in channel ${channelId}: ${reason}`, cause === undefined ? undefined : { cause })
    this.name = 'WebhookUnavailableError'
  }
}

function isMissingPermission(error: unknown): boolean {
  return discordErrorCode(error) === DISCORD_MISSING_PERMISSIONS || (error as { status?: unknown } | null)?.status === 403
}

function oldest(hooks: WebhookLike[]): WebhookLike | undefined {
  return [...hooks].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0))[0]
}

export class WebhookResolver {
  private readonly cache = new Map<string, WebhookLike>()
  private readonly ownedIds = new Map<string, string>()
  private readonly inflight = new Map<string, Promise<WebhookLike>>()

  constructor(
    private readonly getChannel: (channelId: string) => Promise<WebhookChannel | null>,
    private readonly botUserId: string,
    private readonly log: Logger,
    private readonly avatar?: string | null
  ) {}

  resolve(channelId: string): Promise<WebhookLike> {
    const cached = this.cache.get(channelId)
    if (cached) return Promise.resolve(cached)
    const pending = this.inflight.get(channelId)
    if (pending) return pending
    const lookup = this.lookup(channelId).finally(() => this.inflight.delete(channelId))
    this.inflight.set(channelId, lookup)
    return lookup
  }

  invalidate(channelId: string): void {
    this.cache.delete(channelId)
  }

  forget(channelId: string): void {
    this.cache.delete(channelId)
    this.ownedIds.delete(channelId)
  }

  ownedWebhookId(channelId: string): string | undefined {
    return this.ownedIds.get(channelId)
  }

  /** Any fetch/create failure means "no usable webhook": callers fall back to embed instead of dropping the line. */
  private unavailable(channelId: string, error: unknown): WebhookUnavailableError {
    return new WebhookUnavailableError(channelId, isMissingPermission(error) ? 'missing-permission' : 'create-failed', error)
  }

  private async lookup(channelId: string): Promise<WebhookLike> {
    const channel = await this.getChannel(channelId)
    if (!channel) throw new WebhookUnavailableError(channelId, 'no-channel')
    if (!channel.canManageWebhooks()) throw new WebhookUnavailableError(channelId, 'missing-permission')

    let hooks: WebhookLike[]
    try {
      hooks = await channel.fetchWebhooks()
    } catch (error) {
      throw this.unavailable(channelId, error)
    }

    const ours = hooks.filter(hook => hook.owner?.id === this.botUserId)
    const storedId = this.ownedIds.get(channelId)
    const named = ours.filter(hook => hook.name === WEBHOOK_NAME)
    if (named.length > 1) this.log.warn('Several bridge webhooks found; using the oldest', { channelId, count: named.length })
    let webhook = (storedId ? ours.find(hook => hook.id === storedId) : undefined) ?? oldest(named)

    if (!webhook) {
      try {
        webhook = await channel.createWebhook({ name: WEBHOOK_NAME, avatar: this.avatar, reason: 'Hypixel chat bridge relay' })
      } catch (error) {
        throw this.unavailable(channelId, error)
      }
      this.log.info('Created relay webhook', { channelId })
    }

    this.ownedIds.set(channelId, webhook.id)
    this.cache.set(channelId, webhook)
    return webhook
  }
}

export function discordWebhookChannels(client: Client<true>): (channelId: string) => Promise<WebhookChannel | null> {
  return async channelId => {
    const channel = await client.channels.fetch(channelId).catch(() => null)
    if (!(channel instanceof TextChannel) && !(channel instanceof NewsChannel)) return null
    return {
      id: channel.id,
      canManageWebhooks: () => channel.permissionsFor(client.user)?.has(PermissionFlagsBits.ManageWebhooks) ?? false,
      fetchWebhooks: async () => [...(await channel.fetchWebhooks()).values()],
      createWebhook: opts => channel.createWebhook(opts)
    }
  }
}
