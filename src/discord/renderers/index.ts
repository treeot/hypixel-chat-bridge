import type { RelayEvent, RenderInput } from '../../core/contracts'
import type { Logger } from '../../core/logger'
import { rankStyleFor, ranksSettings } from '../../settings/ranks'
import { Colours } from '../format'
import { WebhookUnavailableError } from '../webhooks'
import { embedRenderer } from './embed'
import { classifyEvent } from './events'
import { createImageRenderer } from './image'
import { plainRenderer } from './plain'
import { parseRenderSettings, resolveChannelFormat, type ChannelFormat, type RenderMode } from './settings'
import { NO_MENTIONS, RendererUnavailableError, type OutboundMessage, type Renderer, type RenderSink } from './types'
import { webhookRenderer } from './webhook'

/** messageId → Minecraft sender, so Discord replies can name the player. */
export class RecentSenders {
  private readonly map = new Map<string, string>()

  constructor(private readonly capacity = 1000) {}

  remember(messageId: string, sender: string): void {
    this.map.delete(messageId)
    this.map.set(messageId, sender)
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value as string)
  }

  get(messageId: string): string | undefined {
    return this.map.get(messageId)
  }
}

const WEBHOOK_FALLBACK_TEXT: Record<WebhookUnavailableError['reason'], string> = {
  'missing-permission': 'Webhook mode needs the Manage Webhooks permission in this channel; using embed mode until it is granted.',
  'no-channel': 'Webhook mode is not supported in this channel type; using embed mode.',
  'not-ready': 'Webhooks are not ready yet; using embed mode for now.',
  'create-failed': 'Could not create or use the relay webhook in this channel (is the 15-webhook limit reached?); using embed mode.'
}

export interface RenderServiceDeps {
  loadSettings(): Promise<unknown>
  loadRanks?(): Promise<unknown>
  sink: RenderSink
  log: Logger
  renderers?: Partial<Record<RenderMode, Renderer>>
}

/** Never throws: an unavailable mode falls back to embed. */
export class RenderService {
  readonly recent = new RecentSenders()
  private readonly renderers: Record<RenderMode, Renderer>
  private readonly warned = new Set<string>()

  constructor(private readonly deps: RenderServiceDeps) {
    this.renderers = { webhook: webhookRenderer, embed: embedRenderer, plain: plainRenderer, image: createImageRenderer(deps.log), ...deps.renderers }
  }

  async formatFor(channelId: string): Promise<ChannelFormat> {
    const doc = await this.deps.loadSettings().catch(error => {
      this.deps.log.warn('Could not load format settings; using defaults', { error: String(error) })
      return null
    })
    return resolveChannelFormat(parseRenderSettings(doc), channelId)
  }

  async postChat(channelId: string, input: RenderInput): Promise<void> {
    try {
      const styled = await this.styleGuildRank(input)
      const format = await this.formatFor(channelId)
      const messages = await this.renderChat(channelId, styled, format)
      for (const [index, message] of messages.entries()) {
        const id = await this.deliver(channelId, message, styled, format)
        if (index === 0 && id) this.recent.remember(id, styled.sender)
      }
    } catch (error) {
      this.deps.log.error('Could not relay a chat line to Discord', error, { channelId })
    }
  }

  private async styleGuildRank(input: RenderInput): Promise<RenderInput> {
    if (!input.guildRank || !this.deps.loadRanks) return input
    const doc = await this.deps.loadRanks().catch(error => {
      this.deps.log.warn('Could not load guild rank settings; using raw tags', { error: String(error) })
      return null
    })
    const style = rankStyleFor(ranksSettings.read(doc).accounts[input.account.id] ?? [], input.guildRank)
    return style ? { ...input, guildRank: style.tag, guildRankColor: style.color } : input
  }

  async postEvent(channelId: string, event: RelayEvent): Promise<void> {
    try {
      const format = await this.formatFor(channelId)
      if (!format.events[classifyEvent(event)]) return
      for (const message of this.renderers[format.mode].event(event)) await this.deps.sink.postAsBot(channelId, message)
    } catch (error) {
      this.deps.log.error('Could not relay a guild event to Discord', error, { channelId })
    }
  }

  private async renderChat(channelId: string, input: RenderInput, format: ChannelFormat): Promise<OutboundMessage[]> {
    try {
      return await this.renderers[format.mode].chat(input, format)
    } catch (error) {
      if (error instanceof RendererUnavailableError) {
        await this.warnOnce(`${channelId}:${format.mode}`, channelId, `${error.mode} mode is unavailable (${error.message}); using embed mode.`)
      } else {
        this.deps.log.error(`The ${format.mode} renderer failed; using embed mode`, error, { channelId })
      }
      return this.renderers.embed.chat(input, format)
    }
  }

  private async deliver(channelId: string, message: OutboundMessage, input: RenderInput, format: ChannelFormat): Promise<string | undefined> {
    if (message.via === 'bot') return this.deps.sink.postAsBot(channelId, message)
    try {
      return await this.deps.sink.postViaWebhook(channelId, message)
    } catch (error) {
      if (!(error instanceof WebhookUnavailableError)) throw error
      await this.warnOnce(`${channelId}:webhook:${error.reason}`, channelId, WEBHOOK_FALLBACK_TEXT[error.reason])
      const [fallback] = await this.renderers.embed.chat(input, format)
      return this.deps.sink.postAsBot(channelId, fallback)
    }
  }

  private async warnOnce(key: string, channelId: string, text: string): Promise<void> {
    if (this.warned.has(key)) return
    this.warned.add(key)
    this.deps.log.warn(text, { channelId })
    await this.deps.sink
      .postAsBot(channelId, { via: 'bot', embeds: [{ color: Colours.warning, description: `⚠️ ${text}` }], allowedMentions: NO_MENTIONS })
      .catch(() => undefined)
  }
}
