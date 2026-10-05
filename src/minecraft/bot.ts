import { Bot, createBot as mineflayerCreateBot } from 'mineflayer'
import type { AuthCodeInfo } from '../core/contracts'
import type { CacheFactory } from './auth'

/** Callers must tear down the previous bot before reconnecting, or listeners leak. */
export interface CreateBotOptions {
  accountId: number
  host: string
  offline: boolean
  authCache?: CacheFactory
  onAuthCode: (info: AuthCodeInfo) => void
  onAuthMessage: (message: string) => void
}

export function createBot(opts: CreateBotOptions): Bot {
  const { accountId, host, offline, authCache, onAuthCode, onAuthMessage } = opts

  return mineflayerCreateBot({
    viewDistance: 'tiny',
    physicsEnabled: false,
    chatLengthLimit: 256,
    version: '1.8.9',
    auth: offline ? undefined : 'microsoft',
    username: offline ? `bridge${accountId}` : `account-${accountId}`,
    defaultChatPatterns: false,
    host,
    // minecraft-protocol types `profilesFolder` as `string | false` but passes it unchanged to prismarine-auth
    // (client/microsoftAuth.js:21), which accepts a cache factory function.
    profilesFolder: (authCache ?? './.minecraft/profiles') as unknown as string,
    onMsaCode: ({ user_code: code, verification_uri: link, expires_in, message }) => {
      onAuthCode({ code, link, expiresAt: Math.floor(Date.now() / 1000 + expires_in) })
      onAuthMessage(message)
    }
  })
}

export function destroyBot(bot: Bot | undefined): void {
  if (!bot) return
  try {
    bot.removeAllListeners()
    bot.end()
  } catch {
    // already ended
  }
}
