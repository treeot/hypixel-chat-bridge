import type { AccountConfig, AccountId, Chat, DiscordApi, IncomingDiscordChat, RelayChat, RelayEvent, RenderInput, SendResult } from '../core/contracts'
import type { Logger } from '../core/logger'
import { channelFor, DEFAULT_RELAY_MARKER } from '../core/accounts'
import { DedupCache } from './dedup'

export interface RouterAccount {
  readonly config: AccountConfig
  sendChatAwait(chat: Chat, author: string, content: string): Promise<SendResult>
}

export type RouterDiscord = Pick<DiscordApi, 'postChat' | 'postEvent'>

export interface RouterOptions {
  marker: string
  dedupTtlMs: number
  now: () => number
  intercept?: (accountId: AccountId, payload: RelayChat) => Promise<boolean>
}

export function dedupKey(group: string, chat: Chat, sender: string, message: string): string {
  return [group, chat, sender.toLowerCase(), message.trim().replace(/\s+/g, ' ').toLowerCase()].join('\u0000')
}

export function renderInputFor(target: AccountConfig, payload: RelayChat, sourceLabel?: string): RenderInput {
  const input: RenderInput = {
    account: { id: String(target.id), label: target.label },
    kind: payload.chat,
    sender: payload.username,
    rank: payload.rank,
    guildRank: payload.guildRank,
    message: payload.message,
    imageUrl: payload.imageUrl
  }
  return sourceLabel ? { ...input, sourceLabel } : input
}

export class Router {
  private readonly opts: RouterOptions
  private readonly dedup: DedupCache

  constructor(
    private readonly accounts: () => readonly RouterAccount[],
    private readonly discord: RouterDiscord,
    private readonly log: Logger,
    opts: Partial<RouterOptions> = {}
  ) {
    this.opts = { marker: DEFAULT_RELAY_MARKER, dedupTtlMs: 10_000, now: Date.now, ...opts }
    this.dedup = new DedupCache(this.opts.dedupTtlMs, this.opts.now)
  }

  relayAuthor(source: AccountConfig, name: string): string {
    return `${this.opts.marker}[${source.label}] ${name}`
  }

  async onMinecraftChat(accountId: AccountId, payload: RelayChat): Promise<void> {
    // Our own lines (Discord echoes, command replies) and lines we relayed are never posted or relayed again.
    if (payload.self || payload.relayed) return
    const source = this.accounts().find(a => a.config.id === accountId)
    if (!source || !source.config.enabled) return
    if (await this.intercepted(accountId, payload)) return

    const group = source.config.relayGroup
    if (group && this.dedup.seen(dedupKey(group, payload.chat, payload.username, payload.message))) {
      this.log.debug('Dropped duplicate relay line', { accountId })
      return
    }

    const own = channelFor(source.config, payload.chat)
    if (own) await this.guarded(`Discord post for account ${accountId}`, () => this.discord.postChat(own, renderInputFor(source.config, payload)))
    await this.fanOut(source, payload, [own], [accountId])
  }

  async onMinecraftEvent(accountId: AccountId, event: RelayEvent): Promise<void> {
    const source = this.accounts().find(a => a.config.id === accountId)
    if (!source || !source.config.enabled) return
    const channel = channelFor(source.config, event.chat)
    if (channel) await this.guarded(`Discord event post for account ${accountId}`, () => this.discord.postEvent(channel, event))
  }

  async onDiscordChat(msg: IncomingDiscordChat): Promise<SendResult | void> {
    const owners = this.accounts().filter(a => a.config.enabled && channelFor(a.config, msg.chat) === msg.channelId)
    if (owners.length === 0) return undefined

    const results = await Promise.all(owners.map(owner => this.send(owner, msg.chat, msg.author, msg.content)))
    const ownerIds = owners.map(owner => owner.config.id)
    const relayedGroups = new Set<string>()
    for (const [i, owner] of owners.entries()) {
      const group = owner.config.relayGroup
      if (!results[i].ok || !group || relayedGroups.has(group)) continue
      relayedGroups.add(group)
      await this.fanOut(owner, { chat: msg.chat, username: msg.author, message: msg.content }, [msg.channelId], ownerIds)
    }
    return results.find(r => !r.ok) ?? results.find(r => r.truncated) ?? results[0]
  }

  private async fanOut(source: RouterAccount, payload: RelayChat, alreadyPosted: Array<string | undefined>, skip: AccountId[]): Promise<void> {
    const group = source.config.relayGroup
    if (!group) return
    const posted = new Set(alreadyPosted.filter((id): id is string => Boolean(id)))
    const peers = this.accounts().filter(a => a.config.enabled && a.config.relayGroup === group && !skip.includes(a.config.id))
    const author = this.relayAuthor(source.config, payload.username)

    await Promise.all(
      peers.map(async peer => {
        const peerId = peer.config.id
        const channel = channelFor(peer.config, payload.chat)
        // Checked and recorded synchronously, so peers sharing a channel post it once.
        if (channel && !posted.has(channel)) {
          posted.add(channel)
          await this.guarded(`Discord post for peer ${peerId}`, () => this.discord.postChat(channel, renderInputFor(peer.config, payload, source.config.label)))
        }
        const result = await this.send(peer, payload.chat, author, payload.message)
        if (!result.ok) {
          this.log.warn('Relay to peer failed', { from: source.config.id, to: peerId, reason: result.reason, filterReason: result.filterReason })
        }
      })
    )
  }

  /** A throwing command handler is logged and the line is treated as a normal chat line, so it is still relayed. */
  private async intercepted(accountId: AccountId, payload: RelayChat): Promise<boolean> {
    if (!this.opts.intercept) return false
    try {
      return await this.opts.intercept(accountId, payload)
    } catch (error) {
      this.log.error(`Router: in-game command handler for account ${accountId} failed`, error)
      return false
    }
  }

  private async send(account: RouterAccount, chat: Chat, author: string, content: string): Promise<SendResult> {
    try {
      return await account.sendChatAwait(chat, author, content)
    } catch (error) {
      this.log.error(`Send through account ${account.config.id} failed`, error)
      return { ok: false, reason: 'timeout' }
    }
  }

  private async guarded(scope: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn()
    } catch (error) {
      this.log.error(`Router: ${scope} failed`, error)
    }
  }
}
