import { APIEmbed, DMChannel, Message, TextChannel } from 'discord.js'
import type {
  AccountConfig,
  AccountId,
  AuthCodeInfo,
  DiscordApi,
  IncomingDiscordChat,
  ModuleDeps,
  RelayEvent,
  RelayStatus,
  RenderInput,
  Chat,
  SendResult
} from '../core/contracts'
import { channelFor, chatForChannel } from '../core/accounts'
import { boundary } from '../core/errors'
import { inBotServer } from '../core/env'
import { describeError, flattenErrors } from '../core/logger'
import { createDiscordClient, DiscordClient } from './client'
import { discordWebhookChannels, WebhookResolver } from './webhooks'
import { Transport } from './transport'
import { FullEmbed } from './format'
import { RenderService, type RecentSenders } from './renderers'
import { DiscordSink } from './renderers/sink'
import { mentionLookup, replyName, toMinecraftText } from './clean'
import { REACT, reactionsFor } from './relayOutcome'
import { collapseRepeats } from '../safety'
import { isEnabled } from '../util/toggles'

export interface DiscordScope {
  readonly accountId: AccountId
  readonly client: DiscordClient['client']
  readonly ready: Promise<void>
  sendEmbed(chat: Chat, embed: import('discord.js').APIEmbed): Promise<void>
  forAccount(accountId: AccountId): DiscordScope
}

export class Discord implements DiscordApi {
  private readonly deps: ModuleDeps
  private readonly accounts: () => readonly AccountConfig[]
  private readonly dc: DiscordClient
  private webhooks?: WebhookResolver
  private readonly transport: Transport
  private readonly render: RenderService
  private chatHandler?: (payload: IncomingDiscordChat) => Promise<SendResult | void>

  constructor(deps: ModuleDeps, accounts: () => readonly AccountConfig[]) {
    this.deps = deps
    this.accounts = accounts
    this.dc = createDiscordClient(deps.env, deps.log)
    this.transport = new Transport(deps.log.child('transport'))
    this.render = new RenderService({
      loadSettings: () => deps.info.get('formats'),
      loadRanks: () => deps.info.get('ranks'),
      sink: new DiscordSink(this.dc.client, this.transport, () => this.webhooks),
      log: deps.log.child('render')
    })
  }

  async start(): Promise<void> {
    const { env, log } = this.deps

    this.dc.client.once(
      'clientReady',
      boundary('discord:warmup', log, async client => {
        this.webhooks = new WebhookResolver(discordWebhookChannels(client), client.user.id, log.child('webhooks'), client.user.avatarURL())

        const bridged = await Promise.all(this.bridgeChannelIds().map(async id => ((await this.render.formatFor(id)).mode === 'webhook' ? id : undefined)))
        const ids = [...bridged, env.logChannelId].filter((id): id is string => Boolean(id))
        await Promise.all(
          ids.map(id => this.webhooks!.resolve(id).catch(error => log.warn('Could not warm webhook cache', { channelId: id, error: String(error) })))
        )
      })
    )

    this.dc.client.on(
      'messageCreate',
      boundary('discord:messageCreate', log, message => this.handleMessage(message))
    )

    await this.dc.start()
    await this.dc.ready
  }

  async stop(): Promise<void> {
    await this.dc.stop()
  }

  get client(): DiscordClient['client'] {
    return this.dc.client
  }

  get ready(): Promise<void> {
    return this.dc.ready
  }

  forAccount(accountId: AccountId): DiscordScope {
    const dc = this.dc
    return {
      accountId,
      get client() {
        return dc.client
      },
      get ready() {
        return dc.ready
      },
      sendEmbed: (chat, embed) => this.sendEmbedTo(accountId, chat, embed),
      forAccount: id => this.forAccount(id)
    }
  }

  async sendEmbedTo(accountId: AccountId, chat: Chat, embed: import('discord.js').APIEmbed): Promise<void> {
    await this.sendToChat(accountId, chat, { embeds: [embed] })
  }

  /** Bypasses Transport so a failed error notification cannot recursively log another error. */
  async sendErrorLog(message: string, error?: unknown, meta?: Record<string, unknown>): Promise<void> {
    const channelId = this.deps.env.logChannelId
    if (!channelId || !this.webhooks) return

    const details = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : error ? String(error) : undefined
    const description = [message, details, meta && Object.keys(meta).length ? `Metadata: ${JSON.stringify(meta, flattenErrors)}` : undefined]
      .filter(Boolean)
      .join('\n')
      .slice(0, 4096)

    try {
      const webhook = await this.webhooks.resolve(channelId)
      await webhook.send({
        embeds: [
          {
            author: { name: 'Bridge Error' },
            description,
            color: 0xf04a47,
            timestamp: new Date().toISOString()
          } satisfies APIEmbed
        ],
        allowedMentions: { parse: [] }
      })
    } catch (notificationError) {
      console.error('[ERROR] Could not send error notification to Discord', describeError(notificationError))
    }
  }

  onChat(handler: (payload: IncomingDiscordChat) => Promise<SendResult | void>): void {
    this.chatHandler = handler
  }

  async postChat(channelId: string, input: RenderInput): Promise<void> {
    await this.dc.ready
    await this.render.postChat(channelId, input)
  }

  async postEvent(channelId: string, event: RelayEvent): Promise<void> {
    await this.dc.ready
    await this.render.postEvent(channelId, event)
  }

  get recentSenders(): RecentSenders {
    return this.render.recent
  }

  async relayStatus(accountId: AccountId, payload: RelayStatus): Promise<void> {
    const name = payload.online ? `Bridge is Online${payload.username ? ` as ${payload.username}` : ''}` : 'Bridge is Offline'
    const embed = FullEmbed(payload.online ? 'success' : 'failure', {
      author: { name: this.labelled(accountId, name) },
      timestamp: new Date().toISOString()
    })
    await this.sendToChat(accountId, 'guild', { embeds: [embed] })
  }

  /** DM the owner an auth code; falls back to a mention in the account's officer channel (never the public guild channel). */
  async sendAuthCode(accountId: AccountId, info: AuthCodeInfo): Promise<void> {
    await this.dc.ready
    const { env, log } = this.deps
    const client = this.dc.client

    const embed = FullEmbed('warning', {
      author: { name: this.labelled(accountId, 'Sign in to Minecraft'), icon_url: client.user?.avatarURL() ?? undefined },
      description: `Please go to ${info.link} and enter code \`${info.code}\` to authenticate account ${accountId}. This code will expire <t:${info.expiresAt}:R>.`
    })

    if (await this.dmOwner(embed)) return
    log.warn('Could not DM owner auth code, falling back to officer channel', { accountId })

    const officerId = this.channelFor(accountId, 'officer')
    const channel = officerId ? await client.channels.fetch(officerId).catch(() => null) : null
    if (channel && channel.isTextBased() && !channel.isDMBased()) {
      await this.transport.sendToChannel(channel as TextChannel, { embeds: [embed], content: `<@!${env.ownerId}>` })
    }
  }

  async sendAlert(accountId: AccountId, message: string): Promise<void> {
    await this.dc.ready
    const embed = FullEmbed('failure', {
      author: { name: this.labelled(accountId, 'Minecraft connection alert') },
      description: message,
      timestamp: new Date().toISOString()
    })
    const channelId = this.channelFor(accountId, 'officer') ?? this.channelFor(accountId, 'guild')
    const channel = channelId ? await this.dc.client.channels.fetch(channelId).catch(() => null) : null
    const post =
      channel && channel.isTextBased() && !channel.isDMBased() ? this.transport.sendToChannel(channel as TextChannel, { embeds: [embed] }) : Promise.resolve()
    await Promise.allSettled([post, this.dmOwner(embed)])
  }

  private async sendToChat(accountId: AccountId, chat: Chat, payload: { embeds: import('discord.js').APIEmbed[] }): Promise<void> {
    await this.dc.ready
    const channelId = this.channelFor(accountId, chat)
    if (!channelId) return
    const channel = await this.dc.client.channels.fetch(channelId).catch(error => {
      this.deps.log.error(`Could not fetch channel for ${chat} chat`, error)
      return null
    })
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return
    await this.transport.sendToChannel(channel as TextChannel, payload)
  }

  private async handleMessage(message: Message): Promise<void> {
    if (this.isIgnorableAuthor(message)) return
    if (!inBotServer(this.deps.env, message.guildId)) return

    // Resolved across every enabled account: a per-account officer channel maps to 'officer', a guild channel to 'guild'.
    const chat = chatForChannel(
      this.accounts().filter(a => a.enabled),
      message.channelId
    )
    if (!chat) return

    if (!(await this.isRelayEnabled(chat))) return

    const prefix = await this.resolvePrefix(message)
    const content = this.cleanContent(message)

    if (!content) {
      await this.react(message, REACT.empty)
      return
    }

    this.deps.log.debug('Relaying Discord message to Minecraft', { chat, author: prefix })
    const result = await this.chatHandler?.({ channelId: message.channelId, chat, author: prefix, content })

    for (const emoji of reactionsFor(result)) await this.react(message, emoji)
  }

  private isIgnorableAuthor(message: Message): boolean {
    if (message.author.bot || message.author.system || message.webhookId) return true
    if (this.dc.client.user && message.author.id === this.dc.client.user.id) return true
    if (message.content.startsWith('#')) return true
    return false
  }

  private account(accountId: AccountId): AccountConfig | undefined {
    return this.accounts().find(a => a.id === accountId)
  }

  private labelled(accountId: AccountId, text: string): string {
    if (this.accounts().length < 2) return text
    const account = this.account(accountId)
    return account ? `[${account.label}] ${text}` : text
  }

  private channelFor(accountId: AccountId, chat: Chat): string | undefined {
    const account = this.account(accountId)
    return account ? channelFor(account, chat) : undefined
  }

  private bridgeChannelIds(): string[] {
    const ids = this.accounts().flatMap(a => [a.guildChannelId, a.officerChannelId])
    return [...new Set(ids.filter((id): id is string => Boolean(id)))]
  }

  private async dmOwner(embed: import('discord.js').APIEmbed): Promise<boolean> {
    try {
      const user = await this.dc.client.users.fetch(this.deps.env.ownerId)
      await this.transport.send({ send: payload => user.send(payload as never) }, { embeds: [embed] })
      return true
    } catch (error) {
      this.deps.log.warn('Could not DM the owner', { error: String(error) })
      return false
    }
  }

  private async isRelayEnabled(chat: Chat): Promise<boolean> {
    const doc = await this.deps.info.get('chat')
    return isEnabled(doc, chat)
  }

  private cleanContent(message: Message): string {
    const text = toMinecraftText({
      content: message.content,
      lookup: mentionLookup(message.channel),
      attachments: [...message.attachments.values()],
      stickerCount: message.stickers.size
    })
    return collapseRepeats(text).trim()
  }

  private async react(message: Message, emoji: string): Promise<void> {
    await message.react(emoji).catch(() => undefined)
  }

  private async resolvePrefix(message: Message): Promise<string> {
    let prefix = message.member?.nickname ?? message.author.username

    if (message.reference?.messageId) {
      const replied = await (message.channel as TextChannel | DMChannel).messages.fetch(message.reference.messageId).catch(() => null)
      if (replied) {
        const target =
          this.recentSenders.get(replied.id) ??
          replyName({
            fromWebhook: Boolean(replied.webhookId),
            fromBot: replied.author.id === this.dc.client.user?.id,
            authorName: replied.author.username,
            displayName: replied.member?.nickname ?? replied.author.username,
            embedAuthor: replied.embeds[0]?.author?.name,
            content: replied.content
          })
        prefix += ` ➜ ${target}`
      }
    }

    return prefix
  }
}
