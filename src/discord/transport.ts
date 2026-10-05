import {
  AllowedMentionsTypes,
  DiscordAPIError,
  HTTPError,
  MessageCreateOptions,
  MessagePayload,
  RateLimitError,
  TextChannel,
  WebhookMessageCreateOptions
} from 'discord.js'
import type { Logger } from '../core/logger'
import { retry } from '../core/retry'

/** `allowedMentions` is always empty so relayed content never pings. Only transient failures (5xx, network, rate limits) retry. */

const NO_MENTIONS = { parse: [] as AllowedMentionsTypes[] }

const RETRY_OPTS = {
  attempts: 4,
  baseMs: 500,
  maxMs: 8_000,
  jitter: true
}

export const DISCORD_UNKNOWN_WEBHOOK = 10015
export const DISCORD_MISSING_PERMISSIONS = 50013

export function discordErrorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return typeof code === 'number' ? code : undefined
}

export function shouldRetry(error: unknown): boolean {
  if (discordErrorCode(error) === DISCORD_UNKNOWN_WEBHOOK) return false
  if (error instanceof DiscordAPIError) {
    // 4xx client errors will not fix themselves on retry.
    return error.status >= 500
  }
  if (error instanceof RateLimitError) return true
  if (error instanceof HTTPError) return true
  return true
}

export interface SendTarget {
  send(payload: MessageCreateOptions | MessagePayload | string): Promise<unknown>
}

export interface WebhookSendTarget {
  send(payload: WebhookMessageCreateOptions): Promise<unknown>
}

export type WebhookSendResult = { status: 'sent'; message: unknown } | { status: 'unknown-webhook' } | { status: 'dropped' }

export interface TransportOptions {
  onDropped?: (error: unknown) => void
}

export class Transport {
  constructor(
    private readonly log: Logger,
    private readonly opts: TransportOptions = {}
  ) {}

  async send(target: SendTarget, payload: MessageCreateOptions): Promise<unknown | undefined> {
    const withMentions: MessageCreateOptions = { ...payload, allowedMentions: NO_MENTIONS }
    try {
      return await retry(() => target.send(withMentions), {
        ...RETRY_OPTS,
        shouldRetry: error => shouldRetry(error),
        onRetry: (error, attempt, delayMs) => this.log.warn('Retrying Discord send', { attempt, delayMs, error: describeError(error) })
      })
    } catch (error) {
      this.log.error('Dropping Discord message after exhausting retries', error)
      this.opts.onDropped?.(error)
      return undefined
    }
  }

  async sendToChannel(channel: TextChannel, payload: MessageCreateOptions): Promise<unknown | undefined> {
    return this.send(channel, payload)
  }

  /** `unknown-webhook` means the webhook was deleted: forget it and re-resolve. */
  async sendToWebhookResult(
    webhook: WebhookSendTarget,
    payload: WebhookMessageCreateOptions,
    identity?: { username: string; avatarURL?: string }
  ): Promise<WebhookSendResult> {
    const body: WebhookMessageCreateOptions = { ...payload, allowedMentions: NO_MENTIONS, ...identity }
    try {
      const message = await retry(() => webhook.send(body), {
        ...RETRY_OPTS,
        shouldRetry: error => shouldRetry(error),
        onRetry: (error, attempt, delayMs) => this.log.warn('Retrying Discord webhook send', { attempt, delayMs, error: describeError(error) })
      })
      return { status: 'sent', message }
    } catch (error) {
      if (discordErrorCode(error) === DISCORD_UNKNOWN_WEBHOOK) return { status: 'unknown-webhook' }
      this.log.error('Dropping Discord webhook message after exhausting retries', error)
      this.opts.onDropped?.(error)
      return { status: 'dropped' }
    }
  }

  async sendToWebhook(
    webhook: WebhookSendTarget,
    payload: WebhookMessageCreateOptions,
    identity?: { username: string; avatarURL?: string }
  ): Promise<unknown | undefined> {
    const result = await this.sendToWebhookResult(webhook, payload, identity)
    return result.status === 'sent' ? result.message : undefined
  }
}

function describeError(error: unknown): string {
  if (error instanceof DiscordAPIError) return `DiscordAPIError ${error.status} ${error.code}`
  if (error instanceof Error) return error.message
  return String(error)
}
